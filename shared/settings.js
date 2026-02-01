(() => {
  const DEFAULTS = window.ChatGPTChatExporterDefaults;

  const INVALID_FILENAME_CHARS_RE = /[\/\\?%*:|"<>]/g;
  const ZIP_SUFFIX_RE = /\.zip$/i;

  const parseIntOr = (value, fallback) => {
    const n = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const clampMin = (value, min) => (Number.isFinite(value) ? Math.max(min, value) : min);

  const sanitizeZipPrefix = (value, fallback = DEFAULTS.zipPrefix) => {
    const raw = String(value ?? "").trim() || String(fallback ?? "chatgpt_export");
    const noZip = raw.replace(ZIP_SUFFIX_RE, "");
    const cleaned = noZip
      .replace(INVALID_FILENAME_CHARS_RE, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .trim()
      .slice(0, 80);
    return cleaned || "chatgpt_export";
  };

  const normalizeSettings = (partial) => {
    const input = partial || {};
    return {
      delayMs: clampMin(parseIntOr(input.delayMs, DEFAULTS.delayMs), 0),
      maxChats: clampMin(parseIntOr(input.maxChats, DEFAULTS.maxChats), 0),
      autoScrollSidebar: Boolean(input.autoScrollSidebar ?? DEFAULTS.autoScrollSidebar),
      zipDownloads: Boolean(input.zipDownloads ?? DEFAULTS.zipDownloads),
      zipPrefix: sanitizeZipPrefix(input.zipPrefix, DEFAULTS.zipPrefix),
      timeoutMs: clampMin(parseIntOr(input.timeoutMs, DEFAULTS.timeoutMs), 1000),
      settleMs: clampMin(parseIntOr(input.settleMs, DEFAULTS.settleMs), 0),
      maxSettleWaitMs: clampMin(parseIntOr(input.maxSettleWaitMs, DEFAULTS.maxSettleWaitMs), 0)
    };
  };

  const getSettings = async () => chrome.storage.sync.get(DEFAULTS);
  const setSettings = async (settings) => chrome.storage.sync.set(settings);

  window.ChatGPTChatExporterSettings = {
    DEFAULTS,
    parseIntOr,
    sanitizeZipPrefix,
    normalizeSettings,
    getSettings,
    setSettings
  };
})();
