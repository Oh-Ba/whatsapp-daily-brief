/**
 * send-now.js — manual test trigger.
 *
 *   npm run send-now                    → send the brief to ALL users now
 *   npm run send-now -- you@gmail.com   → send only to this address
 */

import { store } from "./store.js";
import { sendBriefToAll, sendBriefToUser, closeTransport } from "./mailer.js";

const email = process.argv[2];

if (email) {
  const user = store.findByEmail(email);
  if (!user) {
    console.error(`No user registered with ${email}`);
    process.exit(1);
  }
  await sendBriefToUser(user);
} else {
  await sendBriefToAll();
}

closeTransport();
process.exit(0);
