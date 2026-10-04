import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = join(tmpdir(), `chrome-prof-${randomUUID()}`);

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9222',
  `--user-data-dir=${profileDir}`,
  '--disable-gpu-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'about:blank',
], { stdio: 'ignore' });

async function run() {
  await new Promise(r => setTimeout(r, 1500));
  try {
    const versionRes = await fetch('http://localhost:9222/json/version');
    const version = await versionRes.json();
    console.log('Connected to Chrome:', version.Browser);

    const targetsRes = await fetch('http://localhost:9222/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();
    const networkRequests = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
      if (msg.method === 'Network.requestWillBeSent') {
        networkRequests.push({
          url: msg.params.request.url,
          timestamp: msg.params.timestamp,
          type: msg.params.type,
          wallTime: msg.params.wallTime,
        });
      }
      if (msg.method === 'Network.responseReceived') {
        const req = networkRequests.find(r => r.url === msg.params.response.url);
        if (req) {
          req.status = msg.params.response.status;
          req.mimeType = msg.params.response.mimeType;
          req.timing = msg.params.response.timing;
        }
      }
      if (msg.method === 'Network.loadingFinished') {
        const req = networkRequests.find(r => r.requestId === msg.params.requestId);
        if (req) {
          req.encodedDataLength = msg.params.encodedDataLength;
        }
      }
    };

    await new Promise(r => ws.onopen = r);

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Performance.enable');

    console.log('\n--- NAVIGATING COLD TO /dashboard WITH NETWORK INSTRUMENTATION ---');
    const navStartTime = performance.now();
    await send('Page.navigate', { url: 'http://localhost:3000/dashboard' });

    // Wait until critical dashboard HTML & container is visible
    const waitForEval = async (code, timeout = 15000) => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
        if (res.result && res.result.value) return { value: res.result.value, elapsed: performance.now() - start };
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('Timeout waiting for: ' + code);
    };

    const dashboardContent = await waitForEval(
      `Boolean(document.querySelector('h1') && document.querySelector('h1').textContent.includes('Campus Overview'))`
    );
    console.log(`1. Dashboard Critical UI Content Render: ${(navStartTime + dashboardContent.elapsed - navStartTime).toFixed(1)}ms`);

    const canvasElement = await waitForEval(
      `Boolean(document.querySelector('canvas'))`,
      25000
    );
    console.log(`2. Canvas Element Created in DOM: ${(dashboardContent.elapsed + canvasElement.elapsed).toFixed(1)}ms`);

    // Check WebGL Context and first frame
    const webglReady = await waitForEval(
      `(() => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return null;
        return {
          glType: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER)
        };
      })()`,
      10000
    );
    console.log(`3. WebGL Context Initialized:`, webglReady.value);

    // Profile Scene details
    const sceneAnalysis = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = document.querySelector('canvas');
        if (!c) return { error: 'no canvas' };
        // Check performance memory and entries
        const navEntries = performance.getEntriesByType('navigation');
        const resEntries = performance.getEntriesByType('resource');
        const paintEntries = performance.getEntriesByType('paint');

        const scripts = resEntries
          .filter(r => r.initiatorType === 'script' || r.name.endsWith('.js') || r.name.includes('/_next/'))
          .map(r => ({
            name: r.name.split('/').pop().split('?')[0],
            duration: r.duration,
            transferSize: r.transferSize,
            decodedBodySize: r.decodedBodySize
          }))
          .sort((a, b) => b.decodedBodySize - a.decodedBodySize);

        return {
          paints: paintEntries.map(p => ({ name: p.name, startTime: p.startTime })),
          topScripts: scripts.slice(0, 10),
          totalScriptDecodedBytes: scripts.reduce((acc, s) => acc + (s.decodedBodySize || 0), 0)
        };
      })()`,
      returnByValue: true
    });

    console.log('\n--- PERFORMANCE RESOURCE ANALYSIS ---');
    console.log('Paint Entries:', sceneAnalysis.result.value?.paints);
    console.log('Total Script Decoded Size:', ((sceneAnalysis.result.value?.totalScriptDecodedBytes || 0) / 1024).toFixed(1), 'KB');
    console.log('Top Scripts:');
    for (const s of (sceneAnalysis.result.value?.topScripts || [])) {
      console.log(`  - ${s.name}: ${((s.decodedBodySize || 0)/1024).toFixed(1)}KB (${s.duration?.toFixed(1)}ms)`);
    }

    // Now test a warm reload
    console.log('\n--- TESTING WARM LOAD (Page.reload) ---');
    const warmStart = performance.now();
    await send('Page.reload');
    await waitForEval(`Boolean(document.querySelector('canvas'))`, 15000);
    const warmCanvasTime = performance.now() - warmStart;
    console.log(`Warm Load to Canvas Mount: ${warmCanvasTime.toFixed(1)}ms`);

  } finally {
    chrome.kill('SIGKILL');
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}

run();
