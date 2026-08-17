import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`[config] WARNING: ${name} is not set. Set it in .env`);
  }
  return v || "";
}

export const config = {
  // Anthropic
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",

  // Email (SMTP). With Gmail, SMTP_PASS is a 16-character App Password —
  // never the account password. See DEPLOYMENT.md Part 2.
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: required("SMTP_USER"),
  smtpPass: required("SMTP_PASS"),
  mailFrom: process.env.MAIL_FROM || "",

  // App
  port: Number(process.env.PORT || 3580),
  dailyHour: Number(process.env.DAILY_HOUR || 8),
  timezone: process.env.TIMEZONE || "Asia/Jerusalem",
  maxUsers: Number(process.env.MAX_USERS || 10),
};

/** "The 08:00 Brief <you@gmail.com>" — falls back to the SMTP user. */
export function fromAddress() {
  if (config.mailFrom) return config.mailFrom;
  return config.smtpUser ? `The 08:00 Brief <${config.smtpUser}>` : "";
}
