/* global ChatGPTChatExporterDefaults */

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const exportCurrentBtn = document.getElementById("export-current");
const exportVisibleBtn = document.getElementById("export-visible");
const cancelBtn = document.getElementById("cancel");
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
  setStatus("Running…");

  const tab = await getActiveTab();
  if (!tab?.id || !isChatGPTUrl(tab.url || "")) {
    setStatus("");
    setError("Open chatgpt.com (or chat.openai.com) on a conversation, then try again.");
    return;
  }

  try {
    await ensureExporterInjected(tab.id);
    const settings = await getSettings();
    await startExport(tab.id, mode, settings);
    setStatus("Started. Check the page for download prompts.");
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
  if (!tab?.id) return;

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

