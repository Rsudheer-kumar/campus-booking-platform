/**
 * CampusFlow - Preflight Port Checker
 * Checks if required ports (5000 for API, 3000 for Web) are already in use.
 * If in use, inspects the owning process and prints an actionable message.
 * NEVER kills processes.
 */

const { execSync } = require('child_process');
const net = require('net');

const PORTS_TO_CHECK = [
  { port: 5000, name: 'CampusFlow API' },
  { port: 3000, name: 'CampusFlow Web' },
];

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

  console.log('[CampusFlow Preflight Check] Ports 5000 and 3000 are available.');
}

main().catch((err) => {
  console.error('[CampusFlow Preflight Check] Error during port check:', err);
  process.exit(1);
});
