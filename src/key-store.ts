import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

export interface ApiKey {
  id: string;
  label: string;
  key: string;
  created: string;
}

const KEY_FILE = process.env.KEY_FILE ?? "./data/api-keys.json";

let keys: ApiKey[] = [];

function load() {
  if (existsSync(KEY_FILE)) {
    keys = JSON.parse(readFileSync(KEY_FILE, "utf-8"));
  }
}

function save() {
  writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
}

load();

export function listKeys(): Array<Omit<ApiKey, "key"> & { key_prefix: string }> {
  return keys.map(({ id, label, created, key }) => ({
    id,
    label,
    created,
    key_prefix: key.slice(0, 8) + "…",
  }));
}

export function createKey(label: string): ApiKey {
  const entry: ApiKey = {
    id: randomBytes(4).toString("hex"),
    label,
    key: "djk_" + randomBytes(24).toString("hex"),
    created: new Date().toISOString(),
  };
  keys.push(entry);
  save();
  return entry;
}

export function revokeKey(id: string): boolean {
  const before = keys.length;
  keys = keys.filter((k) => k.id !== id);
  if (keys.length === before) return false;
  save();
  return true;
}

export function validateKey(token: string): boolean {
  return keys.some((k) => k.key === token);
}
