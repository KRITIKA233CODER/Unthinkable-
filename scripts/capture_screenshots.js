const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`[SCREENSHOT] Saved: ${path.basename(filePath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[1/5] Launching Chrome in headless mode with remote debugging...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5173'
  ]);

  await sleep(2500);

  try {
    const versionRes = await fetch(`http://localhost:${PORT}/json/version`);
    const versionData = await versionRes.json();
    const listRes = await fetch(`http://localhost:${PORT}/json/list`);
    const listData = await listRes.json();
    const pageTarget = listData.find((t) => t.type === 'page') || listData[0];

    console.log('[2/5] Connecting to Chrome DevTools Protocol via WebSocket...');
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('[3/5] Navigating to http://localhost:5173...');
    await client.send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(2000);

    // 1. Patient Portal
    console.log('Capturing: 01_patient_portal.png');
    await client.evaluate(`
      const patientBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Patient (Alex)'));
      if (patientBtn) patientBtn.click();
    `);
    await sleep(1500);
    await client.screenshot(path.join(SCREENSHOTS_DIR, '01_patient_portal.png'));

    // 2. Integrations Status Modal
    console.log('Capturing: 02_integrations_modal.png');
    await client.evaluate(`
      const statusBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('System Status'));
      if (statusBtn) statusBtn.click();
    `);
    await sleep(1000);
    await client.screenshot(path.join(SCREENSHOTS_DIR, '02_integrations_modal.png'));

    // Close modal
    await client.evaluate(`
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close' || b.textContent.trim() === '✕');
      if (closeBtn) closeBtn.click();
    `);
    await sleep(500);

    // Sign out
    await client.evaluate(`
      const signoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign out'));
      if (signoutBtn) signoutBtn.click();
    `);
    await sleep(1000);

    // 3. Doctor Portal
    console.log('Capturing: 03_doctor_portal.png');
    await client.evaluate(`
      const doctorBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Doctor (Dr. Sarah)'));
      if (doctorBtn) doctorBtn.click();
    `);
    await sleep(1500);
    await client.screenshot(path.join(SCREENSHOTS_DIR, '03_doctor_portal.png'));

    // Sign out
    await client.evaluate(`
      const signoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign out'));
      if (signoutBtn) signoutBtn.click();
    `);
    await sleep(1000);

    // 4. Admin Portal
    console.log('Capturing: 04_admin_portal.png');
    await client.evaluate(`
      const adminBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Admin'));
      if (adminBtn) adminBtn.click();
    `);
    await sleep(1500);
    await client.screenshot(path.join(SCREENSHOTS_DIR, '04_admin_portal.png'));

    client.close();
    console.log('[4/5] All screenshots captured successfully in docs/screenshots/!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    console.log('[5/5] Terminating headless Chrome process...');
    chrome.kill();
  }
}

main();
