// 源码偏移与预览 DOM 的对应关系。
// 给每个开始标签打上 data-rhtml-pos（值为它在原文中的起始偏移），
// 点击编辑器时再按同样的扫描规则找到包含光标的最内层元素。

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// 内容按原文保留、内部的 < 不算标签。
const RAW_TAGS = new Set(["script", "style", "textarea", "title"]);

// HTML 里这些元素遇到下一个同类（或块级）开始标签就会被隐式关闭。
const P_CLOSES = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "search",
  "section",
  "table",
  "ul",
]);

const CLOSED_BY: Record<string, Set<string>> = {
  p: P_CLOSES,
  li: new Set(["li"]),
  dt: new Set(["dt", "dd"]),
  dd: new Set(["dt", "dd"]),
  option: new Set(["option", "optgroup"]),
  optgroup: new Set(["optgroup"]),
  tr: new Set(["tr"]),
  td: new Set(["td", "th", "tr"]),
  th: new Set(["td", "th", "tr"]),
  thead: new Set(["tbody", "tfoot"]),
  tbody: new Set(["tbody", "tfoot"]),
  tfoot: new Set(["tbody"]),
  rt: new Set(["rt", "rp"]),
  rp: new Set(["rt", "rp"]),
};

const FOREIGN = new Set(["svg", "math"]);

interface SrcTag {
  kind: "start" | "end";
  name: string;
  start: number;
  end: number;
  selfClosing: boolean;
}

function skipQuoted(html: string, from: number, to: number): number {
  let i = from;
  let quote = "";
  while (i < to) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
    i++;
  }
  return -1;
}

/** 按文档顺序扫描开始/结束标签。注释、声明和原始文本元素内部会被跳过。 */
export function scanHtmlTags(html: string): SrcTag[] {
  const tags: SrcTag[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const next = html[lt + 1];
    if (next === undefined) break;

    if (next === "!" || next === "?") {
      const end = html.startsWith("<!--", lt)
        ? html.indexOf("-->", lt + 4)
        : html.indexOf(">", lt + 2);
      i = end < 0 ? html.length : end + (html.startsWith("<!--", lt) ? 3 : 1);
      continue;
    }

    if (next === "/") {
      const m = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(html.slice(lt));
      if (!m) {
        i = lt + 1;
        continue;
      }
      tags.push({
        kind: "end",
        name: m[1].toLowerCase(),
        start: lt,
        end: lt + m[0].length,
        selfClosing: false,
      });
      i = lt + m[0].length;
      continue;
    }

    if (!/[A-Za-z]/.test(next)) {
      i = lt + 1;
      continue;
    }
    const nameMatch = /^<([A-Za-z][\w:-]*)/.exec(html.slice(lt));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const gt = skipQuoted(html, lt + nameMatch[0].length, html.length);
    if (gt < 0) break;
    const raw = html.slice(lt, gt + 1);
    const name = nameMatch[1].toLowerCase();
    const selfClosing = /\/\s*>$/.test(raw);
    tags.push({ kind: "start", name, start: lt, end: gt + 1, selfClosing });
    i = gt + 1;

    if (RAW_TAGS.has(name) && !selfClosing) {
      const close = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(i);
      const found = close.exec(rest);
      if (!found) break;
      const at = i + found.index;
      tags.push({
        kind: "end",
        name,
        start: at,
        end: at + found[0].length,
        selfClosing: false,
      });
      i = at + found[0].length;
    }
  }
  return tags;
}

/**
 * 返回包含 offset 的最内层元素的开始标签在原文中的偏移。
 * 标签之间的空白归到外层元素；点在任何元素之外则返回 null。
 */
export function elementPosAt(html: string, offset: number): number | null {
  const tags = scanHtmlTags(html);
  const open: { name: string; pos: number }[] = [];
  let foreign = 0;
  let best = -1;
  let bestDepth = -1;

  const consider = (start: number, end: number, depth: number) => {
    if (offset >= start && offset < end && depth >= bestDepth) {
      best = start;
      bestDepth = depth;
    }
  };

  for (const tag of tags) {
    if (tag.kind === "start") {
      // HTML 会忽略非外来元素上的 />；p、li 等还会被下一个开始标签提前关掉。
      if (foreign === 0) {
        while (open.length) {
          const top = open[open.length - 1];
          if (!CLOSED_BY[top.name]?.has(tag.name)) break;
          consider(top.pos, tag.start, open.length);
          open.pop();
        }
      }
      const empty =
        (tag.selfClosing && (foreign > 0 || FOREIGN.has(tag.name))) ||
        (foreign === 0 && VOID_TAGS.has(tag.name));
      if (empty) {
        consider(tag.start, tag.end, open.length + 1);
        continue;
      }
      open.push({ name: tag.name, pos: tag.start });
      if (FOREIGN.has(tag.name)) foreign++;
      continue;
    }
    for (let j = open.length - 1; j >= 0; j--) {
      if (open[j].name !== tag.name) continue;
      // </p> 这类结束标签会把被它挡住、本应更早关闭的同类元素一起关掉。
      let closeFrom = j;
      if (foreign === 0 && CLOSED_BY[tag.name]?.has(tag.name)) {
        while (closeFrom > 0 && CLOSED_BY[open[closeFrom - 1].name]?.has(tag.name)) {
          closeFrom--;
        }
      }
      for (let k = open.length - 1; k >= closeFrom; k--) {
        consider(open[k].pos, tag.end, k + 1);
        if (FOREIGN.has(open[k].name)) foreign = Math.max(0, foreign - 1);
      }
      open.splice(closeFrom);
      break;
    }
  }
  for (let j = open.length - 1; j >= 0; j--) {
    consider(open[j].pos, html.length + 1, j + 1);
  }
  return best < 0 ? null : best;
}

/** 给每个开始标签写入 data-rhtml-pos，值为该标签在原文中的起始偏移。 */
export function annotateSourcePositions(html: string): string {
  const starts = scanHtmlTags(html).filter((tag) => tag.kind === "start");
  let out = html;
  for (let i = starts.length - 1; i >= 0; i--) {
    const tag = starts[i];
    const name = /^<[A-Za-z][\w:-]*/.exec(out.slice(tag.start));
    if (!name) continue;
    const at = tag.start + name[0].length;
    out = `${out.slice(0, at)} data-rhtml-pos="${tag.start}"${out.slice(at)}`;
  }
  return out;
}
