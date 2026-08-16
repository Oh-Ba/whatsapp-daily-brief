# The 08:00 Brief — Daily Country Brief on WhatsApp

A 24/7 agent that sends every subscriber, each morning at 08:00, a WhatsApp briefing about the country they chose:

1. 📰 News — politics, economics, technology, culture, crime + one interesting story
2. 🎉 The nearest holiday — what it is, its ceremonies, and what's unique about it in that country
3. 🗣️ A short everyday dialogue in the local language (café, taxi, shopping, directions, small talk — a different scenario each day)
4. 🗺️ A few sentences about the country's geography
5. 💰 Average prices in the capital: coffee, restaurant, apartment rent, a car

Up to **10 users simultaneously**, each with their own country. A web page handles registration (name, country, WhatsApp number). From WhatsApp, users can reply `STATUS` to get the brief on demand or `COUNTRY <name>` to switch countries.

Content is generated fresh each morning by the **Claude API with web search** (so news, holidays, and prices are current), and delivered through the **Twilio WhatsApp API**.

---

## Architecture

```
┌────────────────┐        ┌─────────────────────────────────────┐
│ Registration   │  HTTP  │  Node.js server (Express)           │
│ page (browser) ├───────►│                                     │
└────────────────┘        │  • node-cron: fires daily at 08:00  │
                          │  • brief.js: Claude API + web search│
┌────────────────┐        │  • whatsapp.js: Twilio sender       │
│ User's WhatsApp│◄───────┤  • store.js: data/users.json        │
│                ├───────►│  • /webhook/whatsapp: STATUS,       │
└────────────────┘ Twilio │    COUNTRY, HELP commands           │
                  webhook └─────────────────────────────────────┘
```

| File | Responsibility |
|---|---|
| `src/server.js` | Entry point — Express app + scheduler start |
| `src/scheduler.js` | Cron job at `DAILY_HOUR` in `TIMEZONE` |
| `src/brief.js` | Builds the prompt, calls the Claude API (web search enabled), splits the result into WhatsApp-sized messages |
| `src/whatsapp.js` | Sends via Twilio; handles the WhatsApp 24-hour window |
| `src/routes.js` | Web API + Twilio inbound webhook |
| `src/store.js` | JSON-file user store (max 10 users) |
| `src/send-now.js` | CLI test: `npm run send-now` |
| `public/index.html` | Registration page |

---

## Setup (Windows, ~15 minutes)

> Deploying to a VPS so it runs 24/7 without your laptop? Follow **DEPLOYMENT.md** instead — it covers Anthropic, Twilio, GitHub, and the VPS step by step.

### 1. Prerequisites

- **Node.js 18+** — check with `node -v`, install from https://nodejs.org if needed.

### 2. Install

Open the project folder (`C:\Work\whatsapp-daily-brief`) in Cursor, then in the terminal:

```powershell
npm install
copy .env.example .env
```

### 3. Get an Anthropic API key

1. Go to https://platform.claude.com → **API Keys** → create a key.
2. Put it in `.env` as `ANTHROPIC_API_KEY`.

> Cost estimate: one brief ≈ 5–8 web searches + a few thousand tokens. For 10 users daily, expect roughly a few dollars per month. Add credit in the console billing page.

### 4. Set up Twilio WhatsApp (sandbox — free to test)

1. Create an account at https://www.twilio.com and copy your **Account SID** and **Auth Token** from the console dashboard into `.env`.
2. In the console go to **Messaging → Try it out → Send a WhatsApp message**. You'll see the sandbox number (usually `+1 415 523 8886`) and a join code like `join brown-tiger`.
3. **Every user** must send that join code once from their own WhatsApp to the sandbox number. That's how the sandbox authorizes recipients.
4. Keep `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` in `.env`.

### 5. Point the Twilio webhook at your server (for STATUS / COUNTRY commands)

Twilio needs a public URL to deliver incoming WhatsApp messages:

- **Local development:** run `ngrok http 3580` (https://ngrok.com), copy the https URL.
- In the Twilio console, on the WhatsApp sandbox settings page, set **"When a message comes in"** to:
  `https://<your-url>/webhook/whatsapp` (method: POST).

The daily *push* works without the webhook — the webhook is only for the inbound commands.

### 6. Run

```powershell
npm start
```

Open http://localhost:3580, register yourself (name, country, WhatsApp number in `+…` format), then click **Send brief now** to test. Or from the terminal:

```powershell
npm run send-now
```

---

## ⚠️ The WhatsApp 24-hour window (read this!)

WhatsApp's rules (not Twilio's): a business may send **freeform messages only within 24 hours of the user's last message to it**. Outside that window, only **pre-approved template messages** may start a conversation.

What this means for the 08:00 push:

- **Sandbox / testing:** the push arrives as long as the user messaged the bot within the previous 24 h (e.g. replied `STATUS` or anything else yesterday). Otherwise Twilio rejects with error **63016** — the user can still pull the brief anytime by sending `STATUS`.
- **Production (proper solution):**
  1. Register your own WhatsApp sender in Twilio (business verification, ~1–3 days).
  2. Create a **Content Template** in Twilio, e.g. *"Good morning! Your daily {{country}} brief is ready 🌍 Reply GET to receive it."* and get it approved.
  3. Put its SID in `.env` as `TWILIO_CONTENT_SID`.

  The app then automatically falls back to the template whenever the window is closed; the user's one-tap reply opens a fresh window and the webhook delivers the full brief.

---

## Running 24/7

The scheduler only fires while the process is running, so the machine (or host) must be on at 08:00.

**Option A — your Windows PC with pm2 (simplest):**
```powershell
npm install -g pm2
pm2 start src/server.js --name daily-brief
pm2 save
pm2 startup   # follow the printed instruction so it survives reboots
```

**Option B — a cloud host (recommended: survives your PC being off):**
Deploy to Railway, Render, Fly.io, or any small VPS. You get a stable public URL too (no ngrok needed for the webhook). Note: on hosts with ephemeral disks, move `data/users.json` to a mounted volume or a small database.

---

## WhatsApp commands (for users)

| Command | Effect |
|---|---|
| `STATUS` (or `GET`, `BRIEF`) | Receive the full brief right now |
| `COUNTRY Italy` | Switch to a new country |
| `HELP` | List commands |

## Web API

| Method & path | Body | Effect |
|---|---|---|
| `GET /api/users` | — | List subscribers (phones masked) |
| `POST /api/register` | `{name, country, whatsapp}` | Register / update a number |
| `POST /api/users/:id/country` | `{country}` | Change country |
| `POST /api/users/:id/send` | — | Send the brief now |
| `DELETE /api/users/:id` | — | Unregister |

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Twilio error 63016 | Outside the 24-h window — see the section above |
| Twilio error 21608 | Recipient hasn't joined the sandbox — send the `join …` code |
| Anthropic 401 | Wrong/missing `ANTHROPIC_API_KEY` |
| Anthropic 400 mentioning web search | Enable web search for your organization in the Claude console settings |
| Brief never arrives at 08:00 | Process wasn't running, or `TIMEZONE` in `.env` doesn't match yours |
| STATUS gets no reply | Webhook URL not set in Twilio, or ngrok tunnel expired |

## Ideas for later (good Cursor tasks)

- Per-user timezone and send hour
- Per-user language for the brief itself (not just the language corner)
- A "history" page showing past briefs
- Move the store to SQLite when you outgrow 10 users
- Admin authentication on the registration page
