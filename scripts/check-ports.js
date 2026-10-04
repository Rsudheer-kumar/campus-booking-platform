/**
 * CampusFlow - Preflight Port Checker
 * Checks if required ports (5000 for API, 3000 for Web) are already in use.
 * If in use, inspects the owning process and prints an actionable message.
 * NEVER kills processes.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const PORTS_TO_CHECK = [
  { port: 5000, name: 'CampusFlow API' },
  { port: 3000, name: 'CampusFlow Web' },
];

function getMongoConfig() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    try {
      const envPath = path.resolve(__dirname, '../api/.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^MONGODB_URI=(.+)$/m);
        if (match) {
          uri = match[1].trim();
        }
      }
    } catch {
      // ignore
    }
  }

  uri = uri || 'mongodb://localhost:27017/campusflow';

  try {
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^:/]+)(?::(\d+))?/);
    if (match) {
      return {
        host: match[1] || 'localhost',
        port: match[2] ? parseInt(match[2], 10) : 27017,
      };
    }
  } catch {
    // ignore
  }

  return { host: 'localhost', port: 27017 };
}

function checkTcpConnect(host, port, timeoutMs = 1500) {
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

async function checkMongoReachability(host, port) {
  if (host === 'localhost') {
    // Check both 127.0.0.1 (IPv4 loopback) and ::1 (IPv6 loopback)
    const v4 = await checkTcpConnect('127.0.0.1', port);
    if (v4) return true;
    const v6 = await checkTcpConnect('::1', port);
    return v6;
  }
  return checkTcpConnect(host, port);
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
    console.error('\n[CampusFlow Preflight Check] Port conflicts detected:');
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

  // Authoritative preflight reachability check for MongoDB
  const { host, port } = getMongoConfig();
  const mongoReachable = await checkMongoReachability(host, port);
  if (!mongoReachable) {
    console.error('\n[CampusFlow Preflight]');
    console.error(`MongoDB is not available at ${host}:${port}.`);
    console.error('CampusFlow requires MongoDB before the API can start.');
    console.error('Expected: database campusflow, port 27017, replica set rs0');
    console.error('Start the configured MongoDB instance/service, then run: npm run dev\n');
    process.exit(1);
  }

  console.log('[CampusFlow Preflight Check] Ports 5000 and 3000 are available.');
  console.log(`[CampusFlow Preflight Check] MongoDB is reachable at ${host}:${port}.`);
}

main().catch((err) => {
  console.error('[CampusFlow Preflight Check] Error during port check:', err);
  process.exit(1);
});
