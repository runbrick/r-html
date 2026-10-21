// 通用 UI 助手：元素创建、菜单、模态框、状态栏短消息。

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function requireEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少元素 #${id}`);
  return node as T;
}

export interface MenuEntry {
  label?: string;
  kbd?: string;
  sep?: boolean;
  disabled?: boolean | (() => boolean);
  action?: () => void;
}

export interface MenuDef {
  label: string;
  entries: MenuEntry[];
}

export function setupMenus(host: HTMLElement, defs: MenuDef[]): void {
  let openPanel: HTMLElement | null = null;

  const close = () => {
    openPanel?.remove();
    openPanel = null;
    host.querySelectorAll(".menu-trigger").forEach((t) => t.classList.remove("active"));
  };

  const open = (trigger: HTMLButtonElement, def: MenuDef) => {
    close();
    const panel = el("div", "menu-panel");
    for (const entry of def.entries) {
      if (entry.sep) {
        panel.appendChild(el("div", "menu-sep"));
        continue;
      }
      const item = el("div", "menu-item");
      const disabled =
        typeof entry.disabled === "function" ? entry.disabled() : entry.disabled;
      if (disabled) item.classList.add("disabled");
      item.appendChild(el("span", "", entry.label ?? ""));
      if (entry.kbd) item.appendChild(el("kbd", "", entry.kbd));
      item.addEventListener("click", () => {
        close();
        entry.action?.();
      });
      panel.appendChild(item);
    }
    document.body.appendChild(panel);
    const rect = trigger.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom}px`;
    openPanel = panel;
    trigger.classList.add("active");
  };

  for (const def of defs) {
    const trigger = el("button", "menu-trigger", def.label);
    trigger.addEventListener("click", () => {
      if (openPanel) close();
      else open(trigger, def);
    });
    trigger.addEventListener("mouseenter", () => {
      if (openPanel) open(trigger, def);
    });
    host.appendChild(trigger);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  window.addEventListener("mousedown", (e) => {
    if (openPanel && !(e.target as HTMLElement).closest(".menu-panel, .menu-trigger")) close();
  });
}

export interface ModalAction {
  label: string;
  primary?: boolean;
  action: () => void;
}

export function showModal(
  title: string,
  build: (body: HTMLElement, close: () => void) => void,
  actions: ModalAction[],
): void {
  const mask = el("div", "modal-mask");
  const modal = el("div", "modal");
  modal.appendChild(el("div", "modal-title", title));
  const body = el("div", "modal-body");
  modal.appendChild(body);
  const foot = el("div", "modal-foot");

  const close = () => mask.remove();
  build(body, close);

  for (const a of actions) {
    const btn = el("button", a.primary ? "primary" : "btn", a.label);
    btn.addEventListener("click", () => {
      close();
      a.action();
    });
    foot.appendChild(btn);
  }
  modal.appendChild(foot);
  mask.appendChild(modal);
  document.body.appendChild(mask);

  mask.addEventListener("mousedown", (e) => {
    if (e.target === mask) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.contains(mask)) close();
  });
  (modal.querySelector("input") as HTMLInputElement | null)?.focus();
}

export function confirmModal(title: string, message: string, onOk: () => void): void {
  showModal(
    title,
    (body) => body.appendChild(el("p", "", message)),
    [
      { label: "取消", action: () => {} },
      { label: "确定", primary: true, action: onOk },
    ],
  );
}

let flashTimer = 0;
export function statusFlash(message: string, isError = false): void {
  const node = requireEl<HTMLSpanElement>("status-flash");
  node.textContent = message;
  node.classList.toggle("error", isError);
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    node.textContent = "";
    node.classList.remove("error");
  }, 3200);
}
