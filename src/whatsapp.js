/**
 * whatsapp.js — sends messages through the Twilio WhatsApp API.
 *
 * IMPORTANT — the WhatsApp 24-hour session window:
 * WhatsApp only allows a business to send FREEFORM messages within
 * 24 hours of the user's last inbound message. Outside that window,
 * only pre-approved TEMPLATE messages may initiate contact.
 *
 * Strategy used here:
 *   1. Try to send the brief freeform (works if the user messaged
 *      the bot in the last 24h — e.g. replied STATUS yesterday).
 *   2. If Twilio rejects with error 63016 (outside window) and a
 *      TWILIO_CONTENT_SID is configured, send the approved template
 *      ("your brief is ready — reply GET"). The user's reply opens
 *      a fresh 24h window and the webhook then delivers the brief.
 *   3. In the sandbox (no template configured) the failure is logged;
 *      the user can always pull the brief by sending STATUS.
 */

import twilio from "twilio";
import { config } from "./config.js";
import { generateBrief } from "./brief.js";
import { store } from "./store.js";

// Lazy init so the server can boot (and the page can be used)
// even before Twilio credentials are configured in .env.
let _client = null;
function client() {
  if (!_client) {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error("Twilio credentials missing — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env");
    }
    _client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return _client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Send a single freeform WhatsApp message. */
export async function sendMessage(toPhone, body) {
  return client().messages.create({
    from: config.twilioWhatsAppFrom,
    to: `whatsapp:${toPhone}`,
    body,
  });
}

/** Send the pre-approved "knock knock" template (production only). */
async function sendTemplateKnock(toPhone) {
  if (!config.twilioContentSid) return false;
  await client().messages.create({
    from: config.twilioWhatsAppFrom,
    to: `whatsapp:${toPhone}`,
    contentSid: config.twilioContentSid,
  });
  return true;
}

/**
 * Generate and deliver the full brief to one user.
 * Returns a status string that is stored on the user record.
 */
export async function sendBriefToUser(user) {
  console.log(`[whatsapp] Generating brief for ${user.name} (${user.country})...`);

  let messages;
  try {
    messages = await generateBrief(user);
  } catch (err) {
    const status = `error: brief generation failed — ${err.message}`;
    store.markSent(user.id, status);
    console.error(`[whatsapp] ${status}`);
    return status;
  }

  try {
    for (const body of messages) {
      await sendMessage(user.whatsapp, body);
      await sleep(1500); // keep messages in order, be gentle on rate limits
    }
    const status = "ok";
    store.markSent(user.id, status);
    console.log(`[whatsapp] Brief sent to ${user.name} (${messages.length} messages)`);
    return status;
  } catch (err) {
    // 63016 = freeform message outside the 24h session window.
    // Twilio may reject the same situation with a "ContentSid Required"
    // 400 instead of 63016, so treat both as "window closed".
    const outsideWindow =
      err?.code === 63016 ||
      /63016/.test(String(err?.message)) ||
      /ContentSid Required/i.test(String(err?.message));
    if (outsideWindow) {
      const knocked = await sendTemplateKnock(user.whatsapp).catch(() => false);
      const status = knocked
        ? "window closed — template sent, waiting for user reply"
        : "error: outside 24h window and no template configured (user should send STATUS)";
      store.markSent(user.id, status);
      console.warn(`[whatsapp] ${status} (${user.name})`);
      return status;
    }
    const status = `error: ${err.message}`;
    store.markSent(user.id, status);
    console.error(`[whatsapp] ${status}`);
    return status;
  }
}

/** Send the daily brief to every registered user, sequentially. */
export async function sendBriefToAll() {
  const users = store.all();
  console.log(`[whatsapp] Daily run: ${users.length} user(s)`);
  for (const user of users) {
    await sendBriefToUser(user);
    await sleep(2000);
  }
  console.log("[whatsapp] Daily run finished");
}
