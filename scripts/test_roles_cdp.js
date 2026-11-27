const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testRole(role, targetScreenshot) {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9342;
  const USER_DATA = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-test-' + role + '-' + Date.now());

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--window-size=1400,950',
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      try {
        const d = await new Promise((res, rej) => {
          http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
            let b = ''; r.on('data', c => b+=c); r.on('end', () => res(JSON.parse(b)));
          }).on('error', rej);
        });
        if (d[0]?.webSocketDebuggerUrl) { wsUrl = d[0].webSocketDebuggerUrl; break; }
      } catch { await wait(300); }
    }
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);
    let id = 1;
    function send(m, p={}) {
      return new Promise((resolve, reject) => {
        const i = id++;
        const h = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === i) { ws.removeEventListener('message', h); if (msg.error) reject(msg.error); else resolve(msg.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: i, method: m, params: p }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    await send('Page.navigate', { url: 'http://localhost:3000/staff/login' });
    await wait(2500);

    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '${role}');
          if (btn) btn.click();
        })()
      `,
    });
    await wait(800);

    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[type="submit"]').click()`,
    });

    console.log(`[${role}] Waiting for authentication and redirect...`);
    let finalUrl = '';
    for (let t = 0; t < 20; t++) {
      await wait(1000);
      const url = (await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true })).result?.value;
      if (url && !url.includes('/staff/login')) {
        finalUrl = url;
        console.log(`[${role}] Redirect completed to: ${finalUrl}`);
        break;
      }
    }

    await wait(2000); // allow dashboard hydration
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const fn = path.join('C:\\Users\\UT\\.gemini\\antigravity\\brain\\7755e90e-9b23-43dd-94e3-214e22a36269', targetScreenshot);
    fs.writeFileSync(fn, Buffer.from(data, 'base64'));
    console.log(`[${role}] Saved ${targetScreenshot}, size:`, fs.statSync(fn).size);

    ws.close();
  } finally {
    chrome.kill();
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  await testRole('Housekeeping', '03_housekeeping_dashboard.png');
  await testRole('Maintenance', '04_maintenance_dashboard.png');
  await testRole('Manager', '05_manager_dashboard.png');
  await testRole('Admin', '06_admin_dashboard.png');
}
main().catch(console.error);
