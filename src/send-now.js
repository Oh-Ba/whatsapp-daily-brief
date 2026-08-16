/**
 * send-now.js — manual test trigger.
 *
 *   npm run send-now              → send the brief to ALL users now
 *   npm run send-now -- +9725...  → send only to this phone number
 */

import { store } from "./store.js";
import { sendBriefToAll, sendBriefToUser } from "./whatsapp.js";

const phone = process.argv[2];

if (phone) {
  const user = store.findByPhone(phone);
  if (!user) {
    console.error(`No user registered with ${phone}`);
    process.exit(1);
  }
  await sendBriefToUser(user);
} else {
  await sendBriefToAll();
}

process.exit(0);
