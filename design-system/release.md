# GitHub 打包与发版

按 R JSON 的 `.github/workflows/release.yml` 来。推送 `v*` tag 后，GitHub Actions 同时打 Windows、macOS、Linux 安装包，签名更新文件，创建 Release，并上传 `latest.json`。

## 仓库一次性准备

1. 生成更新签名密钥，私钥放在仓库外：

```powershell
npm run tauri signer generate -- -w "$HOME\.tauri\r-json.key"
```

2. 在 GitHub **Settings → Secrets and variables → Actions** 添加：

| Secret | 值 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `r-json.key` 的完整内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 密钥密码；没有密码就留空 |

私钥另外备份。丢了之后，已安装的旧版本无法再校验更新。公钥写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，私钥不要进 git。

3. 在 **Settings → Actions → General → Workflow permissions** 打开 **Read and write permissions**。工作流还要有 `contents: write`，否则创建不了 Release。
4. 仓库保持公开。应用启动后会匿名下载 `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`。

新软件沿用同一份工作流，只改这几处：

- `releaseName` 里的产品名
- `tauri.conf.json` 的 `identifier`、`productName`、公钥和 updater 地址
- 签名密钥文件名

## 工作流

文件是 `.github/workflows/release.yml`，名字叫 Publish。

- 触发：推送 `v*` tag，或在 Actions 页手动运行。手动运行仍然使用 `package.json` 里的版本。
- 矩阵：`macos-latest` 的 `aarch64-apple-darwin` 和 `x86_64-apple-darwin`，`ubuntu-22.04`，`windows-latest`。`fail-fast` 为 false。
- 依赖：Node.js LTS，Rust stable，前端用 `npm ci`。Linux 额外安装 `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`、`xdg-utils`。
- 打包：`tauri-apps/tauri-action@v1`。`tagName` 用 `v__VERSION__`，`updaterJsonPreferNsis: true`。

更新地址和安装方式写在 `tauri.conf.json`：

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/runbrick/r-json/releases/latest/download/latest.json"
    ],
    "windows": { "installMode": "passive" }
  }
}
```

`bundle.createUpdaterArtifacts` 必须是 `true`。

## 发布一个版本

版本号只改 `package.json`。`tauri.conf.json` 通过 `"version": "../package.json"` 读取。`npm version` 提交前会执行 `scripts/sync-version.mjs`，把同一版本写进 `src-tauri/Cargo.toml` 和 `Cargo.lock`，并加入这次版本提交。

一条命令完成升版本、提交、打 tag 并推送（推送 `v*` tag 后触发本工作流）：

```powershell
npm run version
```

默认是 `patch`。也可以指定级别或具体版本号：

```powershell
npm run version minor
npm run version 0.2.0
```

工作区必须是干净的。命令会推送当前分支和 `v*` tag。只想在本地改版本、提交并打 tag、暂不推送时，用 `npm version patch`、`npm version minor`、`npm version major` 或 `npm version 0.2.0`。

工作流结束后检查：

1. Release 附件里有各平台安装包和 `latest.json`。
2. 用旧版本安装，打开 **帮助 → 检查更新**，或等启动几秒后的自动检查。

## 本地打包

发布包在本地也可以打，配置走 `profile.release`：LTO、`codegen-units = 1`、`opt-level = 3`、`panic = abort`、strip。

```powershell
npm run tauri build
```

本地产物不签名、不上传，也不要拿它冒充 GitHub Release 的安装包。
