(() => {
  "use strict";

  const CANCEL_KEY = "__chatgptChatExporterCancel";
  const RUNNING_KEY = "__chatgptChatExporterRunning";

  const TURN_SELECTOR = 'article[data-testid^="conversation-turn"]';
  const ROLE_SELECTOR = "[data-message-author-role]";

  const SIDEBAR_ROOT_SELECTORS = ["#history", 'nav[aria-label="Chat history"]', 'nav[aria-label*="history"]'];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = () => Date.now();

  const sanitizeFilename = (name) => {
    const cleaned = (name || "Untitled chat")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return cleaned || "Untitled chat";
  };

  const formatTimestamp = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "_",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  };

  const makeZipFilename = (prefix) => {
    const safePrefix = sanitizeFilename(prefix || "chatgpt_export").replace(/\.zip$/i, "");
    return `${safePrefix}_${formatTimestamp(new Date())}.zip`;
  };

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = (filename, data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const name = filename.endsWith(".json") ? filename : `${filename}.json`;
    downloadBlob(name, blob);
  };

  const downloadZip = (filename, blob) => {
    const name = filename.endsWith(".zip") ? filename : `${filename}.zip`;
    downloadBlob(name, blob);
  };

  // ZIP (store-only, no compression)
  const crc32 = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return (bytes) => {
      let c = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
  })();

  const dosDateTime = (date) => {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2);
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosTime, dosDate };
  };

  const createZipBlob = (files, { zipComment = "" } = {}) => {
    const encoder = new TextEncoder();
    const { dosTime, dosDate } = dosDateTime(new Date());
    const generalFlagUtf8 = 0x0800;

    const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
    const u32 = (n) =>
      new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

    const localChunks = [];
    const cdChunks = [];
    const entries = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const crc = crc32(dataBytes);

      const localHeader = [
        u32(0x04034b50),
        u16(20),
        u16(generalFlagUtf8),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes
      ];

      let localHeaderSize = 0;
      for (const b of localHeader) localHeaderSize += b.length;
      localChunks.push(...localHeader, dataBytes);

      entries.push({ nameBytes, crc, size: dataBytes.length, offset });
      offset += localHeaderSize + dataBytes.length;
    }

    const cdOffset = offset;
    for (const e of entries) {
      const centralHeader = [
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(generalFlagUtf8),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(e.crc),
        u32(e.size),
        u32(e.size),
        u16(e.nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(e.offset),
        e.nameBytes
      ];

      cdChunks.push(...centralHeader);
      for (const b of centralHeader) offset += b.length;
    }

    const cdSize = offset - cdOffset;
    const commentBytes = encoder.encode(zipComment);
    const eocd = [
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(cdSize),
      u32(cdOffset),
      u16(commentBytes.length),
      commentBytes
    ];

    return new Blob([...localChunks, ...cdChunks, ...eocd], { type: "application/zip" });
  };

  const isCanceled = () => Boolean(window[CANCEL_KEY]);

  const ensureOverlay = () => {
    const id = "chatgpt-chat-exporter-overlay";
    let root = document.getElementById(id);
    if (root) return root;

    root = document.createElement("div");
    root.id = id;
    root.style.position = "fixed";
    root.style.zIndex = "2147483647";
    root.style.top = "12px";
    root.style.right = "12px";
    root.style.width = "360px";
    root.style.maxWidth = "calc(100vw - 24px)";
    root.style.background = "rgba(17, 24, 39, 0.95)";
    root.style.color = "#fff";
    root.style.border = "1px solid rgba(255,255,255,0.12)";
    root.style.borderRadius = "12px";
    root.style.padding = "12px";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    root.style.fontSize = "12px";
    root.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";

    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="font-weight:600;">ChatGPT Export</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="${id}-hide" style="background:transparent;color:#e5e7eb;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:6px 10px;cursor:pointer;">Hide</button>
          <button id="${id}-cancel" style="background:#ef4444;color:#fff;border:0;border-radius:10px;padding:6px 10px;cursor:pointer;">Cancel</button>
        </div>
      </div>
      <div id="${id}-status" style="margin-top:8px;color:#d1d5db;"></div>
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;color:#d1d5db;">
          <div id="${id}-progress-left"></div>
          <div id="${id}-progress-right"></div>
        </div>
        <div style="height:8px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;margin-top:6px;">
          <div id="${id}-bar" style="height:8px;width:0%;background:#22c55e;"></div>
        </div>
      </div>
      <div id="${id}-log" style="margin-top:10px;max-height:160px;overflow:auto;border-top:1px solid rgba(255,255,255,0.12);padding-top:8px;color:#e5e7eb;white-space:pre-wrap;"></div>
    `;

    document.body.appendChild(root);

    const cancelBtn = document.getElementById(`${id}-cancel`);
    cancelBtn?.addEventListener("click", () => {
      window[CANCEL_KEY] = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = "Canceling…";
    });

    const hideBtn = document.getElementById(`${id}-hide`);
    hideBtn?.addEventListener("click", () => root.remove());

    return root;
  };

  const overlay = {
    setStatus: (text) => {
      ensureOverlay();
      const el = document.getElementById("chatgpt-chat-exporter-overlay-status");
      if (el) el.textContent = text || "";
    },
    setProgress: ({ current, total }) => {
      ensureOverlay();
      const left = document.getElementById("chatgpt-chat-exporter-overlay-progress-left");
      const right = document.getElementById("chatgpt-chat-exporter-overlay-progress-right");
      const bar = document.getElementById("chatgpt-chat-exporter-overlay-bar");
      if (left) left.textContent = total ? `Chat ${current}/${total}` : "";
      if (right) right.textContent = total ? `${Math.round((current / total) * 100)}%` : "";
      if (bar) bar.style.width = total ? `${(current / total) * 100}%` : "0%";
    },
    log: (line) => {
      ensureOverlay();
      const el = document.getElementById("chatgpt-chat-exporter-overlay-log");
      if (!el) return;
      const prefix = new Date().toLocaleTimeString();
      el.textContent = `${prefix}  ${line}\n${el.textContent}`.slice(0, 8000);
    }
  };

  const getTurnCount = () => document.querySelectorAll(TURN_SELECTOR).length;
  const hasAnyRoleElement = () => document.querySelector(ROLE_SELECTOR) != null;

  const waitForConversationReady = async ({
    timeoutMs = 45000,
    settleMs = 1500,
    maxSettleWaitMs = 8000
  } = {}) => {
    const start = now();
    const timedOut = () => now() - start > timeoutMs;

    while (getTurnCount() === 0 || !hasAnyRoleElement()) {
      if (isCanceled()) throw new Error("Canceled.");
      if (timedOut()) throw new Error("Timed out waiting for conversation to render.");
      await sleep(200);
    }

    // Wait for UI to "settle" (turn count and pathname stabilize briefly).
    const settleStart = now();
    let lastChangeAt = now();
    let lastCount = getTurnCount();
    let lastPath = location.pathname;

    while (now() - lastChangeAt < settleMs) {
      if (isCanceled()) throw new Error("Canceled.");
      if (timedOut()) break;
      if (now() - settleStart > maxSettleWaitMs) break;

      await sleep(250);

      const count = getTurnCount();
      const path = location.pathname;
      if (count !== lastCount || path !== lastPath) {
        lastCount = count;
        lastPath = path;
        lastChangeAt = now();
      }
    }
  };

  const collectChatMessages = () => {
    const turns = document.querySelectorAll(TURN_SELECTOR);
    const roleLabelMap = { user: "User", assistant: "Assistant", system: "System" };
    const messages = [];

    for (let index = 0; index < turns.length; index++) {
      const turn = turns[index];
      const roleEl = turn.querySelector(ROLE_SELECTOR);
      const role =
        roleEl?.dataset?.messageAuthorRole ||
        roleEl?.getAttribute("data-message-author-role") ||
        "unknown";

      const author = roleLabelMap[role] || role;

      // Prefer a single "content root" to avoid scanning lots of descendants.
      const content =
        turn.querySelector(".markdown") ||
        turn.querySelector('[data-testid="text-message"]') ||
        turn;

      const text = (content.innerText || "").trim();
      if (!text) continue;
      messages.push({ index, author, role, text });
    }

    return messages;
  };

  const getSidebarRoot = () => {
    for (const sel of SIDEBAR_ROOT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const getSidebarScroller = () => {
    // Prefer an explicitly labeled nav scroller, fall back to sidebar root.
    return document.querySelector('nav[aria-label="Chat history"]') || getSidebarRoot();
  };

  const getSidebarChats = () => {
    const root = getSidebarRoot();
    if (!root) return [];

    const links = Array.from(root.querySelectorAll('a[href^="/c/"]'));
    const seen = new Set();
    const chats = [];

    for (const a of links) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, location.origin).toString();
      if (seen.has(url)) continue;
      seen.add(url);

      const title = (a.querySelector('span[dir="auto"]')?.innerText || a.innerText || "").trim();
      if (!title) continue;

      chats.push({ title, url });
    }

    return chats;
  };

  const loadAllChatsInSidebar = async () => {
    const scroller = getSidebarScroller();
    if (!scroller) return;

    let lastCount = -1;
    let lastScrollTop = -1;

    for (let i = 0; i < 140; i++) {
      if (isCanceled()) throw new Error("Canceled.");

      const count = getSidebarChats().length;
      if (count === lastCount && scroller.scrollTop === lastScrollTop) break;

      lastCount = count;
      lastScrollTop = scroller.scrollTop;

      scroller.scrollTop = scroller.scrollHeight;
      await sleep(450);
    }
  };

  const clickChatByUrl = (url) => {
    const root = getSidebarRoot();
    if (!root) throw new Error("Sidebar not found. Make sure the left sidebar is open.");

    const path = new URL(url).pathname;
    const a = root.querySelector(`a[href="${CSS.escape(path)}"]`);
    if (!a) throw new Error(`Could not find chat link in sidebar for ${path}`);
    a.scrollIntoView({ block: "center" });
    a.click();
  };

  const waitForPathname = async (pathname, timeoutMs = 20000) => {
    const start = now();
    while (location.pathname !== pathname) {
      if (isCanceled()) throw new Error("Canceled.");
      if (now() - start > timeoutMs) break;
      await sleep(80);
    }
  };

  const getCurrentChatTitleFromSidebar = () => {
    const root = getSidebarRoot();
    if (!root) return null;
    const active = root.querySelector('a[data-active], a[aria-current="page"]') || null;
    if (!active) return null;
    return (active.querySelector('span[dir="auto"]')?.innerText || active.innerText || "").trim() || null;
  };

  const buildPayload = (title) => ({
    title,
    url: location.href,
    exportedAt: new Date().toISOString(),
    messages: collectChatMessages()
  });

  const exportOne = ({ title, zipDownloads, zipPrefix, zipFiles, usedNames }) => {
    let base = sanitizeFilename(title);
    const n = (usedNames.get(base) || 0) + 1;
    usedNames.set(base, n);
    if (n > 1) base = `${base} (${n})`;

    const payload = buildPayload(title);
    if (!payload.messages.length) overlay.log(`Warning: 0 messages for "${title}"`);

    if (zipDownloads) {
      zipFiles.push({ name: `${base}.json`, data: JSON.stringify(payload, null, 2) });
      overlay.setStatus(`Queued: ${base}.json`);
      return;
    }

    overlay.setStatus(`Downloading: ${base}.json`);
    downloadJSON(`${base}.json`, payload);
  };

  const exportCurrentChat = async (settings) => {
    const zipDownloads = Boolean(settings?.zipDownloads);
    const zipPrefix = settings?.zipPrefix || "chatgpt_export";

    overlay.setStatus("Preparing current chat…");
    await waitForConversationReady(settings);

    const title = getCurrentChatTitleFromSidebar() || document.title || "Untitled chat";
    overlay.log(`Export current: ${title}`);

    const payload = buildPayload(title);

    if (zipDownloads) {
      const zipName = makeZipFilename(zipPrefix);
      const zip = createZipBlob([
        { name: `${sanitizeFilename(title)}.json`, data: JSON.stringify(payload, null, 2) }
      ]);
      overlay.setStatus(`Downloading ZIP: ${zipName}`);
      downloadZip(zipName, zip);
    } else {
      downloadJSON(`${sanitizeFilename(title)}.json`, payload);
    }

    overlay.setStatus("Done.");
  };

  const exportVisibleChats = async (settings) => {
    const cfg = settings || {};
    const delayMs = cfg.delayMs ?? 1500;
    const maxChats = cfg.maxChats ?? 0;
    const autoScrollSidebar = cfg.autoScrollSidebar ?? true;
    const zipDownloads = Boolean(cfg.zipDownloads);
    const zipPrefix = cfg.zipPrefix || "chatgpt_export";

    overlay.setStatus("Collecting chats from sidebar…");
    if (autoScrollSidebar) await loadAllChatsInSidebar();

    const chats = getSidebarChats();
    if (!chats.length) {
      throw new Error("No chats found in sidebar. Make sure the sidebar is open and Chats are visible.");
    }

    const total = maxChats > 0 ? Math.min(maxChats, chats.length) : chats.length;
    const usedNames = new Map();
    const failures = [];
    const zipFiles = [];
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      const { title, url } = chats[i];
      const targetPath = new URL(url).pathname;

      overlay.setProgress({ current: i + 1, total });
      overlay.setStatus(`Opening: ${title}`);
      overlay.log(`Open: ${title}`);

      if (isCanceled()) break;

      try {
        clickChatByUrl(url);
        await waitForPathname(targetPath, 20000);
        await waitForConversationReady(settings);
        exportOne({ title, zipDownloads, zipPrefix, zipFiles, usedNames });
        successCount += 1;
        await sleep(delayMs);
      } catch (err) {
        const message = String(err?.message || err);
        if (message === "Canceled.") break;
        failures.push({ title, url, error: message });
        overlay.log(`Error: ${title}\n${message}`);
        await sleep(300);
      }
    }

    overlay.setProgress({ current: total, total });

    if (isCanceled()) {
      overlay.setStatus(`Canceled. Exported ${successCount}/${total}.`);
      return;
    }

    if (zipDownloads) {
      if (failures.length) zipFiles.push({ name: "failures.json", data: JSON.stringify(failures, null, 2) });
      const zipName = makeZipFilename(zipPrefix);
      overlay.setStatus(`Building ZIP (${zipFiles.length} files)…`);
      downloadZip(zipName, createZipBlob(zipFiles));
      overlay.setStatus(failures.length ? `Done with errors. Exported ${successCount}/${total}.` : `Done. Exported ${successCount}/${total}.`);
      if (failures.length) overlay.log(`Failed chats: ${failures.length}`);
      return;
    }

    overlay.setStatus(failures.length ? `Done with errors. Exported ${successCount}/${total}.` : `Done. Exported ${successCount}/${total}.`);
    if (failures.length) overlay.log(`Failed chats: ${failures.length}`);
  };

  const run = async (mode, settings) => {
    if (window[RUNNING_KEY]) throw new Error("An export is already running.");
    window[RUNNING_KEY] = true;
    window[CANCEL_KEY] = false;

    try {
      if (mode === "current") return await exportCurrentChat(settings);
      if (mode === "visible") return await exportVisibleChats(settings);
      throw new Error(`Unknown mode: ${mode}`);
    } finally {
      window[RUNNING_KEY] = false;
    }
  };

  const cancel = () => {
    window[CANCEL_KEY] = true;
  };

  window.ChatGPTChatExporter = { run, cancel };
})();
