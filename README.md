# The 08:00 Brief — Daily Country Brief by email

A 24/7 agent that emails every subscriber, each morning at 08:00, a briefing about the country they chose:

- 📰 **News** — politics, economics, tech, culture, crime, and one curiosity
- 🎉 **Nearest holiday** — what it means, its ceremonies, how it's celebrated locally
- 🗣️ **Language corner** — a short everyday dialogue with transliteration and translation
- 🗺️ **Geography** — the land, the climate, one surprise
- 💰 **Prices in the capital** — coffee, a meal for two, rent, a car

Up to **10 subscribers simultaneously**, each with their own country. A web page handles registration (name, country, email) and day-to-day management: send on demand, switch country, unsubscribe.

Content is generated fresh each morning by the **Claude API with web search** (so news, holidays, and prices are current) and delivered over **SMTP**.

---

## Architecture

```
┌─────────────┐        ┌──────────────────────────────────────┐
│  Web page   ├───────►│  Express server (port 3580)          │
│ (register)  │        │  • scheduler.js: node-cron @ 08:00   │
└─────────────┘        │  • brief.js: Claude API + web search │
                       │  • mailer.js: Nodemailer / SMTP      │
┌─────────────┐        │  • store.js: data/users.json         │
│  Your inbox │◄───────┤                                      │
└─────────────┘  SMTP  └──────────────────────────────────────┘
```

| File | Role |
|---|---|
| `src/server.js` | Entry point: static page, API, scheduler |
| `src/scheduler.js` | Fires the daily send at `DAILY_HOUR` in `TIMEZONE` |
| `src/brief.js` | Builds the prompt, calls the Claude API (web search enabled), splits the result into 6 sections |
| `src/mailer.js` | Renders the sections into one HTML email and sends it |
| `src/routes.js` | Web API used by the registration page |
| `src/store.js` | `data/users.json` persistence (atomic writes) |
| `src/send-now.js` | Manual trigger for testing |
| `src/check-mail.js` | SMTP login check — free, no Anthropic call |
| `public/index.html` | Self-contained registration page |

---

## Quick start (local)

> Deploying to a VPS so it runs 24/7 without your laptop? Follow **DEPLOYMENT.md** — it covers Anthropic, Gmail, GitHub, and the VPS step by step.

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Anthropic key

Create one at https://platform.claude.com → **API Keys**, then put it in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Gmail App Password

Gmail rejects your normal password over SMTP. You need a 16-character **App Password**:

1. Turn on 2-Step Verification: https://myaccount.google.com/security
2. Create the password: https://myaccount.google.com/apppasswords → name it `daily-brief`
3. Google shows something like `abcd efgh ijkl mnop` — **remove the spaces**

```
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop
```

Any other SMTP provider works too — set `SMTP_HOST` and `SMTP_PORT` (465 = implicit TLS, 587 = STARTTLS).

### 4. Check the mail path before spending anything

```bash
npm run check-mail                      # login only
npm run check-mail -- you@gmail.com     # login + one-line test email
```

`SMTP login OK` means you're ready.

### 5. Run

```bash
npm start
```

Open http://localhost:3580, register yourself, then click **Send brief now**. Or from the terminal:

```bash
npm run send-now                        # everyone
npm run send-now -- you@gmail.com       # one address
```

Generation takes 30–60 seconds — that's live web search, not a hang.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model used for generation |
| `SMTP_HOST` | `smtp.gmail.com` | Mail server |
| `SMTP_PORT` | `465` | 465 = implicit TLS, 587 = STARTTLS |
| `SMTP_USER` | — | Required — the sending address |
| `SMTP_PASS` | — | Required — App Password, not your account password |
| `MAIL_FROM` | `The 08:00 Brief <SMTP_USER>` | Display name on the From line |
| `PORT` | `3580` | HTTP port |
| `DAILY_HOUR` | `8` | Hour of the daily send |
| `TIMEZONE` | `Asia/Jerusalem` | IANA timezone for the schedule |
| `MAX_USERS` | `10` | Hard subscriber cap |

---

## API

| Endpoint | Body | Purpose |
|---|---|---|
| `GET /api/users` | — | List subscribers (addresses masked) |
| `POST /api/register` | `{name, country, email}` | Register / update an address |
| `POST /api/users/:id/country` | `{country}` | Switch country |
| `POST /api/users/:id/send` | — | Send the brief now |
| `DELETE /api/users/:id` | — | Unsubscribe |
| `GET /api/health` | — | SMTP reachability check |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `SMTP credentials missing` | `SMTP_USER` / `SMTP_PASS` not set in `.env` |
| `Invalid login` / `535` | Used the account password instead of an App Password, or left the spaces in |
| `Missing credentials for "PLAIN"` | One of the SMTP variables is empty |
| `error: brief generation failed` | Anthropic key or credit — not a mail problem |
| `No user registered with ...` | Address isn't in `data/users.json` |
| Sends fine, nothing in the inbox | Check spam on the first send; mark "not spam" once |

**A note on cost:** the brief is generated *before* delivery is attempted, so every failed send still bills a full Anthropic call with web search. Use `npm run check-mail` to debug delivery — it's free.

---

## History

v1 delivered over WhatsApp via Twilio. WhatsApp Business requires a Meta business account, identity verification, and Meta-approved templates for any business-initiated message — and a scheduled 08:00 brief is business-initiated by definition, so none of that was optional. v2 moved to email, which has no equivalent gate: no verification, no templates, no 24-hour reply window, no per-message cost.
