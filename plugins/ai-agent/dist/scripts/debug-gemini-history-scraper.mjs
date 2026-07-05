// scripts/debugGeminiHistoryScraper.ts
import { app, BrowserWindow } from "electron";
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var PLUGIN_ROOT = resolve(__dirname, "../..");
var REPO_ROOT = resolve(PLUGIN_ROOT, "../..");
var DESKTOP2_ROOT = resolve(REPO_ROOT, "apps/desktop2");
var LOG_FILE = resolve(PLUGIN_ROOT, "dist/debug-gemini.log");
function fileLog(line) {
  try {
    appendFileSync(LOG_FILE, `${line}
`);
  } catch {
  }
}
var GEMINI_URL = "https://gemini.google.com/app";
var PARTITION = "persist:chatprism-gemini";
var PRELOAD_OUT = resolve(PLUGIN_ROOT, "dist/scripts/debug-gemini-history.preload.cjs");
var PRELOAD_SRC = resolve(REPO_ROOT, "plugins/ai-agent/src/preload/geminiHistoryPreload.ts");
var SCRAPER_SRC = resolve(REPO_ROOT, "plugins/ai-agent/src/providers/history/gemini/geminiHistoryBridgeCore.ts");
var CONFIG_JSON = resolve(REPO_ROOT, "apps/server/src/provider-configs/gemini-history.json");
var ESBUILD_BIN = resolve(DESKTOP2_ROOT, "node_modules/.bin/esbuild");
var watchMode = process.argv.includes("--watch");
var win = null;
function loadConfig() {
  const raw = readFileSync(CONFIG_JSON, "utf8");
  return JSON.parse(raw);
}
function buildPreload() {
  try {
    console.log("[debug-gemini] Building preload...");
    execSync(
      `"${ESBUILD_BIN}" "${PRELOAD_SRC}" --bundle --platform=node --format=cjs --target=node18 --outfile="${PRELOAD_OUT}" --external:electron --alias:@packages/core=../../packages/core --alias:@packages/ui=../../packages/ui`,
      { cwd: DESKTOP2_ROOT, stdio: "inherit" }
    );
    console.log("[debug-gemini] Preload built \u2713");
    return true;
  } catch (err) {
    console.error("[debug-gemini] Preload build failed:", err);
    return false;
  }
}
async function domDiagnostic() {
  if (!win || win.isDestroyed()) return;
  try {
    const diag = await win.webContents.executeJavaScript(`
            (() => {
                const accountEl = document.querySelector('a[aria-label*="@"], [aria-label*="Google \u8D26\u53F7"], [aria-label*="Google Account"]');
                const sparkle = Array.from(document.querySelectorAll('[data-test-id="side-nav-sparkle-button"]')).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    ariaLabel: el.getAttribute('aria-label'),
                    visible: el.getBoundingClientRect().width > 0
                }));
                const toggles = Array.from(document.querySelectorAll('[data-test-id="expandable-section-toggle"]')).map(el => ({
                    ariaLabel: el.getAttribute('aria-label'),
                    ariaExpanded: el.getAttribute('aria-expanded')
                }));
                const convListEls = document.querySelectorAll('conversations-list');
                const convListAll = document.querySelectorAll('conversations-list[data-test-id="all-conversations"]');
                return {
                    href: location.href,
                    title: document.title,
                    bodyTextSample: (document.body?.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 200),
                    accountAriaLabel: accountEl?.getAttribute('aria-label') || null,
                    sparkleButtons: sparkle,
                    sectionToggles: toggles,
                    conversationsListCount: convListEls.length,
                    allConversationsListCount: convListAll.length,
                    appAnchorCount: document.querySelectorAll('a[href*="/app/"]').length,
                    convAnchorCount: document.querySelectorAll('a[data-test-id="conversation"]').length,
                    hasLoginGate: !!document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]')
                };
            })()
        `, true);
    console.log("[debug-gemini] DOM diagnostic:", JSON.stringify(diag, null, 2));
    fileLog(`DOM diagnostic: ${JSON.stringify(diag)}`);
  } catch (err) {
    fileLog(`DOM diagnostic error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function runScraper() {
  if (!win || win.isDestroyed()) return;
  const config = loadConfig();
  const requestJson = JSON.stringify({
    action: "GET_HISTORY_LIST",
    config,
    query: "",
    debugTraceId: `debug-${Date.now()}`
  });
  console.log("\n[debug-gemini] \u2500\u2500 Running scraper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log("[debug-gemini] Page URL:", win.webContents.getURL());
  console.log("[debug-gemini] Config version:", config.version);
  fileLog(`
[${(/* @__PURE__ */ new Date()).toISOString()}] \u2500\u2500 Running scraper \u2500\u2500`);
  fileLog(`Page URL: ${win.webContents.getURL()}`);
  fileLog(`Config version: ${config.version}`);
  try {
    const result = await win.webContents.executeJavaScript(`
            (() => {
                const bridge = window.chatprismGeminiHistory;
                if (!bridge || typeof bridge.request !== 'function') {
                    return { error: 'Bridge not available. Is the preload injected?' };
                }
                return bridge.request(${requestJson});
            })()
        `, true);
    console.log("[debug-gemini] Result:");
    console.log(JSON.stringify(result, null, 2));
    fileLog(`Result: ${JSON.stringify(result)}`);
    if (result?.ok && Array.isArray(result.data)) {
      console.log(`
[debug-gemini] \u2713 ${result.data.length} conversation(s) found`);
      fileLog(`\u2713 ${result.data.length} conversation(s) found`);
      result.data.slice(0, 5).forEach((item, i) => {
        console.log(`  [${i + 1}] ${item.title} (id: ${item.id})`);
        fileLog(`  [${i + 1}] ${item.title} (id: ${item.id})`);
      });
    } else if (result?.error) {
      console.error("[debug-gemini] \u2717 Error:", result.error);
      fileLog(`\u2717 Error: ${result.error}`);
    } else if (!result?.ok) {
      console.error("[debug-gemini] \u2717 Failed:", result?.code, result?.message);
      fileLog(`\u2717 Failed: ${result?.code} ${result?.message}`);
    }
  } catch (err) {
    console.error("[debug-gemini] executeJavaScript error:", err);
    fileLog(`executeJavaScript error: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log("[debug-gemini] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
  fileLog("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
}
async function expandProbe() {
  if (!win || win.isDestroyed()) return;
  console.log("\n[debug-gemini] \u2500\u2500 Expand probe \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  try {
    const result = await win.webContents.executeJavaScript(`
            (async () => {
                const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
                const log = [];
                function clickByDti(dti, labelMatch) {
                    const els = Array.from(document.querySelectorAll('[data-test-id="' + dti + '"]'));
                    const target = labelMatch
                        ? els.find((e) => (e.getAttribute('aria-label') || '').includes(labelMatch))
                        : els[0];
                    if (target) { target.click(); return (target.getAttribute('aria-label') || dti); }
                    return null;
                }
                const sidebar = clickByDti('side-nav-sparkle-button');
                log.push('clicked sidebar: ' + sidebar);
                await sleep(1200);
                const recent = clickByDti('expandable-section-toggle', '\u6700\u8FD1')
                    || clickByDti('expandable-section-toggle', 'Recent');
                log.push('clicked recent: ' + recent);
                await sleep(1800);
                const anchors = Array.from(document.querySelectorAll('a[href*="/app/"]'));
                const navItems = Array.from(document.querySelectorAll('[data-test-id="conversation"]'));
                const firstItem = navItems[0];
                return {
                    log,
                    appAnchorCount: anchors.length,
                    navItemCount: navItems.length,
                    firstAnchors: anchors.slice(0, 4).map((a) => ({ href: a.getAttribute('href'), text: (a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50) })),
                    firstItemHTML: firstItem ? firstItem.outerHTML.replace(/\\s+/g,' ').slice(0, 500) : null
                };
            })()
        `, true);
    console.log("[debug-gemini] Expand result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[debug-gemini] Expand probe error:", err);
  }
  console.log("[debug-gemini] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
}
function createWindow() {
  if (!existsSync(PRELOAD_OUT)) {
    console.error("[debug-gemini] Preload not found:", PRELOAD_OUT);
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1400,
    height: 980,
    title: "Gemini History Scraper Debug",
    webPreferences: {
      partition: PARTITION,
      preload: PRELOAD_OUT,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  win.webContents.openDevTools({ mode: "detach" });
  win.webContents.on("did-finish-load", async () => {
    console.log("[debug-gemini] Page loaded:", win.webContents.getURL());
    await new Promise((r) => setTimeout(r, 3500));
    await domDiagnostic();
    await runScraper();
  });
  win.webContents.on("before-input-event", (event, input) => {
    if ((input.meta || input.control) && input.key === "r" && !input.shift) {
      event.preventDefault();
      console.log("[debug-gemini] Re-running scraper (Cmd/Ctrl+R)...");
      void runScraper();
    }
    if ((input.meta || input.control) && input.key === "e" && !input.shift) {
      event.preventDefault();
      void expandProbe();
    }
  });
  console.log("[debug-gemini] Loading:", GEMINI_URL);
  void win.loadURL(GEMINI_URL);
}
function installWatchMode() {
  if (!watchMode) return;
  console.log("[debug-gemini] Watch mode enabled");
  const rerun = () => {
    if (buildPreload()) {
      void runScraper();
    }
  };
  watchFile(PRELOAD_SRC, { interval: 500 }, rerun);
  watchFile(SCRAPER_SRC, { interval: 500 }, rerun);
  watchFile(CONFIG_JSON, { interval: 500 }, rerun);
}
app.whenReady().then(() => {
  if (!buildPreload()) {
    app.quit();
    return;
  }
  createWindow();
  installWatchMode();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => app.quit());
