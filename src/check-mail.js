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
import { verifyTransport, sendTestMail, closeTransport } from "./mailer.js";

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
  closeTransport();
  process.exit(1);
}

const to = process.argv[2];
if (to) {
  try {
    const info = await sendTestMail(to);
    console.log(`Test email sent to ${to} (${info.messageId})`);
  } catch (err) {
    console.error("Test send FAILED:", err.message);
    closeTransport();
    process.exit(1);
  }
}

closeTransport();
process.exit(0);
