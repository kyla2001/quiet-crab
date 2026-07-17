# Quiet Crab

Chrome / Edge extension for **claude.ai**. Silently logs what you say, sends only what you click; two global shortcuts relay clipboard text or a screenshot to whichever Claude tab is open — no API, no key, just your own claude.ai session.

一个装在 **claude.ai 网页版**上的 Chrome / Edge 扩展。悄悄记录你说的话,只有你点了才发给 Claude;两个全局快捷键能把剪贴板文字或截图转发到当前打开的 Claude 标签页——不用 API、不用 key,用的还是你自己的 claude.ai 会话。

## Features · 功能

- **Silent logging** — turn on the floating button and what you say (auto-split by speech pauses) goes into the sidebar, **not to Claude**. Click an entry to bundle it with context + your instruction and send it to the current claude.ai tab.
  **静默记录** — 打开悬浮按钮后,你说的话(语音停顿自动分句)会记进侧栏,**不会发给 Claude**;点某一条时才把「该条 + 上下文 + 指令」拼好发到当前 claude.ai 页。
- **Global shortcuts** — from **any tab**, send clipboard text or a screenshot of the current tab to whichever Claude tab is open, without switching back to claude.ai yourself.
  **全局快捷键** — 在**任意标签页**按快捷键,把剪贴板文字或当前标签页截图发到当前打开的 Claude 标签页,不用自己切回去。
- No API, no key — everything goes through your own logged-in claude.ai session, same as typing it yourself.
  不碰 API、不用 key,发送经由你自己的 claude.ai 会话,和手打无异。

## Install · 安装

1. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
   打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选本文件夹。
2. Open or refresh https://claude.ai — a ✦ button appears in the bottom right.
   打开/刷新 https://claude.ai,右下角出现 ✦ 按钮。
3. (Optional) Check or change the two shortcuts at `chrome://extensions/shortcuts`.
   (可选)去 `chrome://extensions/shortcuts` 确认或修改两个快捷键。

## Global shortcuts · 全局快捷键

- **Ctrl/⌘+Shift+U** — send the current clipboard text to the open Claude tab and submit it.
  把当前剪贴板文字发到当前打开的 Claude 页并发送。
- **Ctrl/⌘+Shift+Y** — capture the visible area of your current active tab, deliver it to the open Claude tab, and try to auto-submit it.
  截「当前活动标签页」的可见区,发到当前打开的 Claude 页并尝试自动发送。

## Silent logging · 静默记录用法

1. Click ✦ to open the sidebar → click the mic icon to start talking. **Pauses auto-split your speech into entries** (or type manually and press Enter to save one).
   点 ✦ 开侧栏 → 点麦克风图标开口,**停顿处自动分成一条条**(也可手动输入,回车存一条)。
2. Click an entry to bundle it with context and send it to the **current** claude.ai tab for an answer.
   点某一条 → 拼好上下文丢进**当前** claude.ai 页作答。
3. Export your log anytime as `.txt` / `.md` / `.json` from Settings.
   导出:设置里可导出 `.txt` / `.md` / `.json`。

## Good to know · 必须知道的边界

1. **Text delivery is fully automatic and reliable; screenshot delivery (paste + auto-send) is best-effort.** A screenshot is written to the system clipboard and pasted into the input box, then the extension polls for the Send button to become enabled (image upload takes a moment) before clicking it. If it doesn't go through, the image is still on your clipboard — just paste (Cmd/Ctrl+V) and press Enter yourself.
   **文字投递是全自动、稳的;截图「自动进输入框 + 自动发送」是尽力而为。** 截图会先写进系统剪贴板并粘贴进输入框,再等 Send 按钮从禁用变可点(图片上传中)后自动点击发送。若没自动发成功,图已经在剪贴板里,手动 Cmd/Ctrl+V 再回车即可。
2. **Depends on claude.ai's page structure** — filling the input box and clicking Send relies on recognizing page elements; a claude.ai redesign may break this, at which point the selectors need updating.
   **依赖 claude.ai 页面结构**:填输入框/点发送靠识别页面元素,claude.ai 改版可能导致失效,届时更新选择器即可。
3. Global shortcuts and screenshots are coordinated by the background script; the browser may show a one-time permission prompt on first use.
   全局快捷键与截图由后台协调;首次触发时浏览器可能就权限弹一次确认。

## Structure · 结构

```
manifest.json     MV3: content script + background + global commands + permissions
                  MV3:内容脚本 + 后台 + 全局命令 + 权限
content.js        The silent sidebar on claude.ai (logging / speech / click-to-send)
                  claude.ai 上的静默侧栏(记录/语音/点击发送)
background.js     Background: global shortcuts, screenshots, cross-tab delivery
                  后台:全局快捷键、截图、跨页投递
offscreen.html/js Reads clipboard text / writes images to the clipboard (background has no DOM, so this does it instead)
                  读剪贴板文字 / 写图片到剪贴板(后台无 DOM,借它代做)
```

## Privacy · 隐私

Your log is stored only in your local browser (`chrome.storage.local`, ~10MB, roughly 3 million characters). Speech recognition uses the browser's built-in engine. Everything you send goes through your own claude.ai session, same as typing it yourself.

记录只存本机浏览器(chrome.storage.local,约 10MB,可存约三百万字)。语音用浏览器自带识别。发送经由你自己的 claude.ai 会话,和手打无异。
