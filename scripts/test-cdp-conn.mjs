import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = join(tmpdir(), `chrome-test-${randomUUID()}`);

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9222',
  `--user-data-dir=${profileDir}`,
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

async function run() {
  await new Promise(r => setTimeout(r, 1500));
  try {
    const res = await fetch('http://localhost:9222/json/version');
    const version = await res.json();
    console.log('Connected to Chrome:', version.Browser);
  } finally {
    chrome.kill('SIGKILL');
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}

run();
