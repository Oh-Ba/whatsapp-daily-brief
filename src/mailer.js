/**
 * mailer.js — delivers the brief by email over SMTP.
 *
 * Replaces the old WhatsApp sender. Email has none of WhatsApp's
 * business-messaging restrictions: no 24-hour session window, no
 * pre-approved templates, no per-recipient opt-in, no per-message cost.
 * A scheduled 08:00 send simply works.
 *
 * The brief still arrives from brief.js as an array of sections; here
 * they become one formatted email instead of six chat messages.
 */

import nodemailer from "nodemailer";
import { config, fromAddress } from "./config.js";
import { generateBrief } from "./brief.js";
import { store } from "./store.js";

// Lazy init so the server can boot (and the page can be used)
// even before SMTP credentials are configured in .env.
let _transport = null;
function transport() {
  if (!_transport) {
    if (!config.smtpUser || !config.smtpPass) {
      throw new Error("SMTP credentials missing — set SMTP_USER and SMTP_PASS in .env");
    }
    _transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: config.smtpUser, pass: config.smtpPass },
      // Without these, a socket that never answers hangs the whole run:
      // sendBriefToAll() awaits each user in turn, so one stuck connection
      // stalls every subscriber after it.
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  }
  return _transport;
}

/** Check the SMTP credentials without sending anything. */
export async function verifyTransport() {
  await transport().verify();
  return true;
}

/** Send a one-line test message. Used by check-mail.js. */
export async function sendTestMail(to) {
  return transport().sendMail({
    from: fromAddress(),
    to,
    subject: "The 08:00 Brief — test",
    text: "If you are reading this, SMTP delivery works.",
  });
}

/**
 * Release the SMTP connection. Long-running processes don't need this
 * (the server holds one transport for its lifetime), but one-shot CLI
 * scripts must call it or Node keeps the socket handle open.
 */
export function closeTransport() {
  if (_transport) {
    _transport.close();
    _transport = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * The model writes with *bold* and _italics_ (carried over from the
 * WhatsApp format). Escape first, then promote those to real tags.
 */
function inlineFormat(text) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
}

function sectionHtml(part) {
  const lines = part.split("\n");
  const heading = lines[0] || "";
  const rest = lines.slice(1).join("\n").trim();

  return `
    <div style="background:#ffffff;border:1px solid #d8e3da;border-radius:12px;padding:20px 22px;margin:0 0 14px;">
      <h2 style="margin:0 0 10px;font-size:17px;line-height:1.35;color:#10322a;font-weight:700;">
        ${inlineFormat(heading)}
      </h2>
      <div style="margin:0;font-size:15px;line-height:1.62;color:#26382f;white-space:pre-wrap;">${inlineFormat(rest)}</div>
    </div>`;
}

function buildHtml(user, parts, dateLabel) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#edf3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">

    <div style="padding:0 4px 18px;">
      <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#5c7269;font-weight:600;">
        The 08:00 Brief
      </div>
      <div style="font-size:26px;font-weight:800;color:#10322a;letter-spacing:-.02em;margin-top:4px;">
        ${escapeHtml(user.country)}
      </div>
      <div style="font-size:14px;color:#5c7269;margin-top:2px;">${escapeHtml(dateLabel)}</div>
    </div>

    ${parts.map(sectionHtml).join("")}

    <div style="padding:14px 4px 4px;font-size:12.5px;color:#5c7269;line-height:1.6;">
      Change your country or unsubscribe on the brief page.
    </div>

  </div>
</body></html>`;
}

/**
 * Generate and email the full brief to one user.
 * Returns a status string that is stored on the user record.
 */
export async function sendBriefToUser(user) {
  console.log(`[mailer] Generating brief for ${user.name} (${user.country})...`);

  if (!user.email) {
    const status = "error: user has no email address";
    store.markSent(user.id, status);
    console.error(`[mailer] ${status} (${user.name})`);
    return status;
  }

  let parts;
  try {
    parts = await generateBrief(user);
  } catch (err) {
    const status = `error: brief generation failed — ${err.message}`;
    store.markSent(user.id, status);
    console.error(`[mailer] ${status}`);
    return status;
  }

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: config.timezone,
  });

  try {
    await transport().sendMail({
      from: fromAddress(),
      to: user.email,
      subject: `☀️ Your ${user.country} brief — ${dateLabel}`,
      text: parts.join("\n\n────────────────────\n\n"),
      html: buildHtml(user, parts, dateLabel),
    });

    const status = "ok";
    store.markSent(user.id, status);
    console.log(`[mailer] Brief sent to ${user.name} (${parts.length} sections)`);
    return status;
  } catch (err) {
    const status = `error: ${err.message}`;
    store.markSent(user.id, status);
    console.error(`[mailer] ${status}`);
    return status;
  }
}

/** Send the daily brief to every registered user, sequentially. */
export async function sendBriefToAll() {
  const users = store.all();
  console.log(`[mailer] Daily run: ${users.length} user(s)`);
  for (const user of users) {
    await sendBriefToUser(user);
  }
  console.log("[mailer] Daily run finished");
}
