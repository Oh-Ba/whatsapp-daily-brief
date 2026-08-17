/**
 * store.js — tiny JSON-file persistence layer.
 *
 * With a hard cap of 10 users there is no need for a database:
 * a single users.json file, read/written atomically, is enough.
 * Swap this module for SQLite/Postgres later without touching the rest.
 *
 * User shape:
 * {
 *   id:         "u_ab12cd34",
 *   name:       "Inigo",
 *   country:    "Greece",
 *   email:      "inigo@example.com",   // lowercase
 *   createdAt:  ISO string,
 *   lastSentAt: ISO string | null,
 *   lastStatus: "ok" | "error: ..." | "pending" | null
 * }
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function save(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic on the same volume
}

/** Normalize an email: trim + lowercase. Returns null if it isn't one. */
export function normalizeEmail(raw) {
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean) return null;
  // Deliberately light: one @, something either side, a dot in the domain.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(clean)) return null;
  if (clean.length > 254) return null;
  return clean;
}

export const store = {
  all() {
    return load();
  },

  count() {
    return load().length;
  },

  findById(id) {
    return load().find((u) => u.id === id) || null;
  },

  findByEmail(email) {
    const e = normalizeEmail(email);
    return load().find((u) => u.email === e) || null;
  },

  /**
   * Register a new user, or update the country/name if the address is
   * already registered (one registration per address).
   */
  upsert({ name, country, email }) {
    const address = normalizeEmail(email);
    if (!address) throw new Error("Invalid email address, e.g. you@gmail.com");
    if (!name?.trim()) throw new Error("Name is required");
    if (!country?.trim()) throw new Error("Country is required");

    const users = load();
    const existing = users.find((u) => u.email === address);

    if (existing) {
      existing.name = name.trim();
      existing.country = country.trim();
      save(users);
      return { user: existing, created: false };
    }

    if (users.length >= config.maxUsers) {
      throw new Error(`User limit reached (${config.maxUsers}). Remove a user first.`);
    }

    const user = {
      id: "u_" + crypto.randomBytes(4).toString("hex"),
      name: name.trim(),
      country: country.trim(),
      email: address,
      createdAt: new Date().toISOString(),
      lastSentAt: null,
      lastStatus: null,
    };
    users.push(user);
    save(users);
    return { user, created: true };
  },

  setCountry(id, country) {
    const users = load();
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error("User not found");
    if (!country?.trim()) throw new Error("Country is required");
    user.country = country.trim();
    save(users);
    return user;
  },

  setCountryByEmail(email, country) {
    const user = this.findByEmail(email);
    if (!user) throw new Error("This address is not registered");
    return this.setCountry(user.id, country);
  },

  markSent(id, status) {
    const users = load();
    const user = users.find((u) => u.id === id);
    if (!user) return;
    user.lastSentAt = new Date().toISOString();
    user.lastStatus = status;
    save(users);
  },

  remove(id) {
    const users = load();
    const next = users.filter((u) => u.id !== id);
    if (next.length === users.length) throw new Error("User not found");
    save(next);
  },
};
