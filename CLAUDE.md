# CLAUDE.md — project guide for AI assistants

## What this project is

A 24/7 Node.js agent ("The 08:00 Brief") that emails up to 10 users a daily briefing at 08:00 about a country each user chose: news, nearest holiday, a mini language lesson, geography, and prices in the capital. Users register on a web page and manage their subscription there.

> **History:** this shipped on WhatsApp via Twilio and moved to email in v2.0. WhatsApp Business requires a Meta business account, ID/business verification, and Meta-approved message templates for any business-initiated send — the 08:00 push is business-initiated by definition, so it could never work without them. Email has no equivalent gate. Don't reintroduce the WhatsApp path without re-reading that history.

## Stack and key decisions

- **Node.js 18+, ES modules** (`"type": "module"`), Express, node-cron, Nodemailer. No frontend framework — `public/index.html` is a single self-contained file (inline CSS/JS), matching the owner's preferred style.
- **Content generation:** direct `fetch` to the Anthropic Messages API (`/v1/messages`) with the `web_search_20250305` tool so news/holidays/prices are current. Model comes from `ANTHROPIC_MODEL` in `.env`. Do not add the SDK unless asked — the raw fetch is intentional and dependency-light.
- **Delivery:** SMTP through Nodemailer (`src/mailer.js`). Gmail with a 16-character **App Password** is the default; any SMTP host works via `SMTP_HOST`/`SMTP_PORT`. Port 465 uses implicit TLS, 587 STARTTLS — `mailer.js` picks based on the port.
- **Storage:** `data/users.json` via `src/store.js` (atomic writes). Deliberately no database — the hard cap is 10 users. If asked to scale, swap only `store.js`.
- **The brief format contract:** `brief.js` asks the model for 6 parts separated by the literal line `<<<SPLIT>>>`. The **first line of each part is its heading** — `mailer.js` renders it as the section title and the rest as the body. Keep the delimiter if you change the prompt.
- **Email HTML is inline-styled on purpose.** Mail clients strip `<style>` blocks unpredictably. Every rule in `buildHtml()` lives on the element. Don't refactor it into a stylesheet.
- **One-way channel.** Email has no inbound webhook, so there are no reply commands. Everything users could once do by replying (`STATUS`, `COUNTRY <name>`) is a button on the registration page.

## Conventions

- Config only through `src/config.js` (which reads `.env`). Never hardcode secrets.
- Email addresses stored lowercase; `normalizeEmail()` in `store.js` is the single source of truth for parsing and validation.
- API responses to the page: `{ message }` on success, `{ error }` with 4xx on failure. Addresses are masked in all API output.
- Logs use a `[module]` prefix (`[scheduler]`, `[mailer]`, `[api]`).
- Long operations (brief generation, ~30–60 s) are fired async after ACKing the HTTP request — keep it that way.
- **Generation happens before delivery is attempted**, so every failed send still bills a full Anthropic call with web search. When debugging delivery, use `npm run check-mail` (free) rather than re-running `send-now`.

## Testing shortcuts

- `npm run check-mail` — verify SMTP login, costs nothing.
- `npm run check-mail -- you@gmail.com` — verify and send a one-line test email.
- `npm run send-now` — full brief to all users immediately.
- `npm run send-now -- you@gmail.com` — full brief to one address.
- `GET /api/health` — SMTP reachability from the running server.
- Temporarily set `DAILY_HOUR` to the next hour to test the cron path.

## Things NOT to do

- Don't switch to CommonJS.
- Don't introduce a build step or frontend framework for the page.
- Don't log full email addresses or message bodies containing personal data.
- Don't raise `max_uses` for web search above ~10 or `max_tokens` above ~5000 without discussing cost.
- Don't commit `.env` — it holds the Anthropic key and the SMTP App Password.
