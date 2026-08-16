/**
 * routes.js — HTTP API + Twilio inbound webhook.
 *
 * Web API (used by the registration page):
 *   GET    /api/users            list users (id, name, country, phone masked, status)
 *   POST   /api/register         { name, country, whatsapp }
 *   POST   /api/users/:id/country { country }
 *   POST   /api/users/:id/send    trigger the brief now
 *   DELETE /api/users/:id         unregister
 *
 * WhatsApp inbound webhook (configure in the Twilio console):
 *   POST   /webhook/whatsapp
 *     STATUS / GET        → send the brief now
 *     COUNTRY <name>      → switch country
 *     HELP                → list commands
 */

import express from "express";
import twilio from "twilio";
import { store, normalizePhone } from "./store.js";
import { sendBriefToUser } from "./whatsapp.js";
import { config } from "./config.js";

export const router = express.Router();

function maskPhone(p) {
  return p.slice(0, 4) + "•••" + p.slice(-3);
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    country: u.country,
    whatsapp: maskPhone(u.whatsapp),
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
    const { name, country, whatsapp } = req.body || {};
    const { user, created } = store.upsert({ name, country, whatsapp });
    res.status(created ? 201 : 200).json({
      user: publicUser(user),
      created,
      message: created
        ? `Registered! ${user.name} will receive a daily ${user.country} brief at 0${config.dailyHour}:00.`
        : `Updated! This number now receives the ${user.country} brief.`,
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
  res.json({ message: `Brief for ${user.country} is being generated and sent to ${user.name}'s WhatsApp (takes ~1 minute).` });
});

router.delete("/api/users/:id", (req, res) => {
  try {
    store.remove(req.params.id);
    res.json({ message: "User removed." });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/* ─────────────────── Twilio inbound webhook ─────────────────── */

router.post("/webhook/whatsapp", (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  const from = normalizePhone((req.body?.From || "").replace("whatsapp:", ""));
  const text = (req.body?.Body || "").trim();
  const command = text.toUpperCase();

  const user = from ? store.findByPhone(from) : null;

  if (!user) {
    twiml.message(
      "Hi! This number isn't registered for the Daily Country Brief yet. Ask the admin to add you on the registration page."
    );
  } else if (command === "STATUS" || command === "GET" || command === "BRIEF") {
    twiml.message(`On it, ${user.name}! Your ${user.country} brief is being prepared — it arrives in about a minute. ⏳`);
    // Async: generate + deliver after we ACK the webhook
    sendBriefToUser(user).catch((err) => console.error("[webhook] send failed:", err));
  } else if (command.startsWith("COUNTRY ")) {
    const newCountry = text.slice(8).trim();
    try {
      store.setCountryByPhone(from, newCountry);
      twiml.message(`Done! 🌍 From now on you'll receive the daily brief about *${newCountry}*. Reply STATUS to get today's brief right away.`);
    } catch (err) {
      twiml.message(`Couldn't change country: ${err.message}`);
    }
  } else if (command === "HELP") {
    twiml.message(
      "*Daily Country Brief — commands*\n\n" +
        "STATUS — get your brief now\n" +
        "COUNTRY <name> — switch country (e.g. COUNTRY Italy)\n" +
        "HELP — this message"
    );
  } else {
    twiml.message(
      `Hi ${user.name}! I know these commands:\n\nSTATUS — get your ${user.country} brief now\nCOUNTRY <name> — switch country\nHELP — full list`
    );
  }

  res.type("text/xml").send(twiml.toString());
});
