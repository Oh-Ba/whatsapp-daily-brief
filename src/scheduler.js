/**
 * scheduler.js — fires the daily brief at DAILY_HOUR (default 08:00)
 * in the configured TIMEZONE, every day of the week.
 */

import cron from "node-cron";
import { config } from "./config.js";
import { sendBriefToAll } from "./mailer.js";

export function startScheduler() {
  const expression = `0 ${config.dailyHour} * * *`; // minute 0 of DAILY_HOUR, daily

  cron.schedule(
    expression,
    () => {
      console.log(`[scheduler] ${String(config.dailyHour).padStart(2, "0")}:00 — starting daily send`);
      sendBriefToAll().catch((err) => console.error("[scheduler] daily run failed:", err));
    },
    { timezone: config.timezone }
  );

  console.log(
    `[scheduler] Daily brief scheduled at ${String(config.dailyHour).padStart(2, "0")}:00 (${config.timezone})`
  );
}
