const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9337;
const USER_DATA = path.join(process.env.TEMP || "C:\\Temp", `chrome-qa-run-${Date.now()}`);
const ARTIFACT_DIR = "C:\\Users\\UT\\.gemini\\antigravity\\brain\\7755e90e-9b23-43dd-94e3-214e22a36269";

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 25; i++) {
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
  console.log("=== STARTING FULL SYSTEM QA & DASHBOARD VERIFICATION VIA CDP ===");
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,950",
  ]);

  try {
    const wsUrl = await getWsUrl();
    console.log("Connected to Chrome CDP! WebSocket URL:", wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => (ws.onopen = resolve));

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

    async function capturePage(filename, desc) {
      console.log(`[CAPTURING] ${desc} -> ${filename}`);
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const targetPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(targetPath, Buffer.from(data, "base64"));
      const size = fs.statSync(targetPath).size;
      console.log(`[SAVED] ${filename} (${size} bytes)`);
    }

    async function loginAs(roleText) {
      console.log(`\nClearing cookies and logging in as ${roleText}...`);
      await send("Network.clearBrowserCookies");
      await send("Page.navigate", { url: "http://localhost:3000/staff/login" });
      await wait(2000);

      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '${roleText}');
            if (btn) btn.click();
          })()
        `,
      });
      await wait(600);

      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const submit = document.querySelector('button[type="submit"]');
            if (submit) submit.click();
          })()
        `,
      });
      await wait(3500);

      const urlRes = await send("Runtime.evaluate", { expression: "window.location.href", returnByValue: true });
      console.log(`URL after ${roleText} login:`, urlRes.result?.value);
    }

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");

    // 1. Guest Online Booking Page
    console.log("\n--- TEST 1: Guest Online Booking Flow ---");
    await send("Page.navigate", { url: "http://localhost:3000/book" });
    await wait(2500);
    await capturePage("01_guest_booking_page.png", "Guest Booking Form with Online Card & Arrival Payment");

    // 2. Receptionist Portal
    console.log("\n--- TEST 2: Receptionist Dashboard ---");
    await loginAs("Receptionist");
    await wait(2000);
    await capturePage("02_receptionist_reservations.png", "Receptionist Front Desk & Active Stays");

    // 3. Housekeeping Portal
    console.log("\n--- TEST 3: Housekeeping Cleanliness Queue ---");
    await loginAs("Housekeeping");
    await wait(2000);
    await capturePage("03_housekeeping_dashboard.png", "Housekeeping Cleanliness Queue & Awaiting Maintenance");

    // 4. Maintenance Portal
    console.log("\n--- TEST 4: Maintenance Work Orders ---");
    await loginAs("Maintenance");
    await wait(2000);
    await capturePage("04_maintenance_dashboard.png", "Maintenance Work Orders & Out-of-Order Rooms");

    // 5. Manager Portal
    console.log("\n--- TEST 5: Manager Portal & Serious Escalations ---");
    await loginAs("Manager");
    await wait(2000);
    await capturePage("05_manager_dashboard.png", "General Manager Overview & Active Stays");

    // 6. Admin Portal
    console.log("\n--- TEST 6: Administrator Overview ---");
    await loginAs("Admin");
    await wait(2000);
    await capturePage("06_admin_dashboard.png", "Administrator Complete Oversight");

    // 7. Admin Room Inventory Grid
    console.log("\n--- TEST 7: Room Inventory Grid ---");
    await send("Page.navigate", { url: "http://localhost:3000/staff/dashboard/rooms" });
    await wait(2500);
    await capturePage("07_admin_rooms.png", "Live Operational Room Grid & Overrides");

    ws.close();
    console.log("\n=== ALL QA TESTS AND SCREENSHOTS COMPLETED SUCCESSFULLY ===");
  } finally {
    chrome.kill();
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in QA Suite:", err);
  process.exit(1);
});
