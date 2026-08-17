/**
 * server.js — application entry point.
 * Serves the registration page and the API,
 * and starts the 08:00 daily scheduler.
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { router } from "./routes.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(router);

app.listen(config.port, () => {
  console.log("──────────────────────────────────────────────");
  console.log("  Daily Country Brief — agent is running");
  console.log(`  Registration page:  http://localhost:${config.port}`);
  console.log(`  SMTP host:          ${config.smtpHost}:${config.smtpPort}`);
  console.log("──────────────────────────────────────────────");
  startScheduler();
});
