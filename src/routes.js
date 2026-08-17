/**
 * routes.js — HTTP API used by the registration page.
 *
 *   GET    /api/users             list users (id, name, country, email masked, status)
 *   POST   /api/register          { name, country, email }
 *   POST   /api/users/:id/country { country }
 *   POST   /api/users/:id/send    trigger the brief now
 *   DELETE /api/users/:id         unregister
 *   GET    /api/health            SMTP reachability check
 *
 * Email is one-way, so there is no inbound webhook. Everything that used
 * to be a WhatsApp reply (STATUS, COUNTRY <name>) is a button on the page.
 */

import express from "express";
import { store } from "./store.js";
import { sendBriefToUser, verifyTransport } from "./mailer.js";
import { config } from "./config.js";

export const router = express.Router();

function maskEmail(address) {
  const [local, domain] = String(address || "").split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    country: u.country,
    email: maskEmail(u.email),
    lastSentAt: u.lastSentAt,
    lastStatus: u.lastStatus,
  };
}

/* ───────────────────────── Web API ───────────────────────── */

router.get("/api/users", (_req, res) => {
  res.json({
    users: store.all().map(publicUser),
    max: config.maxUsers,
  });
});

router.post("/api/register", (req, res) => {
  try {
    const { name, country, email } = req.body || {};
    const { user, created } = store.upsert({ name, country, email });
    res.status(created ? 201 : 200).json({
      user: publicUser(user),
      created,
      message: created
        ? `Registered! ${user.name} will receive a daily ${user.country} brief at 0${config.dailyHour}:00.`
        : `Updated! This address now receives the ${user.country} brief.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/api/users/:id/country", (req, res) => {
  try {
    const user = store.setCountry(req.params.id, req.body?.country);
    res.json({ user: publicUser(user), message: `Country changed to ${user.country}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/api/users/:id/send", (req, res) => {
  const user = store.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Fire and respond immediately — generation takes ~30-60s.
  sendBriefToUser(user).catch((err) => console.error("[api] send-now failed:", err));
  res.json({ message: `Brief for ${user.country} is being generated and emailed to ${user.name} (takes ~1 minute).` });
});

router.delete("/api/users/:id", (req, res) => {
  try {
    store.remove(req.params.id);
    res.json({ message: "User removed." });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/** Confirms the SMTP login works, without sending mail. */
router.get("/api/health", async (_req, res) => {
  try {
    await verifyTransport();
    res.json({ message: `SMTP OK — ${config.smtpHost}:${config.smtpPort}` });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});
