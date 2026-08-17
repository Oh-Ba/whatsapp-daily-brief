/**
 * check-mail.js — verifies SMTP credentials without generating a brief.
 *
 *   npm run check-mail                    → log in only
 *   npm run check-mail -- you@gmail.com   → log in and send a one-line test
 *
 * Use this before send-now: it costs nothing, while a failed send-now
 * still bills a full Anthropic call with web search.
 */

import { config, fromAddress } from "./config.js";
import { verifyTransport } from "./mailer.js";
import nodemailer from "nodemailer";

console.log(`host : ${config.smtpHost}:${config.smtpPort}`);
console.log(`user : ${config.smtpUser || "(EMPTY)"}`);
console.log(`pass : ${config.smtpPass ? `(set, ${config.smtpPass.length} chars)` : "(EMPTY)"}`);
console.log(`from : ${fromAddress() || "(EMPTY)"}`);
console.log("---");

try {
  await verifyTransport();
  console.log("SMTP login OK");
} catch (err) {
  console.error("SMTP login FAILED:", err.message);
  process.exit(1);
}

const to = process.argv[2];
if (to) {
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  const info = await transport.sendMail({
    from: fromAddress(),
    to,
    subject: "The 08:00 Brief — test",
    text: "If you are reading this, SMTP delivery works.",
  });
  console.log(`Test email sent to ${to} (${info.messageId})`);
}

process.exit(0);
