# Quiet Crab · GPT

**[English](#english) · [中文](#中文)**

---

## English

Chrome / Edge extension for **chatgpt.com**. Silently logs what you say, sends only what you click; two global shortcuts relay clipboard text or a screenshot to whichever ChatGPT tab is open — no API, no key, just your own chatgpt.com session.

This is the sibling version of [Quiet Crab](../claude), wired up for chatgpt.com instead; the two are **fully independent extensions** (load each folder separately), and can be installed side by side without conflicting (default global shortcuts are deliberately different).

### Features

- **Silent logging** — turn on the floating button and what you say (auto-split by speech pauses) goes into the sidebar, **not to ChatGPT**. Click an entry to bundle it with context + your instruction and send it to the current chatgpt.com tab.
- **Global shortcuts** — from **any tab**, send clipboard text or a screenshot of the current tab to whichever ChatGPT tab is open, without switching back to chatgpt.com yourself.
- No API, no key — everything goes through your own logged-in chatgpt.com session, same as typing it yourself.

### Install

1. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. Open or refresh https://chatgpt.com — a ✦ button appears in the bottom right.
3. (Optional) Check or change the two shortcuts at `chrome://extensions/shortcuts`.

### Global shortcuts

- **Ctrl/⌘+Shift+G** — send the current clipboard text to the open ChatGPT tab and submit it.
- **Ctrl/⌘+Shift+K** — capture the visible area of your current active tab, deliver it to the open ChatGPT tab, and try to auto-submit it.

(Defaults deliberately differ from the Claude version's U/Y, so both can be installed without fighting over shortcuts.)

### Silent logging usage

1. Click ✦ to open the sidebar → click the mic icon to start talking. **Pauses auto-split your speech into entries** (or type manually and press Enter to save one).
2. Click an entry to bundle it with context and send it to the **current** chatgpt.com tab for an answer.
3. Export your log anytime as `.txt` / `.md` / `.json` from Settings.
4. Use ⇥ / ⇤ in the panel header to dock it to the right edge (the page shrinks to make room) or float it. **Drag the panel's left edge to resize** it (280px minimum, at least 320px is always left for the page); double-click the edge to reset. The width is remembered.

### Good to know

1. **Text delivery is fully automatic and reliable; screenshot delivery (paste + auto-send) is best-effort.** A screenshot is written to the system clipboard and pasted into the input box, then the extension polls for the Send button to become enabled (image upload takes a moment) before clicking it. If it doesn't go through, the image is still on your clipboard — just paste (Cmd/Ctrl+V) and press Enter yourself.
2. **Depends on chatgpt.com's page structure** — filling the input box and clicking Send relies on recognizing page elements (the `.ProseMirror` editor, and the submit button inside its `<form>` so it works in any UI language, with older-selector and generic fallbacks); a ChatGPT redesign may break this, at which point the selectors in `getComposerEl()` / `getSendBtn()` (content.js) and the matching functions in background.js need updating. Docking does **not** depend on class names: it measures which layout blocks still extend under the panel and narrows those, so it survives ChatGPT's hashed class names changing.
3. Global shortcuts and screenshots are coordinated by the background script; the browser may show a one-time permission prompt on first use.

### Structure

```
manifest.json     MV3: content script + background + global commands + permissions
content.js        The silent sidebar on chatgpt.com (logging / speech / click-to-send)
background.js     Background: global shortcuts, screenshots, cross-tab delivery
offscreen.html/js Reads clipboard text / writes images to the clipboard (background has no DOM, so this does it instead)
```

### Privacy

Your log is stored only in your local browser (`chrome.storage.local`, ~10MB, roughly 3 million characters). Speech recognition uses the browser's built-in engine. Everything you send goes through your own chatgpt.com session, same as typing it yourself.

---

## 中文

一个装在 **chatgpt.com 网页版**上的 Chrome / Edge 扩展。悄悄记录你说的话,只有你点了才发给 ChatGPT;两个全局快捷键能把剪贴板文字或截图转发到当前打开的 ChatGPT 标签页——不用 API、不用 key,用的还是你自己的 chatgpt.com 会话。

这是 [Quiet Crab](../claude) 的姊妹版本，专门对接 chatgpt.com；两者是**各自独立的扩展**（分别 `Load unpacked` 各自的文件夹），可以同时装在浏览器里互不干扰（快捷键默认值也刻意错开，避免冲突）。

### 功能

- **静默记录** — 打开悬浮按钮后,你说的话(语音停顿自动分句)会记进侧栏,**不会发给 ChatGPT**;点某一条时才把「该条 + 上下文 + 指令」拼好发到当前 chatgpt.com 页。
- **全局快捷键** — 在**任意标签页**按快捷键,把剪贴板文字或当前标签页截图发到当前打开的 ChatGPT 标签页,不用自己切回去。
- 不碰 API、不用 key,发送经由你自己的 chatgpt.com 会话,和手打无异。

### 安装

1. 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选本文件夹。
2. 打开/刷新 https://chatgpt.com,右下角出现 ✦ 按钮。
3. (可选)去 `chrome://extensions/shortcuts` 确认或修改两个快捷键。

### 全局快捷键

- **Ctrl/⌘+Shift+G** — 把当前剪贴板文字发到当前打开的 ChatGPT 页并发送。
- **Ctrl/⌘+Shift+K** — 截「当前活动标签页」的可见区,发到当前打开的 ChatGPT 页并尝试自动发送。

(默认值和 Claude 版的 U/Y 刻意不同，两个扩展同时装着也不会抢快捷键。)

### 静默记录用法

1. 点 ✦ 开侧栏 → 点麦克风图标开口,**停顿处自动分成一条条**(也可手动输入,回车存一条)。
2. 点某一条 → 拼好上下文丢进**当前** chatgpt.com 页作答。
3. 导出:设置里可导出 `.txt` / `.md` / `.json`。
4. 面板顶部的 ⇥ / ⇤ 切换「停靠到右侧」(页面自动让出位置)和「悬浮」。**拖面板左边缘可以调宽窄**(最窄 280px,至少给页面留 320px),双击边缘恢复默认,宽度会记住。

### 必须知道的边界

1. **文字投递是全自动、稳的;截图「自动进输入框 + 自动发送」是尽力而为。** 截图会先写进系统剪贴板并粘贴进输入框,再等 Send 按钮从禁用变可点(图片上传中)后自动点击发送。若没自动发成功,图已经在剪贴板里,手动 Cmd/Ctrl+V 再回车即可。
2. **依赖 chatgpt.com 页面结构**:填输入框/点发送靠识别页面元素(`.ProseMirror` 编辑器,以及它所在 `<form>` 里的提交按钮,不受界面语言影响;并留了旧选择器和通用兜底),ChatGPT 改版可能导致失效,届时更新 content.js 里的 `getComposerEl()` / `getSendBtn()` 和 background.js 里对应的选择器即可。停靠**不依赖**类名:它实测哪些布局层还伸到面板底下就把哪层挤窄,所以 ChatGPT 的哈希类名变了也不受影响。
3. 全局快捷键与截图由后台协调;首次触发时浏览器可能就权限弹一次确认。

### 结构

```
manifest.json     MV3:内容脚本 + 后台 + 全局命令 + 权限
content.js        chatgpt.com 上的静默侧栏(记录/语音/点击发送)
background.js     后台:全局快捷键、截图、跨页投递
offscreen.html/js 读剪贴板文字 / 写图片到剪贴板(后台无 DOM,借它代做)
```

### 隐私

记录只存本机浏览器(chrome.storage.local,约 10MB,可存约三百万字)。语音用浏览器自带识别。发送经由你自己的 chatgpt.com 会话,和手打无异。
