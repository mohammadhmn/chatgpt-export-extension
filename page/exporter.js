(() => {
  const CANCEL_KEY = "__chatgptChatExporterCancel";
  const RUNNING_KEY = "__chatgptChatExporterRunning";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const sanitizeFilename = (name) => {
    const cleaned = (name || "Untitled chat")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return cleaned || "Untitled chat";
  };

  const downloadJSON = (filename, data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getTurns = () => Array.from(document.querySelectorAll('article[data-testid^="conversation-turn"]'));
  const hasAnyRoleElement = () => document.querySelector("[data-message-author-role]") != null;

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
    hideBtn?.addEventListener("click", () => {
      root.remove();
    });

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

  const isCanceled = () => Boolean(window[CANCEL_KEY]);

  const waitForConversationReady = async ({
    timeoutMs = 45000,
    settleMs = 1500,
    maxSettleWaitMs = 8000
  } = {}) => {
    const start = Date.now();
    const timedOut = () => Date.now() - start > timeoutMs;

    while (getTurns().length === 0 || !hasAnyRoleElement()) {
      if (isCanceled()) throw new Error("Canceled.");
      if (timedOut()) throw new Error("Timed out waiting for conversation to render.");
      await sleep(200);
    }

    const settleStart = Date.now();
    let lastChangeAt = Date.now();
    let lastCount = getTurns().length;
    let lastPath = location.pathname;

    while (Date.now() - lastChangeAt < settleMs) {
      if (isCanceled()) throw new Error("Canceled.");
      if (timedOut()) break;
      if (Date.now() - settleStart > maxSettleWaitMs) break;

      await sleep(250);

      const count = getTurns().length;
      const path = location.pathname;
      if (count !== lastCount || path !== lastPath) {
        lastCount = count;
        lastPath = path;
        lastChangeAt = Date.now();
      }
    }
  };

  const collectChatMessages = () => {
    const turns = getTurns();
    const messages = Array.from(turns).map((turn, index) => {
      const roleEl = turn.querySelector("[data-message-author-role]");
      const role =
        roleEl?.dataset?.messageAuthorRole ||
        roleEl?.getAttribute("data-message-author-role") ||
        "unknown";

      const roleLabelMap = { user: "User", assistant: "Assistant", system: "System" };
      const author = roleLabelMap[role] || role;

      const textCandidates = turn.querySelectorAll(
        '[data-testid="text-message"], p, li, pre code, .markdown'
      );

      let text = Array.from(textCandidates)
        .map((el) => el.innerText?.trim?.() || "")
        .filter(Boolean)
        .join("\n\n");

      if (!text) text = turn.innerText?.trim?.() || "";

      return { index, author, role, text };
    });

    return messages.filter((m) => m.text && m.text.trim().length > 0);
  };

  const getSidebarScroller = () => document.querySelector('nav[aria-label="Chat history"]');

  const getSidebarChats = () => {
    const links = Array.from(document.querySelectorAll('#history a.AsOkList[href^="/c/"]'));
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
    for (let i = 0; i < 120; i++) {
      if (isCanceled()) throw new Error("Canceled.");
      const count = getSidebarChats().length;
      if (count === lastCount) break;
      lastCount = count;
      scroller.scrollTop = scroller.scrollHeight;
      await sleep(500);
    }
  };

  const clickChatByUrl = async (url) => {
    const path = new URL(url).pathname;
    const a = document.querySelector(`#history a.AsOkList[href="${CSS.escape(path)}"]`);
    if (!a) throw new Error(`Could not find chat link in sidebar for ${path}`);
    a.scrollIntoView({ block: "center" });
    a.click();
  };

  const getCurrentChatTitleFromSidebar = () => {
    const active = document.querySelector("#history a.AsOkList[data-active]") || null;
    if (!active) return null;
    return (active.querySelector('span[dir="auto"]')?.innerText || active.innerText || "").trim() || null;
  };

  const exportCurrentChat = async (settings) => {
    overlay.setStatus("Preparing current chat…");
    await waitForConversationReady(settings);
    const title = getCurrentChatTitleFromSidebar() || document.title || "Untitled chat";
    const messages = collectChatMessages();
    overlay.log(`Export current: ${title}`);
    downloadJSON(`${sanitizeFilename(title)}.json`, {
      title,
      url: location.href,
      exportedAt: new Date().toISOString(),
      messages
    });
    overlay.setStatus("Done.");
  };

  const exportVisibleChats = async (settings) => {
    const cfg = settings || {};
    const delayMs = cfg.delayMs ?? 1500;
    const maxChats = cfg.maxChats ?? 0;
    const autoScrollSidebar = cfg.autoScrollSidebar ?? true;

    overlay.setStatus("Collecting chats from sidebar…");
    if (autoScrollSidebar) await loadAllChatsInSidebar();

    const chats = getSidebarChats();
    if (!chats.length) throw new Error("No chats found in sidebar. Make sure the sidebar is open and Chats are visible.");

    const usedNames = new Map();
    const total = maxChats > 0 ? Math.min(maxChats, chats.length) : chats.length;
    const failures = [];
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      const { title, url } = chats[i];
      const targetPath = new URL(url).pathname;

      overlay.setProgress({ current: i + 1, total });
      overlay.setStatus(`Opening: ${title}`);
      overlay.log(`Open: ${title}`);

      if (isCanceled()) break;

      try {
        await clickChatByUrl(url);

        const start = Date.now();
        while (location.pathname !== targetPath) {
          if (isCanceled()) throw new Error("Canceled.");
          if (Date.now() - start > 20000) break;
          await sleep(100);
        }

        await waitForConversationReady(settings);

        const messages = collectChatMessages();

        let base = sanitizeFilename(title);
        const num = (usedNames.get(base) || 0) + 1;
        usedNames.set(base, num);
        if (num > 1) base = `${base} (${num})`;

        if (!messages.length) overlay.log(`Warning: 0 messages for "${title}"`);

        overlay.setStatus(`Downloading: ${base}.json`);
        downloadJSON(`${base}.json`, {
          title,
          url: location.href,
          exportedAt: new Date().toISOString(),
          messages
        });

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

    if (failures.length) {
      overlay.setStatus(`Done with errors. Exported ${successCount}/${total}.`);
      overlay.log(`Failed chats: ${failures.length}`);
    } else {
      overlay.setStatus(`Done. Exported ${successCount}/${total}.`);
    }
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

  window.ChatGPTChatExporter = {
    run,
    cancel
  };
})();

