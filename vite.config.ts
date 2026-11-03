import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// 状态栏版本号以 package.json 为准，避免 index.html 里手写的值过期。
const injectAppVersion = (): Plugin => ({
  name: "inject-app-version",
  transformIndexHtml: (html) => html.replaceAll("%APP_VERSION%", version),
});

export default defineConfig({
  plugins: [injectAppVersion()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
