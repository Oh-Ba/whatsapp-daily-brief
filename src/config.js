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

  // Twilio
  twilioAccountSid: required("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: required("TWILIO_AUTH_TOKEN"),
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
  twilioContentSid: process.env.TWILIO_CONTENT_SID || "",

  // App
  port: Number(process.env.PORT || 3580),
  dailyHour: Number(process.env.DAILY_HOUR || 8),
  timezone: process.env.TIMEZONE || "Asia/Jerusalem",
  maxUsers: Number(process.env.MAX_USERS || 10),
};
