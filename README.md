# R HTML

浏览器工具：查看本地 HTML 或在线网页，快捷选取元素并查看元素详情，本地 HTML 可直接编辑并实时预览。在线网页只读。

## 功能

- **查看**：打开本地 `.html` / `.htm` 文件（含拖入窗口），或输入网址抓取在线网页，右栏实时渲染。
- **选取元素**：点击「选取元素」（Ctrl+Shift+C）后在预览中点击任意元素，元素页签显示标签、CSS 选择器、XPath、ID、类、全部属性、尺寸和文本，可一键复制；本地文档支持「定位源码」跳回编辑器对应位置。
- **编辑**：本地文档在 CodeMirror 中编辑，防抖 400ms 实时刷新预览；Ctrl+S 保存，Ctrl+Shift+S 另存为。在线网页编辑器只读。

## 开发

```powershell
npm install
npm run tauri dev
```

打包：

```powershell
npm run tauri build
```

发版见 [design-system/release.md](design-system/release.md)。界面与工程约定见 [design-system/](design-system/)。

## 目录

```
index.html          窗口骨架
src/main.ts         界面状态与交互
src/editor.ts       CodeMirror 封装
src/preview.ts      预览 iframe 与元素选取桥
src/ui.ts           菜单、模态框、状态栏消息
src/styles.css      全部样式（引入 tokens.css）
src/assets/         logo
src-tauri/src/      Rust 命令：读文件、保存、抓取网页
design-system/      R 系列规范，不参与构建
```

## 发版一次性准备

更新签名密钥已生成于 `%USERPROFILE%\.tauri\r-html.key`（不进 git，注意备份）。公钥已写入 `src-tauri/tauri.conf.json`。在 GitHub Secrets 配置 `TAURI_SIGNING_PRIVATE_KEY`（私钥内容）和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（空），并把 `tauri.conf.json` / `.github/workflows/release.yml` 里的仓库地址改成实际仓库。
