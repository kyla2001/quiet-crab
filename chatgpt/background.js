// ── 后台协调 ────────────────────────────────────────────────────
// 1) 接管两个全局快捷键：上传剪贴板文字 / 截当前标签页
// 2) 通过 offscreen 文档读写剪贴板；通过 scripting 把内容投递进当前打开的 ChatGPT 页

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

// ---- 快捷键实际使用的目标：随便挑一个已打开的 ChatGPT 页，优先当前激活的那个 ----
async function getTargetTab() {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
  if (!tabs.length) return null;
  const pick = tabs.find((t) => t.active) || tabs[0];
  return { id: pick.id, title: pick.title || "ChatGPT" };
}

// ---- 全局快捷键 ----
chrome.commands.onCommand.addListener(async (command) => {
  const target = await getTargetTab();
  if (!target) { notify("没有打开的 chatgpt.com 页：先打开一个再试"); return; }

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

// ---- 把目标标签页切到前台（必须在注入前做：目标页拿到系统焦点，填字/模拟粘贴才生效在它身上）----
async function activateTab(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    await chrome.windows.update(t.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
  } catch (_) {}
}

// ---- 投递文字：切到目标页，再注入填输入框并发送 ----
async function deliverText(tabId, text) {
  await activateTab(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectTextAndSend,
    args: [text],
  });
}

// ---- 投递图片：写进剪贴板 + 切到目标页 + 尝试模拟粘贴 ----
async function deliverImage(tabId, dataUrl) {
  try { await offscreenDo("writeImage", dataUrl); } catch (_) {}
  await activateTab(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectImagePaste,
    args: [dataUrl],
  });
}

function notify(message) {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setTitle({ title: "ChatGPT 静默模式 — " + message });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

// ==== 下面两个函数会被注入到目标 ChatGPT 页里执行 ====
// ChatGPT 的 composer 是 ProseMirror contenteditable div（新版已去掉 id="prompt-textarea"）；
// 发送按钮按「同一 form 里的 submit 按钮」找，不依赖随界面语言变化的 aria-label。
function injectTextAndSend(text) {
  const el = document.querySelector('.ProseMirror[contenteditable="true"]') ||
    document.querySelector("#prompt-textarea") ||
    document.querySelector('div[contenteditable="true"]') ||
    document.querySelector("textarea");
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
  // 输入框为空时没有发送按钮，填入文字后 React 才换上来；轮询等它出现，而不是固定延时
  const deadline = Date.now() + 5000;
  const tryClick = () => {
    const btn = el.closest("form")?.querySelector('button[type="submit"]') ||
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label*="Send" i], button[aria-label*="发送"]');
    if (btn && !btn.disabled) { btn.click(); return; }
    if (Date.now() < deadline) setTimeout(tryClick, 100);
  };
  setTimeout(tryClick, 80);
}

function injectImagePaste(dataUrl) {
  try {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bin = atob(arr[1]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], "screenshot.png", { type: mime });
    const el = document.querySelector('.ProseMirror[contenteditable="true"]') ||
      document.querySelector("#prompt-textarea") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea");
    if (!el) return;
    el.focus();
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);

    // 图片要先上传完成 Send 按钮才会从禁用变可点；轮询等它就绪再点，而不是固定延时
    const deadline = Date.now() + 15000;
    const tryClick = () => {
      const btn = el.closest("form")?.querySelector('button[type="submit"]') ||
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label*="Send" i], button[aria-label*="发送"]');
      if (btn && !btn.disabled) { btn.click(); return; }
      if (Date.now() < deadline) setTimeout(tryClick, 300);
    };
    setTimeout(tryClick, 300);
  } catch (_) {}
}
