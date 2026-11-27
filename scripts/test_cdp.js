const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333; // Use 9333 to avoid any port collisions
const USER_DATA = path.join(process.env.TEMP || "C:\\Temp", `chrome-cdp-${Date.now()}`);

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (Array.isArray(data) && data.length > 0 && data[0].webSocketDebuggerUrl) {
        return data[0].webSocketDebuggerUrl;
      }
    } catch {
      await wait(300);
    }
  }
  throw new Error("Failed to connect to Chrome CDP endpoint");
}

async function run() {
  console.log("Starting Chrome in headless mode with CDP on port", PORT);
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
  ]);

  try {
    const wsUrl = await getWsUrl();
    console.log("Connected to Chrome! WS URL:", wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.onopen = resolve);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === msgId) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    // Enable Page and Network
    await send("Page.enable");
    await send("Network.enable");

    // Navigate to homepage
    console.log("Navigating to http://localhost:3000...");
    await send("Page.navigate", { url: "http://localhost:3000" });
    await wait(2000); // Wait for hydration

    // Capture screenshot
    console.log("Capturing screenshot...");
    const { data } = await send("Page.captureScreenshot", { format: "png" });

    const artifactPath = "C:\\Users\\UT\\.gemini\\antigravity\\brain\\7755e90e-9b23-43dd-94e3-214e22a36269\\cdp_homepage.png";
    fs.writeFileSync(artifactPath, Buffer.from(data, "base64"));
    console.log("Screenshot saved successfully to:", artifactPath);

    ws.close();
  } finally {
    chrome.kill();
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch {}
  }
}

run().catch(console.error);
