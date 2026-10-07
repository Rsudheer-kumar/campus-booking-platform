/**
 * CampusFlow - Preflight Port and MongoDB Checker
 * Checks required application ports and starts the configured local MongoDB
 * instance when it is stopped. Never kills arbitrary processes.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const API_ENV_PATH = path.join(PROJECT_ROOT, 'api', '.env');
const ROOT_ENV_PATH = path.join(PROJECT_ROOT, '.env');
const MONGODB_STARTUP_LOCK = path.join(os.tmpdir(), 'campusflow-mongodb-autostart.lock');

function readEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#')) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

const fileEnv = {
  ...readEnvFile(ROOT_ENV_PATH),
  ...readEnvFile(API_ENV_PATH),
};

function getEnv(name) {
  return process.env[name] || fileEnv[name];
}

const MONGODB_READY_TIMEOUT_MS = parseInt(getEnv('MONGODB_READY_TIMEOUT_MS'), 10) || 30000;
const MONGODB_POLL_INTERVAL_MS = 500;

const PORTS_TO_CHECK = [
  { port: 3000, name: 'CampusFlow Web' },
  { port: 5000, name: 'CampusFlow API' },
];

function getMongoConfig() {
  const uri = getEnv('MONGODB_URI') || 'mongodb://localhost:27017/campusflow';
  let host = 'localhost';
  let port = 27017;
  let databaseName = 'campusflow';
  let replicaSet = 'rs0';

  try {
    const parsed = new URL(uri);
    host = parsed.hostname || 'localhost';
    port = parseInt(parsed.port, 10) || 27017;
    databaseName = parsed.pathname.replace(/^\/+/, '') || 'campusflow';
    const rs = parsed.searchParams.get('replicaSet');
    if (rs) replicaSet = rs;
  } catch {
    const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^:/,?]+)(?::(\d+))?/);
    if (hostMatch) {
      host = hostMatch[1] || 'localhost';
      port = hostMatch[2] ? parseInt(hostMatch[2], 10) : 27017;
    }
    const dbMatch = uri.match(/\/([^/?]+)(?:\?|$)/);
    if (dbMatch) databaseName = dbMatch[1];
    const rsMatch = uri.match(/[?&]replicaSet=([^&]+)/);
    if (rsMatch) replicaSet = rsMatch[1];
  }

  return { uri, host, port, databaseName, replicaSet };
}

function isLocalDevelopment(config) {
  const nodeEnv = (getEnv('NODE_ENV') || 'development').toLowerCase();
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(config.host);
  return process.platform === 'win32' && nodeEnv !== 'production' && localHost;
}

function getMongoStartupConfig() {
  return {
    executable: getEnv('MONGOD_PATH') ||
      getEnv('MONGOD_EXECUTABLE') ||
      'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe',
    config: getEnv('MONGODB_CONFIG_PATH') ||
      getEnv('MONGOD_CONFIG') ||
      'C:\\Users\\subba\\mongodb-rs0\\mongod-rs0.conf',
  };
}

function checkTcpConnect(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let responded = false;

    const cleanup = () => {
      if (!responded) {
        responded = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });
    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });
    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function checkMongoTcpReachable(host, port) {
  if (host === 'localhost') {
    const v4 = await checkTcpConnect('127.0.0.1', port);
    if (v4) return true;
    const v6 = await checkTcpConnect('::1', port);
    return v6;
  }
  return checkTcpConnect(host, port);
}

async function getMongoReadiness(config) {
  let MongoClient;
  try {
    ({ MongoClient } = require(path.join(PROJECT_ROOT, 'api', 'node_modules', 'mongodb')));
  } catch (error) {
    try {
      const mongoose = require(path.join(PROJECT_ROOT, 'api', 'node_modules', 'mongoose'));
      MongoClient = mongoose.mongo.MongoClient;
    } catch {
      return {
        ready: false,
        reason: `MongoDB driver is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const client = new MongoClient(config.uri, {
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000,
  });

  try {
    await client.connect();
    const db = client.db(config.databaseName);
    await db.command({ ping: 1 });
    const hello = await db.command({ hello: 1 });
    const writablePrimary = Boolean(hello.isWritablePrimary ?? hello.ismaster);
    const setName = hello.setName || null;

    if (!writablePrimary) {
      return {
        ready: false,
        reason: `not a writable primary (replica set: ${setName || 'standalone'})`,
      };
    }
    if (setName !== config.replicaSet) {
      return {
        ready: false,
        reason: `replica set is ${setName || 'standalone'}, expected ${config.replicaSet}`,
      };
    }

    return {
      ready: true,
      databaseName: db.databaseName,
      replicaSet: setName,
      writablePrimary,
    };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function acquireMongoStartupLock() {
  try {
    const fd = fs.openSync(MONGODB_STARTUP_LOCK, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    return { fd, owner: true };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    try {
      const ownerPid = parseInt(fs.readFileSync(MONGODB_STARTUP_LOCK, 'utf8'), 10);
      process.kill(ownerPid, 0);
      return { fd: null, owner: false };
    } catch {
      fs.rmSync(MONGODB_STARTUP_LOCK, { force: true });
      return acquireMongoStartupLock();
    }
  }
}

function releaseMongoStartupLock(lock) {
  if (!lock.owner) return;
  if (lock.fd !== null) {
    try {
      fs.closeSync(lock.fd);
    } catch {
      // ignore
    }
  }
  fs.rmSync(MONGODB_STARTUP_LOCK, { force: true });
}

async function waitForMongoReady(config, timeoutMs = MONGODB_READY_TIMEOUT_MS, childTracker = null) {
  const deadline = Date.now() + timeoutMs;
  let lastReason = 'MongoDB has not responded yet';

  while (Date.now() < deadline) {
    if (childTracker && childTracker.exited) {
      throw new Error(
        `MongoDB process (PID ${childTracker.pid || 'unknown'}) exited prematurely with code ${childTracker.exitCode}. ` +
        `Check MongoDB logs for error details.`
      );
    }

    const readiness = await getMongoReadiness(config);
    if (readiness.ready) return readiness;
    lastReason = readiness.reason;
    await new Promise((resolve) => setTimeout(resolve, MONGODB_POLL_INTERVAL_MS));
  }

  throw new Error(`MongoDB readiness timed out after ${timeoutMs / 1000} seconds: ${lastReason}`);
}

async function ensureMongoReady(config) {
  // 1. Fast check if MongoDB is already listening and ready
  const isTcpReachable = await checkMongoTcpReachable(config.host, config.port);
  if (isTcpReachable) {
    const alreadyReady = await getMongoReadiness(config);
    if (alreadyReady.ready) {
      return { alreadyRunning: true, readiness: alreadyReady };
    }
    // Port is open, but MongoDB is not operating as expected writable primary
    throw new Error(
      `Port ${config.port} is already in use, but MongoDB is not ready: ${alreadyReady.reason}. ` +
      `Expected a writable primary in replica set "${config.replicaSet}".`
    );
  }

  // 2. Environment check: only auto-start on local development
  if (!isLocalDevelopment(config) || getEnv('MONGODB_AUTO_START') === 'false') {
    throw new Error(
      `MongoDB is not reachable at ${config.host}:${config.port}. ` +
      `Automatic startup is only enabled for local Windows development (MONGODB_AUTO_START=true).`
    );
  }

  // 3. Verify executable and config paths
  const startup = getMongoStartupConfig();
  if (!fs.existsSync(startup.executable)) {
    throw new Error(
      `MongoDB executable was not found: ${startup.executable}\n` +
      `Set MONGOD_PATH in api/.env to your local mongod.exe installation path.`
    );
  }
  if (!fs.existsSync(startup.config)) {
    throw new Error(
      `MongoDB configuration file was not found: ${startup.config}\n` +
      `Set MONGODB_CONFIG_PATH in api/.env to your local mongod.conf path.`
    );
  }

  // 4. Concurrency lock to avoid duplicate mongod spawns
  const lock = acquireMongoStartupLock();
  try {
    let childTracker = null;

    console.log('MongoDB is not reachable.');
    if (lock.owner) {
      console.log('Starting configured MongoDB instance...');

      const child = spawn(startup.executable, ['--config', startup.config], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      childTracker = {
        pid: child.pid,
        exited: false,
        exitCode: null,
      };

      child.on('exit', (code) => {
        if (childTracker) {
          childTracker.exited = true;
          childTracker.exitCode = code;
        }
      });

      child.on('error', (err) => {
        if (childTracker) {
          childTracker.exited = true;
          childTracker.exitCode = err.message;
        }
      });

      child.unref();
      console.log(`MongoDB process started (PID ${child.pid || 'unknown'}).`);
    } else {
      console.log('Another CampusFlow process is starting MongoDB; waiting for it.');
    }

    console.log('Waiting for MongoDB readiness...');
    const readiness = await waitForMongoReady(config, MONGODB_READY_TIMEOUT_MS, childTracker);
    return { alreadyRunning: false, readiness };
  } finally {
    releaseMongoStartupLock(lock);
  }
}

function getWindowsPortListener(port) {
  try {
    const psCommand = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`;
    const pidStr = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8' }).trim();
    const pid = parseInt(pidStr, 10);
    if (!pid || isNaN(pid)) return null;

    const procCommand = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -Property ProcessId, Name, CommandLine | Format-List`;
    const procInfo = execSync(`powershell -NoProfile -Command "${procCommand}"`, { encoding: 'utf8' }).trim();

    return { pid, details: procInfo };
  } catch {
    return null;
  }
}

async function checkPortAvailable(port) {
  if (process.platform === 'win32') {
    const listener = getWindowsPortListener(port);
    if (listener) {
      return { available: false, proc: listener };
    }
  }

  // Fallback / cross-platform check on default host
  const free = await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });

  return { available: free, proc: null };
}

async function main() {
  const conflicts = [];

  for (const { port, name } of PORTS_TO_CHECK) {
    const result = await checkPortAvailable(port);
    if (!result.available) {
      conflicts.push({ port, name, proc: result.proc });
    }
  }

  if (conflicts.length > 0) {
    console.error('\n[CampusFlow Preflight] Port conflicts detected:');
    for (const c of conflicts) {
      console.error(`\n  Port ${c.port} (${c.name}) is already in use.`);
      if (c.proc) {
        console.error(`  Owning Process ID (PID): ${c.proc.pid}`);
        if (c.proc.details) {
          console.error(`  Process Details:\n${c.proc.details}`);
        }
        console.error(`  Actionable resolution: Stop PID ${c.proc.pid} or run "Stop-Process -Id ${c.proc.pid}" in PowerShell yourself.`);
      } else {
        console.error(`  Actionable resolution: Identify and stop the process listening on port ${c.port}.`);
      }
    }
    console.error('\nPlease resolve the port conflicts above before running npm run dev.\n');
    process.exit(1);
  }

  console.log('[CampusFlow Preflight]');
  console.log('Ports 3000 and 5000 are available.');

  const mongoConfig = getMongoConfig();

  try {
    const { alreadyRunning, readiness } = await ensureMongoReady(mongoConfig);
    if (alreadyRunning) {
      console.log(`MongoDB is already available at ${mongoConfig.host}:${mongoConfig.port}.`);
      console.log('MongoDB readiness verified.');
      console.log(`Replica set: ${readiness.replicaSet}`);
      console.log(`Writable primary: ${readiness.writablePrimary}`);
    } else {
      console.log('MongoDB ready.');
      console.log(`Database: ${readiness.databaseName}`);
      console.log(`Replica set: ${readiness.replicaSet}`);
      console.log(`Writable primary: ${readiness.writablePrimary}`);
    }
    console.log('\nStarting CampusFlow API + Web...\n');
  } catch (error) {
    console.error('\n[CampusFlow Preflight] MongoDB startup failed.');
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Expected: database ${mongoConfig.databaseName}, port ${mongoConfig.port}, replica set ${mongoConfig.replicaSet}`);
    console.error('The API and Web will not start until MongoDB is ready.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[CampusFlow Preflight] Unexpected error:', err);
  process.exit(1);
});
