// 在 offscreen 文档里代做剪贴板读写（service worker 无 DOM，无法直接操作）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.__offscreen) return;
  (async () => {
    try {
      if (msg.action === "readText") {
        const ta = document.getElementById("scratch");
        ta.value = "";
        ta.focus();
        document.execCommand("paste");
        sendResponse(ta.value || "");
      } else if (msg.action === "writeImage") {
        const res = await fetch(msg.payload); // dataURL → blob
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        sendResponse(true);
      }
    } catch (e) {
      sendResponse("");
    }
  })();
  return true;
});
