# Quiet Crab

Silent-logging + global-shortcut Chrome/Edge extensions for AI chat web apps. No API, no key — everything goes through your own logged-in browser session, same as typing it yourself.
悄悄记录你说的话、全局快捷键转发剪贴板/截图的 Chrome/Edge 扩展。不碰 API、不用 key,发送经由你自己已登录的浏览器会话,和手打无异。

This repo holds **two independent extensions**, one per site — install whichever (or both) you need:
本仓库放两个**互相独立**的扩展，按站点分开，需要哪个装哪个（也可以都装）：

- [`claude/`](claude) — for **claude.ai**
- [`chatgpt/`](chatgpt) — for **chatgpt.com**

Each folder is a complete, self-contained MV3 extension with its own `manifest.json`; load them separately via `chrome://extensions` → Developer mode → **Load unpacked**, pointing at the specific subfolder. They can both be installed at once without conflicting (default global shortcuts are deliberately different between the two — see each folder's README).

每个文件夹都是一个完整独立的 MV3 扩展，各自有自己的 `manifest.json`；在 `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** 里分别选对应子文件夹加载即可。两个可以同时装着不冲突（默认全局快捷键刻意错开，详见各自文件夹里的 README）。

See each subfolder's own README for install steps, shortcuts, and site-specific notes.
具体安装步骤、快捷键、站点相关说明见各子文件夹自己的 README。
