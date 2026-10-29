// R HTML 主界面：状态、交互与前后端 glue。
import "./styles.css";
import logoUrl from "./assets/logo.svg";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { el, requireEl, setupMenus, showModal, confirmModal, statusFlash } from "./ui";
import { createEditor } from "./editor";
import { createPreview, type ElementInfo } from "./preview";
import { elementPosAt } from "./source-map";

// ---------- 状态 ----------

type Source =
  | { kind: "new" }
  | { kind: "local"; path: string; name: string; baseHref: string }
  | { kind: "online"; url: string; finalUrl: string };

interface FileDoc {
  path: string;
  name: string;
  content: string;
}

interface PageDoc {
  url: string;
  finalUrl: string;
  status: number;
  content: string;
}

const NEW_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>新文档</title>
  </head>
  <body>
    <h1>你好，R HTML</h1>
    <p>在左侧编辑 HTML，右侧实时预览；点击「选取元素」查看任意元素的详情。</p>
  </body>
</html>
`;

let source: Source = { kind: "new" };
let dirty = false;
let pickMode = false;
let allowClose = false;
let currentElement: ElementInfo | null = null;

const appWindow = getCurrentWindow();

// ---------- DOM ----------

let suppressDirty = false;
const editor = createEditor(requireEl("editor"), () => {
  if (suppressDirty) return;
  dirty = true;
  schedulePreview();
  renderStatus();
});
const preview = createPreview(requireEl<HTMLIFrameElement>("preview"));

const statusDoc = requireEl<HTMLSpanElement>("status-doc");
const statusStats = requireEl<HTMLSpanElement>("status-stats");
const statusMode = requireEl<HTMLSpanElement>("status-mode");
const saveBtn = requireEl<HTMLButtonElement>("tb-save");
const pickBtn = requireEl<HTMLButtonElement>("tb-pick");

const editable = () => source.kind !== "online";

// ---------- 预览 ----------

let previewTimer = 0;
let previewDoc = "";
let previewReady = false;
let pendingPos: number | null = null;

function schedulePreview(): void {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(refreshPreview, 400);
}

function baseHref(): string {
  if (source.kind === "local") return source.baseHref;
  if (source.kind === "online") return source.finalUrl;
  return "about:blank";
}

function refreshPreview(force = false): void {
  window.clearTimeout(previewTimer);
  const doc = editor.getDoc();
  if (!force && previewReady && doc === previewDoc) return;
  preview.clearSelection();
  currentElement = null;
  renderElementPanel();
  previewReady = false;
  previewDoc = doc;
  preview.load(previewDoc, baseHref(), force ? Date.now() : undefined);
}

/** 工具栏、菜单和 Ctrl+R：先切到预览页，再强制重新加载。 */
function reloadPreview(): void {
  switchTab("preview");
  refreshPreview(true);
}

function revealInPreview(pos: number): void {
  switchTab("preview");
  if (previewReady && previewDoc === editor.getDoc() && preview.reveal(pos)) return;
  pendingPos = pos;
  if (previewDoc !== editor.getDoc()) refreshPreview();
}

// ---------- 元素面板 ----------

const pagePreview = requireEl("page-preview");
const pageElement = requireEl("page-element");
const elementEmpty = requireEl("element-empty");
const elementInfo = requireEl("element-info");

function switchTab(name: "preview" | "element"): void {
  document.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  pagePreview.classList.toggle("hidden", name !== "preview");
  pageElement.classList.toggle("hidden", name !== "element");
}

document.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab((tab.dataset.tab as "preview" | "element") ?? "preview");
  });
});

function copyText(text: string, label: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => statusFlash(`${label}已复制`))
    .catch(() => statusFlash("复制失败", true));
}

function kvRow(key: string, value: string, mono = true): HTMLTableRowElement {
  const tr = el("tr");
  tr.appendChild(el("td", "", key));
  const td = el("td", mono ? "el-mono" : "", value);
  tr.appendChild(td);
  return tr;
}

function renderElementPanel(): void {
  elementInfo.innerHTML = "";
  if (!currentElement) {
    elementEmpty.classList.remove("hidden");
    elementInfo.classList.add("hidden");
    return;
  }
  elementEmpty.classList.add("hidden");
  elementInfo.classList.remove("hidden");
  const info = currentElement;

  // 标题：标签名 + 尺寸
  const head = el("div", "el-section");
  const tagline = el("div", "el-tagline");
  tagline.appendChild(el("span", "el-tag", `<${info.tag}>`));
  tagline.appendChild(el("span", "el-size", `${info.width} × ${info.height}`));
  head.appendChild(tagline);
  elementInfo.appendChild(head);

  // 概览
  const overview = el("div", "el-section");
  overview.appendChild(el("h3", "", "概览"));
  const kv = el("table", "el-kv");
  kv.appendChild(kvRow("选择器", info.selector));
  kv.appendChild(kvRow("XPath", info.xpath));
  kv.appendChild(kvRow("ID", info.id || "—"));
  kv.appendChild(kvRow("类", info.classes.length ? info.classes.join(" ") : "—"));
  if (info.text) kv.appendChild(kvRow("文本", info.text, false));
  overview.appendChild(kv);
  elementInfo.appendChild(overview);

  // 属性
  const attrSection = el("div", "el-section");
  attrSection.appendChild(el("h3", "", `属性（${info.attrs.length}）`));
  if (info.attrs.length) {
    const table = el("table", "el-kv");
    for (const a of info.attrs) table.appendChild(kvRow(a.name, a.value));
    attrSection.appendChild(table);
  } else {
    attrSection.appendChild(el("div", "el-none", "没有属性"));
  }
  elementInfo.appendChild(attrSection);

  // 操作
  const actions = el("div", "el-section");
  actions.appendChild(el("h3", "", "操作"));
  const row = el("div", "el-actions");
  const btnSelector = el("button", "btn", "复制选择器");
  btnSelector.addEventListener("click", () => copyText(info.selector, "选择器"));
  const btnXpath = el("button", "btn", "复制 XPath");
  btnXpath.addEventListener("click", () => copyText(info.xpath, "XPath"));
  const btnHtml = el("button", "btn", "复制 HTML");
  btnHtml.addEventListener("click", () => copyText(info.html, "HTML"));
  row.append(btnSelector, btnXpath, btnHtml);
  if (editable()) {
    const btnLocate = el("button", "btn", "定位源码");
    btnLocate.addEventListener("click", () => locateInSource(info));
    row.appendChild(btnLocate);
  }
  actions.appendChild(row);
  elementInfo.appendChild(actions);
}

function locateInSource(info: ElementInfo): void {
  // 先按完整开标签找，找不到退化为按标签名找
  const candidates = [info.openTag];
  if (info.id) candidates.push(`id="${info.id}"`);
  candidates.push(`<${info.tag}`);
  for (const c of candidates) {
    if (c && editor.findAndSelect(c)) {
      statusFlash("已在源码中定位");
      return;
    }
  }
  statusFlash("未在源码中找到对应片段", true);
}

preview.onSelect = (info, from) => {
  currentElement = info;
  renderElementPanel();
  if (from !== "source") switchTab("element");
};

preview.onLoad = () => {
  previewReady = true;
  if (pendingPos === null) return;
  const pos = pendingPos;
  pendingPos = null;
  preview.reveal(pos);
};

preview.takePending = () => pendingPos !== null;

editor.onClick = (offset) => {
  const pos = elementPosAt(editor.getDoc(), offset);
  if (pos === null) return;
  revealInPreview(pos);
};

preview.onOpenUrl = (url) => {
  openUrl(url).catch(() => statusFlash("无法打开链接", true));
};

// ---------- 选取模式 ----------

function setPickMode(on: boolean): void {
  pickMode = on;
  pickBtn.classList.toggle("active", on);
  preview.setPickMode(on);
  if (on) {
    switchTab("preview");
    statusFlash("在预览中点击元素即可选取，Esc 退出");
  }
}

pickBtn.addEventListener("click", () => setPickMode(!pickMode));

// ---------- 文档操作 ----------

function updateAfterLoad(): void {
  dirty = false;
  editor.setReadOnly(!editable());
  saveBtn.disabled = !editable();
  renderStatus();
  refreshPreview();
}

function requestClose(): void {
  if (allowClose || !dirty) {
    void appWindow.destroy();
    return;
  }
  confirmModal("未保存的更改", "当前文档未保存，确定要退出吗？", () => {
    allowClose = true;
    void appWindow.destroy();
  });
}

function newDocument(force = false): void {
  if (!force && dirty) {
    confirmModal("未保存的更改", "当前文档未保存，新建将丢弃这些更改。", () =>
      newDocument(true),
    );
    return;
  }
  source = { kind: "new" };
  suppressDirty = true;
  editor.setDoc(NEW_TEMPLATE);
  suppressDirty = false;
  updateAfterLoad();
}

function dirOf(path: string): string {
  const norm = path.replace(/\//g, "\\");
  const at = norm.lastIndexOf("\\");
  return at >= 0 ? norm.slice(0, at + 1) : norm;
}

async function openLocalFile(path: string): Promise<void> {
  try {
    const doc = await invoke<FileDoc>("read_html_file", { path });
    source = {
      kind: "local",
      path: doc.path,
      name: doc.name,
      baseHref: convertFileSrc(dirOf(doc.path)),
    };
    suppressDirty = true;
    editor.setDoc(doc.content);
    suppressDirty = false;
    updateAfterLoad();
    statusFlash(`已打开 ${doc.name}`);
  } catch (e) {
    statusFlash(String(e), true);
  }
}

async function openFileFlow(force = false): Promise<void> {
  if (!force && dirty) {
    confirmModal("未保存的更改", "当前文档未保存，打开文件将丢弃这些更改。", () =>
      openFileFlow(true),
    );
    return;
  }
  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
  });
  if (typeof picked === "string") await openLocalFile(picked);
}

function openUrlFlow(force = false): void {
  if (!force && dirty) {
    confirmModal("未保存的更改", "当前文档未保存，打开网址将丢弃这些更改。", () =>
      openUrlFlow(true),
    );
    return;
  }
  showModal(
    "打开网址",
    (body, close) => {
      body.appendChild(el("p", "", "输入网页地址。在线网页只能查看和选取元素，不能编辑。"));
      const input = el("input") as HTMLInputElement;
      input.placeholder = "https://example.com";
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          close();
          void loadUrl(input.value.trim());
        }
      });
      body.appendChild(input);
    },
    [
      { label: "取消", action: () => {} },
      {
        label: "打开",
        primary: true,
        action: () => {
          const input = document.querySelector<HTMLInputElement>(".modal-body input");
          if (input?.value.trim()) void loadUrl(input.value.trim());
        },
      },
    ],
  );
}

async function loadUrl(url: string): Promise<void> {
  statusFlash("正在加载网页…");
  try {
    const page = await invoke<PageDoc>("fetch_page", { url });
    source = { kind: "online", url: page.url, finalUrl: page.finalUrl };
    suppressDirty = true;
    editor.setDoc(page.content);
    suppressDirty = false;
    updateAfterLoad();
    statusFlash(`已加载 ${page.finalUrl}`);
  } catch (e) {
    statusFlash(String(e), true);
  }
}

async function saveFlow(saveAs = false): Promise<void> {
  if (!editable()) return;
  let path = source.kind === "local" ? source.path : null;
  if (saveAs || !path) {
    const picked = await saveDialog({
      defaultPath: source.kind === "local" ? source.name : "index.html",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!picked) return;
    path = picked;
  }
  try {
    await invoke("save_html_file", { path, content: editor.getDoc() });
    source = {
      kind: "local",
      path,
      name: path.replace(/\\/g, "/").split("/").pop() ?? path,
      baseHref: convertFileSrc(dirOf(path)),
    };
    dirty = false;
    renderStatus();
    statusFlash("已保存");
  } catch (e) {
    statusFlash(String(e), true);
  }
}

async function copyPageSource(): Promise<void> {
  copyText(editor.getDoc(), "页面源码");
}

// ---------- 状态栏 ----------

function renderStatus(): void {
  const doc = editor.getDoc();
  const lines = editor.view.state.doc.lines;
  const size = new Blob([doc]).size;
  const kb = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;

  let name = "未保存的文档";
  if (source.kind === "local") name = source.name;
  if (source.kind === "online") name = source.finalUrl;
  statusDoc.textContent = dirty && editable() ? `${name} ●` : name;
  statusDoc.title = source.kind === "local" ? source.path : name;
  statusStats.textContent = `${lines} 行 · ${kb}`;
  statusMode.textContent = editable() ? "编辑" : "只读（在线）";
  saveBtn.disabled = !editable();
}

// ---------- 菜单 ----------

requireEl<HTMLImageElement>("logo").src = logoUrl;

setupMenus(requireEl("menus"), [
  {
    label: "文件",
    entries: [
      { label: "新建", kbd: "Ctrl+N", action: () => newDocument() },
      { label: "打开文件…", kbd: "Ctrl+O", action: () => void openFileFlow() },
      { label: "打开网址…", kbd: "Ctrl+L", action: () => openUrlFlow() },
      { sep: true },
      {
        label: "保存",
        kbd: "Ctrl+S",
        disabled: () => !editable(),
        action: () => void saveFlow(),
      },
      {
        label: "另存为…",
        kbd: "Ctrl+Shift+S",
        disabled: () => !editable(),
        action: () => void saveFlow(true),
      },
      { sep: true },
      { label: "退出", action: requestClose },
    ],
  },
  {
    label: "工具",
    entries: [
      { label: "选取元素", kbd: "Ctrl+Shift+C", action: () => setPickMode(!pickMode) },
      { label: "重新加载预览", kbd: "Ctrl+R", action: reloadPreview },
      { sep: true },
      { label: "复制页面源码", action: () => void copyPageSource() },
    ],
  },
  {
    label: "帮助",
    entries: [
      { label: "检查更新…", action: () => void checkUpdates(false) },
      { label: "关于 R HTML", action: showAbout },
    ],
  },
]);

// ---------- 更新与关于 ----------

async function checkUpdates(silent: boolean): Promise<void> {
  const dialog = silent
    ? null
    : showModal(
        "检查更新",
        (body) => body.appendChild(el("p", "", "正在检查更新…")),
        [{ label: "关闭", action: () => {} }],
      );
  const setMessage = (message: string) => {
    if (!dialog) {
      statusFlash(message);
      return;
    }
    dialog.body.replaceChildren(el("p", "", message));
  };

  try {
    const update = await check();
    if (!update) {
      setMessage("已是最新版本。");
      return;
    }
    if (!dialog) {
      confirmModal("发现新版本", `版本 ${update.version} 可用，是否下载并安装？`, () =>
        void installUpdate(update),
      );
      return;
    }
    setMessage(`版本 ${update.version} 可用，是否下载并安装？`);
    dialog.setActions([
      { label: "稍后", action: () => {} },
      { label: "下载并安装", primary: true, action: () => void installUpdate(update) },
    ]);
  } catch (e) {
    const message = `检查更新失败：${e}`;
    if (dialog) setMessage(message);
    else if (!silent) statusFlash(message, true);
  }
}

async function installUpdate(update: { version: string; downloadAndInstall: () => Promise<void> }): Promise<void> {
  const dialog = showModal(
    "检查更新",
    (body) => body.appendChild(el("p", "", `正在下载并安装 ${update.version}…`)),
    [],
  );
  try {
    await update.downloadAndInstall();
    dialog.body.replaceChildren(el("p", "", "安装完成，即将重新启动。"));
    await relaunch();
  } catch (e) {
    dialog.body.replaceChildren(el("p", "", `更新失败：${e}`));
    dialog.setActions([{ label: "关闭", primary: true, action: () => {} }]);
  }
}

function showAbout(): void {
  showModal(
    "关于 R HTML",
    async (body) => {
      const logo = el("img", "about-logo") as HTMLImageElement;
      logo.src = logoUrl;
      body.appendChild(logo);
      body.appendChild(el("div", "about-name", "R HTML"));
      body.appendChild(
        el("p", "about-desc", "查看本地与在线网页，快捷选取元素，直接编辑 HTML。"),
      );
    },
    [{ label: "关闭", primary: true, action: () => {} }],
  );
}

// ---------- 窗口 ----------

requireEl("win-min").addEventListener("click", () => void appWindow.minimize());
requireEl("win-max").addEventListener("click", () => void appWindow.toggleMaximize());
requireEl("win-close").addEventListener("click", (e) => {
  e.stopPropagation();
  requestClose();
});

// 系统关闭（Alt+F4 等）不走按钮。确认框必须在这里同步弹出：
// Tauri 会等待这个 Promise，等它 resolve 后才执行 preventDefault，
// 而弹框放在 await 之后就会来不及挂上 DOM。
appWindow.onCloseRequested((e) => {
  if (allowClose || !dirty) return;
  e.preventDefault();
  confirmModal("未保存的更改", "当前文档未保存，确定要退出吗？", () => {
    allowClose = true;
    void appWindow.destroy();
  });
});

// ---------- 主题 ----------

const themeBtn = requireEl<HTMLButtonElement>("status-theme");
const themeLabel = requireEl<HTMLSpanElement>("theme-label");

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  themeLabel.textContent = theme === "light" ? "浅色" : "深色";
  localStorage.setItem("r-html-theme", theme);
}

themeBtn.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

const savedTheme = localStorage.getItem("r-html-theme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

// ---------- 全屏 ----------

requireEl("status-fs").addEventListener("click", async () => {
  await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
});

// ---------- 分隔条 ----------

const divider = requireEl("divider");
const editorPane = requireEl("editor-pane");

divider.addEventListener("mousedown", (e) => {
  e.preventDefault();
  divider.classList.add("dragging");
  const move = (ev: MouseEvent) => {
    const min = 360;
    const max = window.innerWidth - 280 - 6;
    const width = Math.max(min, Math.min(max, ev.clientX));
    editorPane.style.flexBasis = `${width}px`;
  };
  const up = () => {
    divider.classList.remove("dragging");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

// ---------- 快捷键 ----------

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) {
    if (e.key === "Escape" && pickMode) setPickMode(false);
    return;
  }
  const key = e.key.toLowerCase();
  const combo = `${e.shiftKey ? "shift+" : ""}${key}`;
  const handled: Record<string, () => void> = {
    n: () => newDocument(),
    o: () => void openFileFlow(),
    l: () => openUrlFlow(),
    s: () => void saveFlow(),
    "shift+s": () => void saveFlow(true),
    "shift+c": () => setPickMode(!pickMode),
    r: reloadPreview,
  };
  const fn = handled[combo];
  if (fn) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }
});

// ---------- 拖放 ----------

const dndMask = requireEl("dnd-mask");

void getCurrentWebview().onDragDropEvent((event) => {
  const type = event.payload.type;
  if (type === "over") {
    dndMask.classList.remove("hidden");
  } else if (type === "leave") {
    dndMask.classList.add("hidden");
  } else if (type === "drop") {
    dndMask.classList.add("hidden");
    const path = event.payload.paths.find((p) => /\.html?$/i.test(p));
    if (path) {
      if (dirty) {
        confirmModal("未保存的更改", "当前文档未保存，打开文件将丢弃这些更改。", () =>
          void openLocalFile(path),
        );
      } else {
        void openLocalFile(path);
      }
    } else {
      statusFlash("只支持 .html / .htm 文件", true);
    }
  }
});

// ---------- 启动 ----------

requireEl("tb-open").addEventListener("click", () => void openFileFlow());
requireEl("tb-url").addEventListener("click", () => openUrlFlow());
requireEl("tb-save").addEventListener("click", () => void saveFlow());
requireEl("tb-reload").addEventListener("click", reloadPreview);

editor.setDoc(NEW_TEMPLATE);
updateAfterLoad();

// 启动几秒后静默检查一次更新
window.setTimeout(() => void checkUpdates(true), 4000);
