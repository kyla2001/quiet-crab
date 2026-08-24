// ── ChatGPT 静默模式 ─────────────────────────────────────────────
// 在 chatgpt.com 上叠一层：悬浮按钮开启静默模式；你的话进本扩展的侧栏
// （不发给 ChatGPT）；点某条时才把「该条+上下文+指令」拼好塞进 ChatGPT
// 输入框并发送。整个 UI 用 Shadow DOM 隔离，避免和 chatgpt.com 样式冲突。

(function () {
  if (window.__gptSilentModeLoaded) return;
  window.__gptSilentModeLoaded = true;

  const state = {
    open: false,
    docked: false,
    entries: [],          // { id, text, t }
    contextDepth: 8,
    instruction: "请针对上面标记的这句话，结合上下文给出简明分析或建议，直接给内容。",
    autoSend: true,
  };

  // ---- 持久化 ----
  chrome.storage.local.get(["sm_entries", "sm_settings"]).then((r) => {
    if (r.sm_entries) state.entries = r.sm_entries;
    if (r.sm_settings) Object.assign(state, r.sm_settings);
    renderEntries();
    syncSettingsUI();
    applyLayout();
  });
  function saveEntries() { chrome.storage.local.set({ sm_entries: state.entries }); }
  function saveSettings() {
    chrome.storage.local.set({ sm_settings: { contextDepth: state.contextDepth, instruction: state.instruction, autoSend: state.autoSend, docked: state.docked } });
  }

  // ---- Shadow DOM 容器 ----
  const host = document.createElement("div");
  host.id = "gpt-silent-mode-host";
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = TEMPLATE();

  const $ = (sel) => root.querySelector(sel);
  const panel = $(".panel");
  const fab = $(".fab");
  const listEl = $(".list");
  const emptyEl = $(".empty");
  const input = $(".input");
  const micBtn = $(".mic");
  const dot = $(".dot");
  const statusText = $(".status");

  const dockBtn = $(".dock");

  // ---- 悬浮按钮开关 ----
  fab.addEventListener("click", () => setOpen(!state.open));
  $(".close").addEventListener("click", () => setOpen(false));
  dockBtn.addEventListener("click", () => { state.docked = !state.docked; saveSettings(); applyLayout(); });

  function setOpen(v) {
    state.open = v;
    panel.classList.toggle("show", v);
    fab.classList.toggle("active", v);
    fab.style.display = v ? "none" : "flex"; // 打开后隐藏悬浮球，避免遮挡
    applyLayout();
    updateStatus();
  }

  // 停靠时给页面右侧留出面板宽度，页面内容不再被遮住。
  // 实测过：真正锁死宽度的不是 html/body，而是 ChatGPT 页面里 class 带
  // h-svh + w-screen（Tailwind 的 100vw）的最外层 div；它往下的子层都是
  // w-full（跟着父级百分比走），所以只挤这一层，子内容会自然一起收缩，
  // 不用再靠 overflow-x:hidden 硬裁切。若 ChatGPT 改版把这层类名换掉，
  // dockTarget() 会退回 <html>（挤不动但至少不会裁切内容）。
  const PANEL_W = 380;
  function dockTarget() {
    return document.querySelector(".h-svh.w-screen") || document.documentElement;
  }
  function applyLayout() {
    panel.classList.toggle("docked", state.docked);
    dockBtn.textContent = state.docked ? "⇤" : "⇥";
    dockBtn.title = state.docked ? "改为悬浮" : "停靠到右侧";
    const on = state.open && state.docked;
    const el = dockTarget();
    el.style.transition = "width .2s ease";
    if (on) el.style.setProperty("width", `calc(100vw - ${PANEL_W}px)`, "important");
    else el.style.removeProperty("width");
  }
  function updateStatus() {
    dot.classList.toggle("on", state.open);
    statusText.textContent = state.open ? "默默记录中 · 你的话不会发给 ChatGPT" : "已关闭";
  }

  // ---- 记一条 ----
  function pushEntry(text) {
    text = (text || "").trim();
    if (!text) return;
    state.entries.push({ id: uid(), text, t: Date.now() });
    saveEntries();
    renderEntries();
  }
  function addEntry(text) {
    const t = (text || "").trim();
    if (!t) return;
    pushEntry(t);
    input.value = "";
    input.focus();
  }
  $(".add").addEventListener("click", () => addEntry(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addEntry(input.value); }
  });

  // ---- 语音输入：停顿自动分句落成一条 ----
  let recog = null, listening = false, wantListen = false;
  let liveText = "";

  micBtn.addEventListener("click", () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { flash("此浏览器不支持语音输入"); return; }
    if (listening || wantListen) { wantListen = false; try { recog.stop(); } catch (_) {} return; }
    wantListen = true;
    startRecog(SR);
  });

  function startRecog(SR) {
    recog = new SR();
    recog.lang = (state.sttLang || "en-US");
    recog.continuous = true;
    recog.interimResults = true;

    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          pushEntry(t);
        } else {
          interim += t;
        }
      }
      liveText = interim;
      renderLive();
    };
    recog.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        wantListen = false; flash("麦克风权限被拒绝");
      }
    };
    recog.onend = () => {
      listening = false;
      if (wantListen) { try { recog.start(); listening = true; } catch (_) {} }
      else { micBtn.classList.remove("on"); liveText = ""; renderLive(); }
    };
    try { recog.start(); listening = true; micBtn.classList.add("on"); }
    catch (_) {}
  }

  // ---- 渲染记录 ----
  function renderEntries() {
    emptyEl.style.display = state.entries.length ? "none" : "block";
    [...listEl.querySelectorAll(".row")].forEach((n) => n.remove());
    state.entries.forEach((e, i) => {
      const row = document.createElement("div");
      row.className = "row";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.title = "点击 → 拼好上下文丢给 ChatGPT 作答";
      bubble.addEventListener("click", () => askGPT(e));

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<span>[${i + 1}]</span><span>${fmt(e.t)}</span><span class="hint">✦ 点击让 ChatGPT 答</span>`;

      const txt = document.createElement("div");
      txt.className = "btext";
      txt.textContent = e.text;

      bubble.appendChild(meta);
      bubble.appendChild(txt);

      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "✕";
      del.title = "删除";
      del.addEventListener("click", (ev) => { ev.stopPropagation(); state.entries = state.entries.filter((x) => x.id !== e.id); saveEntries(); renderEntries(); });

      row.appendChild(bubble);
      row.appendChild(del);
      listEl.appendChild(row);
    });
    renderLive();
    listEl.scrollTop = listEl.scrollHeight;
  }

  function renderLive() {
    const old = listEl.querySelector(".liverow");
    if (old) old.remove();
    if (!liveText) return;
    emptyEl.style.display = "none";
    const row = document.createElement("div");
    row.className = "row liverow";
    const b = document.createElement("div");
    b.className = "bubble live";
    b.textContent = liveText;
    row.appendChild(b);
    listEl.appendChild(row);
    listEl.scrollTop = listEl.scrollHeight;
  }

  // ---- 点某条 → 拼好 → 塞进 ChatGPT 输入框并发送 ----
  function askGPT(entry) {
    const idx = state.entries.findIndex((x) => x.id === entry.id);
    const ctx = state.entries
      .slice(Math.max(0, idx - state.contextDepth), idx + 1)
      .map((x, k) => {
        const n = Math.max(0, idx - state.contextDepth) + k + 1;
        const marker = x.id === entry.id ? "  ← 请针对这句" : "";
        return `[${n}] ${x.text}${marker}`;
      })
      .join("\n");

    const prompt = `以下是记录片段：\n${ctx}\n\n${state.instruction}`;

    try { navigator.clipboard.writeText(prompt); } catch (_) {}

    const ok = injectToComposer(prompt);
    if (!ok) { flash("没找到 ChatGPT 输入框，已复制到剪贴板，手动粘贴即可"); return; }
    if (state.autoSend) trySend();
    else flash("已填入输入框，按回车发送");
  }

  // ChatGPT 的 composer 是 id="prompt-textarea" 的 ProseMirror contenteditable div；
  // 通用 contenteditable / textarea 选择器兜底，防止 ChatGPT 改版后 id 失效。
  function getComposerEl() {
    return document.querySelector("#prompt-textarea") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea");
  }
  function getSendBtn() {
    return document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label*="Send" i]');
  }

  function injectToComposer(text) {
    const el = getComposerEl();
    if (!el) return false;
    el.focus();
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // ProseMirror / contenteditable：清空后插入
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, text);
      } catch (_) {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    return true;
  }

  function trySend() {
    setTimeout(() => {
      const btn = getSendBtn();
      if (btn && !btn.disabled) { btn.click(); return; }
      const el = getComposerEl();
      if (el) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    }, 80);
  }

  // ---- 设置区 ----
  const depthInput = $(".depth");
  const instrInput = $(".instr");
  const autoChk = $(".auto");
  depthInput.addEventListener("change", () => { state.contextDepth = Math.max(0, parseInt(depthInput.value) || 0); saveSettings(); });
  instrInput.addEventListener("change", () => { state.instruction = instrInput.value.trim() || state.instruction; saveSettings(); });
  autoChk.addEventListener("change", () => { state.autoSend = autoChk.checked; saveSettings(); });
  $(".clear").addEventListener("click", () => { if (confirm("清空所有记录？")) { state.entries = []; saveEntries(); renderEntries(); } });
  function syncSettingsUI() { depthInput.value = state.contextDepth; instrInput.value = state.instruction; autoChk.checked = state.autoSend; }

  // ---- 隔离键盘/剪贴板事件，别让它冒泡到 chatgpt.com 抢焦点 ----
  function isolate(el) {
    ["keydown", "keyup", "keypress", "beforeinput", "input", "paste", "copy", "cut"].forEach((t) =>
      el.addEventListener(t, (e) => e.stopPropagation()));
  }
  isolate(input); isolate(instrInput); isolate(depthInput);

  // ---- 导出记录 ----
  function exportEntries(kind) {
    if (!state.entries.length) { flash("还没有记录可导出"); return; }
    const day = new Date().toLocaleString("zh-CN");
    let text, ext;
    if (kind === "json") {
      text = JSON.stringify(state.entries, null, 2); ext = "json";
    } else if (kind === "md") {
      text = `# 会议记录 ${day}\n\n` + state.entries.map((e, i) => `${i + 1}. \`${fmt(e.t)}\` ${e.text}`).join("\n"); ext = "md";
    } else {
      text = `会议记录 ${day}\n\n` + state.entries.map((e, i) => `[${i + 1}] ${fmt(e.t)}  ${e.text}`).join("\n"); ext = "txt";
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `会议记录_${Date.now()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`已导出 ${state.entries.length} 条（.${ext}）`);
  }
  $(".exp-txt").addEventListener("click", () => exportEntries("txt"));
  $(".exp-md").addEventListener("click", () => exportEntries("md"));
  $(".exp-json").addEventListener("click", () => exportEntries("json"));

  // ---- 小工具 ----
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmt(t) { return new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
  let flashTimer = null;
  function flash(msg) {
    const t = $(".toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(flashTimer); flashTimer = setTimeout(() => t.classList.remove("show"), 3000);
  }

  updateStatus();

  function TEMPLATE() {
    return `
<style>
  * { box-sizing: border-box; font-family: -apple-system, "PingFang SC", system-ui, sans-serif; }
  .fab {
    position: fixed; right: 20px; bottom: 20px; width: 52px; height: 52px; border-radius: 50%;
    background: #ffffff; border: 1px solid #e2e2e5; color: #0f7a5c; cursor: pointer;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); font-size: 20px; display: flex; align-items: center; justify-content: center;
    transition: all .2s;
  }
  .fab:hover { transform: translateY(-2px); }
  .fab.active { background: #ecfdf5; border-color: #10a37f; color: #0f7a5c; }
  .panel {
    position: fixed; right: 20px; bottom: 84px; width: 380px; max-width: calc(100vw - 40px);
    height: 560px; max-height: calc(100vh - 120px);
    background: #ffffff; color: #1f2328; border: 1px solid #e2e2e5; border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0,0,0,.22); display: none; flex-direction: column; overflow: hidden;
    transition: none;
  }
  .panel.show { display: flex; }
  .panel.docked { top: 0; right: 0; bottom: 0; width: 380px; height: 100vh; max-height: 100vh; border-radius: 0; border-right: none; box-shadow: -4px 0 24px rgba(0,0,0,.12); }
  .head { display: flex; align-items: center; gap: 10px; padding: 13px 15px; border-bottom: 1px solid #ececee; background: #f7f7f8; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #cfd2d6; flex: none; }
  .dot.on { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.15); }
  .htext { flex: 1; min-width: 0; }
  .htitle { font-size: 14px; font-weight: 600; }
  .status { font-size: 11px; color: #8a8f98; margin-top: 2px; }
  .dock, .close { background: none; border: none; color: #9aa0a8; cursor: pointer; font-size: 15px; padding: 2px 4px; }
  .dock:hover, .close:hover { color: #0f7a5c; }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .empty { margin: auto; text-align: center; color: #9aa0a8; font-size: 13px; line-height: 1.6; max-width: 260px; }
  .row { display: flex; gap: 6px; align-items: flex-start; }
  .bubble { flex: 1; min-width: 0; background: #f7f7f8; border: 1px solid #ececee; border-radius: 12px; padding: 9px 12px; cursor: pointer; transition: all .16s; }
  .bubble:hover { border-color: #10a37f; background: #ecfdf5; }
  .bubble.live { border-style: dashed; opacity: .6; cursor: default; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.live:hover { border-color: #ececee; background: #f7f7f8; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #8a8f98; margin-bottom: 4px; }
  .meta .hint { margin-left: auto; color: #0f7a5c; opacity: .7; }
  .btext { font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: #1f2328; }
  .del { background: none; border: none; color: #c2c6cc; cursor: pointer; font-size: 12px; padding: 4px; flex: none; }
  .del:hover { color: #dc2626; }
  .composer { border-top: 1px solid #ececee; padding: 10px; background: #f7f7f8; max-height: 60%; overflow-y: auto; }
  .inputrow { display: flex; gap: 8px; align-items: flex-end; }
  .input { flex: 1; resize: none; height: 44px; max-height: 120px; padding: 10px 12px; border-radius: 10px; border: 1px solid #d7d9dd; background: #fff; color: #1f2328; font-size: 13.5px; line-height: 1.4; }
  .input:focus { outline: none; border-color: #10a37f; }
  .mic, .add { border: 1px solid #d7d9dd; background: #fff; color: #1f2328; border-radius: 10px; cursor: pointer; font-size: 13px; padding: 0 12px; height: 44px; flex: none; }
  .mic { display: flex; align-items: center; justify-content: center; }
  .mic svg { width: 18px; height: 18px; }
  .mic.on { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
  .add { background: #10a37f; border-color: #10a37f; color: #fff; font-weight: 600; }
  details { margin-top: 8px; }
  summary { font-size: 11.5px; color: #6b7280; cursor: pointer; }
  .settings { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-size: 12px; color: #4b5563; }
  .settings label { display: flex; align-items: center; gap: 8px; }
  .depth { width: 56px; padding: 4px 6px; border-radius: 6px; border: 1px solid #d7d9dd; background: #fff; color: #1f2328; }
  .instr { width: 100%; height: 46px; resize: none; padding: 6px 8px; border-radius: 6px; border: 1px solid #d7d9dd; background: #fff; color: #1f2328; font-size: 12px; }
  .clear { align-self: flex-start; background: #fff; border: 1px solid #d7d9dd; color: #dc2626; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11.5px; }
  .exprow { display: flex; align-items: center; gap: 6px; }
  .exprow button { background: #fff; border: 1px solid #d7d9dd; color: #374151; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11.5px; }
  .exprow button:hover { border-color: #10a37f; color: #0f7a5c; }
  .tip { font-size: 11px; color: #9aa0a8; line-height: 1.5; }
  .toast { position: fixed; right: 20px; bottom: 150px; background: #ecfdf5; color: #0f7a5c; border: 1px solid #10a37f; padding: 8px 13px; border-radius: 9px; font-size: 12px; opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 340px; box-shadow: 0 6px 20px rgba(0,0,0,.15); }
  .toast.show { opacity: 1; }
</style>

<button class="fab" title="ChatGPT 静默模式">✦</button>
<div class="panel">
  <div class="head">
    <span class="dot"></span>
    <div class="htext">
      <div class="htitle">Quiet Crab · GPT</div>
      <div class="status">已关闭</div>
    </div>
    <button class="dock" title="停靠到右侧 / 悬浮">⇥</button>
    <button class="close">✕</button>
  </div>
  <div class="list">
    <div class="empty">点麦克风开口，<b>停顿处自动分成一条条</b>，全部只记在这里、<b>不发给 ChatGPT</b>。<br/><br/>想让 ChatGPT 分析某句时，点那一条 —— 它会连同上下文一起丢过去作答。</div>
  </div>
  <div class="composer">
    <div class="inputrow">
      <textarea class="input" placeholder=""></textarea>
      <button class="mic" title="语音输入：停顿自动分句"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>
      <button class="add">记一条</button>
    </div>
    <details>
      <summary>设置</summary>
      <div class="settings">
        <label>点击时带上前 <input class="depth" type="number" min="0" /> 条上下文</label>
        <label><input class="auto" type="checkbox" /> 拼好后自动发送（关闭则只填入输入框，你自己按回车）</label>
        <label style="align-items:flex-start;flex-direction:column;gap:4px;">给 ChatGPT 的指令：<textarea class="instr"></textarea></label>
        <div class="exprow">导出记录：<button class="exp-txt">.txt</button><button class="exp-md">.md</button><button class="exp-json">.json</button></div>
        <div class="tip">Ctrl/⌘+Shift+G：剪贴板文字 → 当前打开的 ChatGPT 页<br/>Ctrl/⌘+Shift+K：截当前页 → 当前打开的 ChatGPT 页<br/>快捷键可在 chrome://extensions/shortcuts 修改</div>
        <button class="clear">清空所有记录</button>
      </div>
    </details>
  </div>
</div>
<div class="toast"></div>
`;
  }
})();
