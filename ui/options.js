/* global ChatGPTChatExporterDefaults */
/* global ChatGPTChatExporterSettings */

const SETTINGS = ChatGPTChatExporterSettings;
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
  const stored = SETTINGS.normalizeSettings(await SETTINGS.getSettings());
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
  return SETTINGS.normalizeSettings({
    delayMs: els.delayMs.value,
    maxChats: els.maxChats.value,
    autoScrollSidebar: els.autoScrollSidebar.checked,
    zipDownloads: els.zipDownloads.checked,
    zipPrefix: els.zipPrefix.value,
    timeoutMs: els.timeoutMs.value,
    settleMs: els.settleMs.value,
    maxSettleWaitMs: els.maxSettleWaitMs.value
  });
};

els.save.addEventListener("click", async () => {
  setStatus("Saving…");
  await SETTINGS.setSettings(readForm());
  setStatus("Saved.");
  setTimeout(() => setStatus(""), 1200);
});

els.reset.addEventListener("click", async () => {
  setStatus("Resetting…");
  await SETTINGS.setSettings(DEFAULTS);
  await load();
  setStatus("Reset.");
  setTimeout(() => setStatus(""), 1200);
});

load().catch((e) => {
  setStatus(`Failed to load: ${String(e?.message || e)}`);
});
