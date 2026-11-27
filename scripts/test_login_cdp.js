const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9335;
const USER_DATA = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-login-test-' + Date.now());

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--no-first-run',
    '--window-size=1400,950',
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      try {
        const d = await new Promise((res, rej) => {
          http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
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
    await send('Network.enable');

    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Network.requestWillBeSent') {
        console.log('[REQ]', msg.params.request.method, msg.params.request.url);
      }
      if (msg.method === 'Network.responseReceived') {
        console.log('[RES]', msg.params.response.status, msg.params.response.url);
      }
    });

    console.log('Navigating to login...');
    await send('Page.navigate', { url: 'http://localhost:3000/staff/login' });
    await wait(2500);

    console.log('Clicking Receptionist quick-fill button...');
    const fillRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Receptionist');
          if (btn) btn.click();
          const u = document.getElementById('username');
          const p = document.getElementById('password');
          return { clicked: !!btn, u: u ? u.value : null, p: p ? p.value : null };
        })()
      `,
      returnByValue: true,
    });
    console.log('Fill result:', fillRes.result?.value);
    await wait(800);

    console.log('Clicking Submit button...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const submit = document.querySelector('button[type="submit"]');
          if (submit) submit.click();
          return !!submit;
        })()
      `,
      returnByValue: true,
    });
    await wait(5000);

    const bodyText = await send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true,
    });
    console.log('Body Text snippet:\n', bodyText.result?.value?.slice(0, 400));

    const urlRes = await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    console.log('Current URL after login:', urlRes.result?.value);

    ws.close();
  } finally {
    chrome.kill();
  }
}
run().catch(console.error);
