# R 系列桌面软件规范

从 R JSON 抽出的开发约定和视觉约定。新软件沿用这套，看起来就是同一套产品。

| 文档 | 内容 |
| --- | --- |
| [development.md](development.md) | 工程结构、技术栈、前后端分工、交互约定 |
| [style.md](style.md) | 颜色、字号、布局、控件、主题 |
| [release.md](release.md) | GitHub Actions 打包、签名和发版 |
| [tokens.css](tokens.css) | 可直接拷贝的颜色、字体和基础控件样式 |

新项目先复制 `tokens.css`，窗口骨架按 [style.md](style.md) 搭。功能逻辑按 [development.md](development.md) 分工。
