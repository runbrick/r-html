// npm version 的 version 钩子：只同步 Cargo。
// npm run version：升版本、提交、打 tag，并推送以触发 GitHub Actions。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.npm_command === "version") {
  await import("./sync-version.mjs");
} else {
  const bump = process.argv[2] ?? "patch";
  const extra = process.argv.slice(3);
  const validBump =
    /^(major|minor|patch|premajor|preminor|prepatch|prerelease|\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
  if (extra.length > 0 || !validBump.test(bump)) {
    console.error("用法: npm run version [patch|minor|major|x.y.z]");
    process.exit(1);
  }

  execFileSync("npm", ["version", bump], {
    cwd: rootDirectory,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const version = JSON.parse(readFileSync(resolve(rootDirectory, "package.json"), "utf8")).version;
  const tag = `v${version}`;
  let branch = "HEAD";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
    }).trim();
  } catch {
    branch = "HEAD";
  }
  const ref = !branch || branch === "HEAD" ? "HEAD" : branch;

  execFileSync("git", ["push", "origin", ref], { cwd: rootDirectory, stdio: "inherit" });
  execFileSync("git", ["push", "origin", tag], { cwd: rootDirectory, stdio: "inherit" });
  console.log(`已推送 ${tag}，GitHub Actions 开始打包发版`);
}
