import fs from "fs";
import path from "path";

const STORE_PATH = path.resolve("data", "posted.json");

function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, "[]");
}

function readPostedIds() {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_PATH, "utf-8");
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writePostedIds(idsSet) {
  ensureStoreFile();
  // Mantém só os últimos 5000 IDs pra não crescer pra sempre
  const arr = Array.from(idsSet).slice(-5000);
  fs.writeFileSync(STORE_PATH, JSON.stringify(arr, null, 2));
}

export function filterUnposted(items, idField = "itemId") {
  const posted = readPostedIds();
  return items.filter((item) => !posted.has(String(item[idField])));
}

export function markAsPosted(items, idField = "itemId") {
  const posted = readPostedIds();
  for (const item of items) {
    posted.add(String(item[idField]));
  }
  writePostedIds(posted);
}

export function clearPosted() {
  ensureStoreFile();
  fs.writeFileSync(STORE_PATH, "[]");
}
