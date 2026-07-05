// scripts/domChatProbeElectron.ts
import { app, BrowserWindow, ipcMain } from "electron";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ../../apps/desktop2/shared/controlledPageBridge.ts
var DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL = "desktop:controlled-page:dom-event-from-page";

// scripts/domChatProbeElectron.ts
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "../..");
var REPO_ROOT = resolve(PLUGIN_ROOT, "../..");
var DESKTOP2_ROOT = resolve(REPO_ROOT, "apps/desktop2");
var ESBUILD_BIN = resolve(DESKTOP2_ROOT, "node_modules/.bin/esbuild");
var SPECS = {
  chatgpt: {
    providerId: "chatgpt-dom",
    url: "https://chatgpt.com",
    partition: "persist:chatprism-chatgpt-dom",
    preloadOut: resolve(PLUGIN_ROOT, "dist/scripts/chatgpt-dom.probe.preload.cjs"),
    preloadSrc: resolve(REPO_ROOT, "plugins/ai-agent/src/preload/chatgptDomPreload.ts")
  },
  gemini: {
    providerId: "gemini-dom",
    url: "https://gemini.google.com/app",
    partition: "persist:chatprism-gemini-dom",
    preloadOut: resolve(PLUGIN_ROOT, "dist/scripts/gemini-dom.probe.preload.cjs"),
    preloadSrc: resolve(REPO_ROOT, "plugins/ai-agent/src/preload/geminiDomPreload.ts")
  }
};
function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const provider2 = args.find((a) => a === "chatgpt" || a === "gemini") ?? "chatgpt";
  const prompt2 = args.find((a) => !a.startsWith("--") && a !== provider2) ?? "\u7F8E\u56FD\u7B2C\u4E8C\u5927\u57CE\u5E02\u662F\u54EA\u91CC\uFF0C\u8BF7\u7B80\u8981\u8BF4\u660E";
  return { provider: provider2, prompt: prompt2 };
}
function buildPreload(spec2) {
  try {
    console.log("[probe-e] building preload:", spec2.providerId);
    execSync(
      `"${ESBUILD_BIN}" ${spec2.preloadSrc} --bundle --platform=node --format=cjs --target=node18 --outfile=${spec2.preloadOut} --external:electron --alias:@packages/core=../../packages/core --alias:@packages/ui=../../packages/ui`,
      { cwd: DESKTOP2_ROOT, stdio: "inherit" }
    );
    return true;
  } catch (err) {
    console.error("[probe-e] preload build failed:", err);
    return false;
  }
}
var { provider, prompt } = parseArgs();
var spec = SPECS[provider];
var win = null;
var start = 0;
function inject() {
  if (!win || win.isDestroyed()) return;
  start = Date.now();
  const requestId = `probe-${Date.now()}`;
  console.log(`
[probe-e] \u6CE8\u5165 prompt=${JSON.stringify(prompt)} requestId=${requestId}`);
  win.webContents.executeJavaScript(
    `window.__jarvisInjectPrompt(${JSON.stringify(prompt)}, ${JSON.stringify(requestId)})`,
    true
  ).catch((err) => console.error("[probe-e] inject executeJavaScript error:", err));
}
function registerDomEvents() {
  ipcMain.on(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL, (_e, payload) => {
    if (payload.providerId !== spec.providerId) return;
    const t = Date.now() - start;
    if (payload.type === "chunk") {
      const text = payload.text ?? "";
      const preview = text.length > 80 ? `${text.slice(0, 40)}\u2026${text.slice(-30)}` : text;
      console.log(`[probe-e +${t}ms] snapshot len=${text.length} :: ${preview.replace(/\n/g, "\u23CE")}`);
    } else if (payload.type === "done") {
      const text = payload.text ?? "";
      console.log("\n========== \u6700\u7EC8\u7ED3\u679C ==========");
      console.log(`elapsed=${t}ms len=${text.length}`);
      console.log("------------------------------");
      console.log(text || "(\u7A7A)");
      console.log("==============================");
      console.log("[probe-e] \u6309 Cmd/Ctrl+R \u53EF\u91CD\u65B0\u6CE8\u5165\uFF1B\u5173\u95ED\u7A97\u53E3\u9000\u51FA\u3002\n");
    } else if (payload.type === "error") {
      console.error(`[probe-e +${t}ms] error: ${payload.message}`);
      console.error("[probe-e] \u82E5\u662F\u300Cinput not found / \u672A\u767B\u5F55\u300D\uFF0C\u8BF7\u5728\u7A97\u53E3\u91CC\u767B\u5F55\u540E\u6309 Cmd/Ctrl+R \u91CD\u8BD5\u3002");
    }
  });
}
function createWindow() {
  if (!existsSync(spec.preloadOut)) {
    console.error("[probe-e] preload not found:", spec.preloadOut);
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: `DOM Chat Probe \u2014 ${spec.providerId}`,
    webPreferences: {
      partition: spec.partition,
      preload: spec.preloadOut,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  win.webContents.openDevTools({ mode: "detach" });
  win.webContents.on("console-message", (_e, _level, msg) => {
    if (msg.includes("DomPreload")) console.log("[window]", msg);
  });
  win.webContents.on("did-finish-load", async () => {
    console.log("[probe-e] page loaded:", win.webContents.getURL());
    console.log("[probe-e] \u7B49\u5F85\u9875\u9762\u6E32\u67D3\u540E\u81EA\u52A8\u6CE8\u5165\uFF08\u82E5\u672A\u767B\u5F55\u4F1A\u6536\u5230 error\uFF0C\u767B\u5F55\u540E\u6309 Cmd/Ctrl+R \u91CD\u8BD5\uFF09...");
    await new Promise((r) => setTimeout(r, 3500));
    inject();
  });
  win.webContents.on("before-input-event", (event, input) => {
    if ((input.meta || input.control) && input.key === "r" && !input.shift) {
      event.preventDefault();
      console.log("[probe-e] \u91CD\u65B0\u6CE8\u5165 (Cmd/Ctrl+R)...");
      inject();
    }
  });
  console.log(`[probe-e] provider=${spec.providerId} partition=${spec.partition}`);
  console.log("[probe-e] loading", spec.url);
  void win.loadURL(spec.url);
}
app.whenReady().then(() => {
  buildPreload(spec);
  registerDomEvents();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => app.quit());
