# CLAUDE.md — project guide for AI assistants

## What this project is

A 24/7 Node.js agent ("The 08:00 Brief") that sends up to 10 users a daily WhatsApp briefing at 08:00 about a country each user chose: news, nearest holiday, a mini language lesson, geography, and prices in the capital. Users register on a web page and can interact over WhatsApp (`STATUS`, `COUNTRY <name>`, `HELP`).

## Stack and key decisions

- **Node.js 18+, ES modules** (`"type": "module"`), Express, node-cron, Twilio SDK. No frontend framework — `public/index.html` is a single self-contained file (inline CSS/JS), matching the owner's preferred style.
- **Content generation:** direct `fetch` to the Anthropic Messages API (`/v1/messages`) with the `web_search_20250305` tool so news/holidays/prices are current. Model comes from `ANTHROPIC_MODEL` in `.env`. Do not add the SDK unless asked — the raw fetch is intentional and dependency-light.
- **Storage:** `data/users.json` via `src/store.js` (atomic writes). Deliberately no database — the hard cap is 10 users. If asked to scale, swap only `store.js`.
- **The brief format contract:** `brief.js` asks the model for 6 parts separated by the literal line `<<<SPLIT>>>`, each part < 1000 chars, WhatsApp formatting (`*bold*`, `_italics_`, no markdown headers/links). Each part becomes one WhatsApp message. If you change the prompt, keep the delimiter and size constraints — Twilio's WhatsApp body limit is 1600 chars.
- **24-hour window handling** (`whatsapp.js`): freeform send first; on Twilio error 63016 fall back to the approved content template (`TWILIO_CONTENT_SID`) if configured. Never remove this fallback — it is what makes the 08:00 business-initiated push viable in production.

## Conventions

- Config only through `src/config.js` (which reads `.env`). Never hardcode secrets.
- Phone numbers stored in E.164 (`+9725…`); `normalizePhone()` in `store.js` is the single source of truth for parsing.
- API responses to the page: `{ message }` on success, `{ error }` with 4xx on failure. Phones are masked in all API output.
- Logs use a `[module]` prefix (`[scheduler]`, `[whatsapp]`, `[webhook]`).
- Long operations (brief generation, ~30–60 s) are fired async after ACKing HTTP/webhook requests — keep it that way, Twilio webhooks time out at 15 s.

## Testing shortcuts

- `npm run send-now` — send to all users immediately.
- `npm run send-now -- +972501234567` — send to one number.
- Temporarily set `DAILY_HOUR` to the next hour to test the cron path.

## Things NOT to do

- Don't switch to CommonJS.
- Don't introduce a build step or frontend framework for the page.
- Don't log full phone numbers or message bodies containing personal data.
- Don't raise `max_uses` for web search above ~10 or `max_tokens` above ~5000 without discussing cost.
