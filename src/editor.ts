// CodeMirror 6 编辑器封装：HTML 高亮、只读切换、改动回调。
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// 语法色跟随 CSS 变量，主题切换不用重建编辑器。
const highlight = HighlightStyle.define([
  { tag: tags.tagName, color: "var(--key)" },
  { tag: tags.attributeName, color: "var(--number)" },
  { tag: tags.attributeValue, color: "var(--string)" },
  { tag: tags.string, color: "var(--string)" },
  { tag: tags.comment, color: "var(--null)", fontStyle: "italic" },
  { tag: tags.angleBracket, color: "var(--muted)" },
  { tag: tags.propertyName, color: "var(--key)" },
  { tag: tags.number, color: "var(--number)" },
  { tag: [tags.bool, tags.atom], color: "var(--true)" },
  { tag: tags.keyword, color: "var(--key)" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
]);

export interface Editor {
  view: EditorView;
  getDoc: () => string;
  setDoc: (text: string) => void;
  setReadOnly: (readonly: boolean) => void;
  findAndSelect: (snippet: string) => boolean;
}

export function createEditor(host: HTMLElement, onChange: () => void): Editor {
  const readOnly = new Compartment();
  const editable = new Compartment();

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        html(),
        indentUnit.of("  "),
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange();
        }),
        readOnly.of(EditorState.readOnly.of(false)),
        editable.of(EditorView.editable.of(true)),
      ],
    }),
  });

  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc: (text) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      view.dispatch({ selection: { anchor: 0 } });
    },
    setReadOnly: (flag) => {
      view.dispatch({
        effects: [
          readOnly.reconfigure(EditorState.readOnly.of(flag)),
          editable.reconfigure(EditorView.editable.of(!flag)),
        ],
      });
    },
    findAndSelect: (snippet) => {
      const doc = view.state.doc.toString();
      const at = doc.indexOf(snippet);
      if (at < 0) return false;
      view.dispatch({
        selection: { anchor: at, head: at + snippet.length },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
  };
}
