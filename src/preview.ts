// 预览 iframe 与元素选取桥：向 srcdoc 注入 base 与选取脚本，
// 选中后把元素信息 postMessage 回主界面。
import { annotateSourcePositions } from "./source-map";

export interface ElementInfo {
  tag: string;
  id: string;
  classes: string[];
  attrs: { name: string; value: string }[];
  selector: string;
  xpath: string;
  width: number;
  height: number;
  text: string;
  openTag: string;
  html: string;
}

// 注入到 srcdoc 里的脚本。通过 window.__rhtmlBridge 幂等。
const BRIDGE = String.raw`
(function () {
  if (window.__rhtmlBridge) return;
  window.__rhtmlBridge = true;
  var pick = false, sel = null, hovBox = null, selBox = null;
  var COLOR = "#1677ff";

  function mkBox(dashed) {
    var d = document.createElement("div");
    d.setAttribute("data-rhtml-overlay", "");
    d.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;display:none;border-radius:2px;" +
      (dashed
        ? "border:1.5px dashed " + COLOR + ";background:transparent;"
        : "border:1.5px solid " + COLOR + ";background:rgba(22,119,255,.12);");
    document.documentElement.appendChild(d);
    return d;
  }
  function place(box, target) {
    var r = target.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  function ensure() {
    if (!hovBox) hovBox = mkBox(true);
    if (!selBox) selBox = mkBox(false);
  }
  function isOverlay(node) {
    return node && node.nodeType === 1 && node.hasAttribute("data-rhtml-overlay");
  }
  function selectorOf(node) {
    var parts = [], n = node;
    while (n && n.nodeType === 1 && parts.length < 12) {
      var p = n.tagName.toLowerCase();
      if (n.id) {
        parts.unshift(p + "#" + n.id);
        break;
      }
      var cls = typeof n.className === "string"
        ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) p += "." + cls.join(".");
      var parent = n.parentElement;
      if (parent) {
        var same = 0, idx = 0;
        for (var i = 0; i < parent.children.length; i++) {
          var c = parent.children[i];
          if (c.tagName === n.tagName) { same++; if (c === n) idx = same; }
        }
        if (same > 1) p += ":nth-of-type(" + idx + ")";
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }
  function xpathOf(node) {
    var parts = [], n = node;
    while (n && n.nodeType === 1) {
      var p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift('*[@id="' + n.id + '"]'); break; }
      var parent = n.parentElement;
      if (parent) {
        var same = 0, idx = 0;
        for (var i = 0; i < parent.children.length; i++) {
          var c = parent.children[i];
          if (c.tagName === n.tagName) { same++; if (c === n) idx = same; }
        }
        p += "[" + Math.max(idx, 1) + "]";
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return "/" + parts.join("/");
  }
  function describe(target) {
    var attrs = [];
    for (var i = 0; i < target.attributes.length; i++) {
      var a = target.attributes[i];
      if (a.name === "data-rhtml-pos") continue;
      attrs.push({ name: a.name, value: a.value });
    }
    var r = target.getBoundingClientRect();
    var html = (target.outerHTML || "").replace(/ data-rhtml-pos="\d+"/g, "");
    var gt = html.indexOf(">");
    var text = (target.textContent || "").replace(/\s+/g, " ").trim();
    return {
      tag: target.tagName.toLowerCase(),
      id: target.id || "",
      classes: typeof target.className === "string"
        ? target.className.trim().split(/\s+/).filter(Boolean) : [],
      attrs: attrs,
      selector: selectorOf(target),
      xpath: xpathOf(target),
      width: Math.round(r.width),
      height: Math.round(r.height),
      text: text.slice(0, 120),
      openTag: html.slice(0, gt > 0 ? gt + 1 : 200).slice(0, 300),
      html: html.slice(0, 4000)
    };
  }
  function refreshSel() {
    if (sel && selBox) {
      try { place(selBox, sel); } catch (e) { selBox.style.display = "none"; }
    }
  }
  document.addEventListener("mousemove", function (e) {
    if (!pick) return;
    ensure();
    var t = e.target;
    if (isOverlay(t)) return;
    place(hovBox, t);
  }, true);
  document.addEventListener("click", function (e) {
    if (!pick) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) {
        var href = a.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) {
          e.preventDefault();
          parent.postMessage({ __rhtml: "open-url", url: href }, "*");
        }
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var t = e.target;
    if (!t || isOverlay(t)) return;
    sel = t;
    ensure();
    place(selBox, t);
    if (hovBox) hovBox.style.display = "none";
    parent.postMessage({ __rhtml: "select", info: describe(t) }, "*");
  }, true);
  window.addEventListener("scroll", refreshSel, true);
  window.addEventListener("resize", refreshSel);
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.__rhtml === "pick") {
      pick = !!d.on;
      if (!pick && hovBox) hovBox.style.display = "none";
    }
    if (d.__rhtml === "clear") {
      sel = null;
      if (selBox) selBox.style.display = "none";
      if (hovBox) hovBox.style.display = "none";
    }
    if (d.__rhtml === "reveal") {
      var node = document.querySelector('[data-rhtml-pos="' + d.pos + '"]');
      if (!node) return;
      sel = node;
      ensure();
      if (hovBox) hovBox.style.display = "none";
      node.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      place(selBox, node);
      parent.postMessage({ __rhtml: "select", info: describe(node), from: "source" }, "*");
    }
  });
  document.addEventListener("mouseleave", function () {
    if (hovBox) hovBox.style.display = "none";
  });
})();
`;

