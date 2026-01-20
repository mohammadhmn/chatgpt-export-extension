/* global ChatGPTChatExporterDefaults */

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const contextEl = document.getElementById("context");

const exportCurrentBtn = document.getElementById("export-current");
const exportVisibleBtn = document.getElementById("export-visible");
const cancelBtn = document.getElementById("cancel");

const delayMsInput = document.getElementById("delayMs");
const maxChatsInput = document.getElementById("maxChats");
const autoScrollSidebarInput = document.getElementById("autoScrollSidebar");
const saveSettingsBtn = document.getElementById("save-settings");
const openOptionsBtn = document.getElementById("open-options");

const setStatus = (msg) => {
  statusEl.textContent = msg || "";
};

const setError = (msg) => {
  errorEl.textContent = msg || "";
};

const isChatGPTUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com";
  } catch {
    return false;
  }
};

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const DEFAULTS = ChatGPTChatExporterDefaults;
const getSettings = async () => chrome.storage.sync.get(DEFAULTS);
const setSettings = async (settings) => chrome.storage.sync.set(settings);

const readFormSettings = () => {
  const asInt = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    delayMs: Math.max(0, asInt(delayMsInput.value, DEFAULTS.delayMs)),
    maxChats: Math.max(0, asInt(maxChatsInput.value, DEFAULTS.maxChats)),
    autoScrollSidebar: Boolean(autoScrollSidebarInput.checked),
    timeoutMs: DEFAULTS.timeoutMs,
    settleMs: DEFAULTS.settleMs,
    maxSettleWaitMs: DEFAULTS.maxSettleWaitMs
  };
};

const applyFormSettings = (settings) => {
  delayMsInput.value = String(settings.delayMs);
  maxChatsInput.value = String(settings.maxChats);
  autoScrollSidebarInput.checked = Boolean(settings.autoScrollSidebar);
};

const setButtonsEnabled = (enabled) => {
  exportCurrentBtn.disabled = !enabled;
  exportVisibleBtn.disabled = !enabled;
  cancelBtn.disabled = false;
  saveSettingsBtn.disabled = false;
  openOptionsBtn.disabled = false;
};

const ensureExporterInjected = async (tabId) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["page/exporter.js"],
    world: "MAIN"
  });
};

const startExport = async (tabId, mode, settings) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (m, s) => window.ChatGPTChatExporter.run(m, s),
    args: [mode, settings]
  });
};

const run = async (mode) => {
  setError("");
  setStatus("Starting…");

  const tab = await getActiveTab();
  if (!tab?.id || !isChatGPTUrl(tab.url || "")) {
    setStatus("Open ChatGPT on the web to export.");
    setError("Tip: open a conversation and keep the left sidebar visible.");
    return;
  }

  try {
    await ensureExporterInjected(tab.id);
    const settings = readFormSettings();
    await startExport(tab.id, mode, settings);
    setStatus("Running in the page…");
  } catch (e) {
    setStatus("");
    setError(String(e?.message || e));
  }
};

exportCurrentBtn.addEventListener("click", () => run("current"));
exportVisibleBtn.addEventListener("click", () => run("visible"));

cancelBtn.addEventListener("click", async () => {
  setError("");
  setStatus("Canceling…");
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("");
    return;
  }

  try {
    await ensureExporterInjected(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => window.ChatGPTChatExporter.cancel()
    });
    setStatus("Cancel signal sent.");
  } catch (e) {
    setStatus("");
    setError(String(e?.message || e));
  }
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

saveSettingsBtn.addEventListener("click", async () => {
  setError("");
  setStatus("Saving settings…");
  try {
    await setSettings(readFormSettings());
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 900);
  } catch (e) {
    setStatus("");
    setError(String(e?.message || e));
  }
});

// Initialize UI state
(async () => {
  const tab = await getActiveTab();
  const ok = Boolean(tab?.id && isChatGPTUrl(tab.url || ""));
  setButtonsEnabled(ok);
  contextEl.textContent = ok ? "Ready on this tab" : "Open ChatGPT on the web";

  const stored = await getSettings();
  applyFormSettings(stored);
})().catch((e) => {
  setError(String(e?.message || e));
});
