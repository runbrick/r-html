// npm version 之后执行：把 package.json 的版本同步进 Cargo.toml 和 Cargo.lock。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
const nextCargo = cargo.replace(
  /(\[package\][^\0]*?^version = )"[^"]*"/m,
  `$1"${version}"`,
);
if (cargo !== nextCargo) writeFileSync(cargoPath, nextCargo);

const lockPath = "src-tauri/Cargo.lock";
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, "utf8");
  const nextLock = lock.replace(
    /(\[\[package\]\]\nname = "r-html"\nversion = )"[^"]*"/,
    `$1"${version}"`,
  );
  if (lock !== nextLock) writeFileSync(lockPath, nextLock);
}

console.log(`synced version ${version}`);
