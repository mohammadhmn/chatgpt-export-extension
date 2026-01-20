/* global ChatGPTChatExporterDefaults */

const DEFAULTS = ChatGPTChatExporterDefaults;

const byId = (id) => document.getElementById(id);

const els = {
  delayMs: byId("delayMs"),
  maxChats: byId("maxChats"),
  autoScrollSidebar: byId("autoScrollSidebar"),
  zipDownloads: byId("zipDownloads"),
  zipPrefix: byId("zipPrefix"),
  timeoutMs: byId("timeoutMs"),
  settleMs: byId("settleMs"),
  maxSettleWaitMs: byId("maxSettleWaitMs"),
  save: byId("save"),
  reset: byId("reset"),
  status: byId("status")
};

const setStatus = (msg) => {
  els.status.textContent = msg || "";
};

const load = async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  els.delayMs.value = String(stored.delayMs);
  els.maxChats.value = String(stored.maxChats);
  els.autoScrollSidebar.checked = Boolean(stored.autoScrollSidebar);
  els.zipDownloads.checked = Boolean(stored.zipDownloads);
  els.zipPrefix.value = String(stored.zipPrefix || DEFAULTS.zipPrefix);
  els.timeoutMs.value = String(stored.timeoutMs);
  els.settleMs.value = String(stored.settleMs);
  els.maxSettleWaitMs.value = String(stored.maxSettleWaitMs);
};

const readForm = () => {
  const asInt = (el) => {
    const n = Number.parseInt(el.value, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const prefix = (els.zipPrefix.value || DEFAULTS.zipPrefix).trim() || DEFAULTS.zipPrefix;
  const safePrefix = prefix.replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_");

  return {
    delayMs: Math.max(0, asInt(els.delayMs)),
    maxChats: Math.max(0, asInt(els.maxChats)),
    autoScrollSidebar: Boolean(els.autoScrollSidebar.checked),
    zipDownloads: Boolean(els.zipDownloads.checked),
    zipPrefix: safePrefix,
    timeoutMs: Math.max(1000, asInt(els.timeoutMs)),
    settleMs: Math.max(0, asInt(els.settleMs)),
    maxSettleWaitMs: Math.max(0, asInt(els.maxSettleWaitMs))
  };
};

els.save.addEventListener("click", async () => {
  setStatus("Saving…");
  await chrome.storage.sync.set(readForm());
  setStatus("Saved.");
  setTimeout(() => setStatus(""), 1200);
});

els.reset.addEventListener("click", async () => {
  setStatus("Resetting…");
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  setStatus("Reset.");
  setTimeout(() => setStatus(""), 1200);
});

load().catch((e) => {
  setStatus(`Failed to load: ${String(e?.message || e)}`);
});
