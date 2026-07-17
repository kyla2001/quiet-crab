// ── 后台协调 ────────────────────────────────────────────────────
// 1) 记住用户在面板里选定的「目标 Claude 标签页」
// 2) 接管两个全局快捷键：上传剪贴板文字 / 截当前标签页
// 3) 通过 offscreen 文档读写剪贴板；通过 scripting 把内容投递进目标 Claude 页

// ---- offscreen（读剪贴板文字、写图片到剪贴板）----
let offscreenReady = null;
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "读写剪贴板以在标签页间传递文字与截图",
    });
  }
  await offscreenReady;
  offscreenReady = null;
}
async function offscreenDo(action, payload) {
  await ensureOffscreen();
  return await chrome.runtime.sendMessage({ __offscreen: true, action, payload });
}

// ---- 快捷键实际使用的目标：优先当前选中，其次清单里第一个活着的 ----
async function getTargetTab() {
  const { targetTabId } = await chrome.storage.local.get("targetTabId");
  const list = await liveTargets();
  if (targetTabId) {
    const hit = list.find((t) => t.id === targetTabId);
    if (hit) return hit;
  }
  return list[0] || null;
}

// ---- 目标清单读写 ----
async function getTargets() {
  const { sm_targets } = await chrome.storage.local.get("sm_targets");
  return Array.isArray(sm_targets) ? sm_targets : [];
}
async function setTargets(list) { await chrome.storage.local.set({ sm_targets: list }); }

// 校验清单里哪些标签页还活着，顺带更新标题
async function liveTargets() {
  const list = await getTargets();
  const out = [];
  for (const t of list) {
    try {
      const tab = await chrome.tabs.get(t.id);
      if (tab && tab.url && tab.url.startsWith("https://claude.ai")) out.push({ id: tab.id, title: tab.title || t.title || "Claude" });
    } catch (_) { /* 已关闭，丢弃 */ }
  }
  return out;
}

// ---- 面板发来的请求 ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.__offscreen) return; // 发给 offscreen 的，忽略
  (async () => {
    if (msg.type === "LIST_TARGETS") {
      const targets = await liveTargets();
      await setTargets(targets); // 顺手清掉已关闭的
      const { targetTabId } = await chrome.storage.local.get("targetTabId");
      const validSel = targets.some((t) => t.id === targetTabId) ? targetTabId : (targets[0] ? targets[0].id : null);
      if (validSel !== targetTabId) await chrome.storage.local.set({ targetTabId: validSel });
      sendResponse({ targets, targetTabId: validSel });
    } else if (msg.type === "ADD_TARGET_CURRENT") {
      if (sender.tab && sender.tab.id) {
        const list = await liveTargets();
        if (!list.some((t) => t.id === sender.tab.id)) list.push({ id: sender.tab.id, title: sender.tab.title || "Claude" });
        await setTargets(list);
        await chrome.storage.local.set({ targetTabId: sender.tab.id }); // 加完即设为当前
        sendResponse({ ok: true, title: sender.tab.title });
      } else sendResponse({ ok: false });
    } else if (msg.type === "CLEAR_TARGETS") {
      await setTargets([]);
      await chrome.storage.local.set({ targetTabId: null });
      sendResponse({ ok: true });
    } else if (msg.type === "SET_TARGET") {
      await chrome.storage.local.set({ targetTabId: msg.tabId });
      sendResponse({ ok: true });
    }
  })();
  return true;
});

// ---- 全局快捷键 ----
chrome.commands.onCommand.addListener(async (command) => {
  const target = await getTargetTab();
  if (!target) { notify("目标清单是空的：在面板里用「+」把某个 Claude 页加进来"); return; }

  if (command === "upload_clipboard") {
    let text = "";
    try { text = await offscreenDo("readText"); } catch (_) {}
    text = (text || "").trim();
    if (!text) { notify("剪贴板是空的，或读取失败"); return; }
    await deliverText(target.id, text);
  } else if (command === "screenshot") {
    // 截「当前活动标签页」（你鼠标所在的那个）的可见区
    let dataUrl;
    try {
      const win = await chrome.windows.getLastFocused();
      dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: "png" });
    } catch (e) { notify("截图失败：" + e.message); return; }
    await deliverImage(target.id, dataUrl);
  }
});

// ---- 投递文字：注入目标 Claude 页，填输入框并发送 ----
async function deliverText(tabId, text) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectTextAndSend,
    args: [text],
  });
  // 顺手把目标页激活，方便你看到
  try { const t = await chrome.tabs.get(tabId); chrome.windows.update(t.windowId, { focused: true }); chrome.tabs.update(tabId, { active: true }); } catch (_) {}
}

// ---- 投递图片：写进剪贴板 + 切到目标页 + 尝试模拟粘贴 ----
async function deliverImage(tabId, dataUrl) {
  // 1) 图片写进系统剪贴板（offscreen 完成），作为可靠兜底
  try { await offscreenDo("writeImage", dataUrl); } catch (_) {}
  // 2) 切到目标 Claude 页
  try { const t = await chrome.tabs.get(tabId); await chrome.windows.update(t.windowId, { focused: true }); await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
  // 3) 注入：把图片作为 File 模拟 paste 事件塞进输入框（成功则直接进附件）
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectImagePaste,
    args: [dataUrl],
  });
}

function notify(message) {
  // 用 badge 提示；避免依赖 notifications 权限
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setTitle({ title: "Claude 静默模式 — " + message });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

// ==== 下面两个函数会被注入到目标 Claude 页里执行 ====
function injectTextAndSend(text) {
  const el = document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
  if (!el) return;
  el.focus();
  if (el.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    try {
      const sel = window.getSelection(); const r = document.createRange();
      r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
      document.execCommand("insertText", false, text);
    } catch (_) { el.textContent = text; }
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
  setTimeout(() => {
    const btn = document.querySelector('button[aria-label*="Send" i]') || document.querySelector('button[aria-label*="发送" i]');
    if (btn && !btn.disabled) btn.click();
    else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }, 120);
}

function injectImagePaste(dataUrl) {
  try {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bin = atob(arr[1]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], "screenshot.png", { type: mime });
    const el = document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
    if (!el) return;
    el.focus();
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
  } catch (_) {}
}