function insertBase(html: string, baseHref: string): string {
  const base = `<base href="${baseHref}">`;
  // 已有 base 就替换 href，保证相对资源按来源解析
  if (/<base\s[^>]*>/i.test(html)) {
    return html.replace(/<base\s[^>]*>/i, base);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${base}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${base}</head>`);
  }
  return `${base}\n${html}`;
}

export function buildSrcdoc(html: string, baseHref: string, nonce?: number): string {
  const script = `<script>\n${BRIDGE}\n</script>`;
  // 相同 srcdoc 再赋值不会重载，强制刷新时加一个不影响源码偏移的注释。
  const marker = nonce === undefined ? "" : `\n<!-- rhtml-reload:${nonce} -->`;
  const withBase = insertBase(annotateSourcePositions(html), baseHref);
  if (/<\/body\s*>/i.test(withBase)) {
    return withBase.replace(/<\/body\s*>/i, `${script}${marker}\n</body>`);
  }
  return `${withBase}\n${script}${marker}`;
}

export interface Preview {
  load: (html: string, baseHref: string, nonce?: number) => void;
  setPickMode: (on: boolean) => void;
  clearSelection: () => void;
  /** 滚动并高亮 data-rhtml-pos 等于该偏移的元素。预览还没就绪时返回 false。 */
  reveal: (pos: number) => boolean;
  onSelect: (info: ElementInfo, from?: string) => void;
  onOpenUrl: (url: string) => void;
  onLoad: () => void;
  /** 这次加载完成后是否还要滚到某个元素。 */
  takePending: () => boolean;
}

export function createPreview(iframe: HTMLIFrameElement): Preview {
  let pick = false;
  let savedScroll = 0;
  let api: Preview;

  const post = (msg: object) => {
    iframe.contentWindow?.postMessage(msg, "*");
  };

  iframe.addEventListener("load", () => {
    // srcdoc 重载后桥脚本重新注入，需要恢复选取状态和滚动位置。
    // 接着就要滚到某个元素时，不再恢复旧位置。
    post({ __rhtml: "pick", on: pick });
    if (!api.takePending()) {
      try {
        iframe.contentWindow?.scrollTo(0, savedScroll);
      } catch {
        /* 忽略跨源场景 */
      }
    }
    api.onLoad();
  });

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__rhtml || e.source !== iframe.contentWindow) return;
    if (d.__rhtml === "select") api.onSelect(d.info as ElementInfo, d.from as string | undefined);
    if (d.__rhtml === "open-url") api.onOpenUrl(d.url as string);
  });

  api = {
    load: (html, baseHref, nonce) => {
      try {
        savedScroll = iframe.contentWindow?.scrollY ?? 0;
      } catch {
        savedScroll = 0;
      }
      iframe.srcdoc = buildSrcdoc(html, baseHref, nonce);
    },
    setPickMode: (on) => {
      pick = on;
      post({ __rhtml: "pick", on });
    },
    clearSelection: () => {
      post({ __rhtml: "clear" });
    },
    reveal: (pos) => {
      if (!iframe.contentWindow) return false;
      post({ __rhtml: "reveal", pos });
      return true;
    },
    onSelect: () => {},
    onOpenUrl: () => {},
    onLoad: () => {},
    takePending: () => false,
  };
  return api;
}
