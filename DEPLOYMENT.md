# DEPLOYMENT.md — connect every service, step by step

This guide takes you from zero to a 24/7 agent running on a cheap VPS, independent of your laptop. Four services are involved:

| Service | What it does here | Cost |
|---|---|---|
| **Anthropic (Claude API)** | Writes the daily brief with live web search | Pay per use, ~a few $/month for 10 users |
| **Twilio** | Sends/receives the WhatsApp messages | Free sandbox; ~$0.005–0.05 per message in production |
| **GitHub** | Moves your code from laptop → VPS, keeps it versioned | Free (private repo) |
| **Hetzner (VPS)** | Runs the server 24/7 | ~€5.50/month (CX23) |

The app listens on port **3580** everywhere (local and VPS).

---

## Part 1 — Anthropic (Claude API key)

1. Go to **https://platform.claude.com** and sign in / create an account.
2. Left menu → **Billing** → add a payment method and buy a small amount of credit ($5 is plenty to start).
3. Left menu → **API Keys** → **Create Key** → name it `daily-brief` → copy the key (starts with `sk-ant-`). You will only see it once — paste it somewhere safe now.
4. Later this goes into `.env` as:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. If the API ever returns a 400 error mentioning web search, open **Settings → Privacy / Tools** in the console and make sure web search is enabled for your organization.

---

## Part 2 — Twilio (WhatsApp)

### 2a. Account + credentials

1. Go to **https://www.twilio.com** → **Sign up** (free trial, no card needed to start).
2. Verify your email and your own phone number when asked.
3. On the **Console dashboard** (https://console.twilio.com) you'll see **Account SID** (starts with `AC`) and **Auth Token** (click the eye icon to reveal). Copy both — they go into `.env`:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   ```

### 2b. WhatsApp sandbox (free testing channel)

1. In the console, left menu: **Messaging → Try it out → Send a WhatsApp message**.
2. You'll see the sandbox number **+1 415 523 8886** and a join code like `join brown-tiger`.
3. From **your own WhatsApp**, send that exact join code to +1 415 523 8886. You'll get a confirmation reply.
4. **Every user you register must do step 3 from their own phone** — that's how the sandbox authorizes recipients (max 10 numbers is fine for the sandbox).
5. Keep in `.env`:
   ```
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```

### 2c. Webhook (lets users send STATUS / COUNTRY commands)

Do this **after** the VPS is running (Part 4), because you need the VPS address:

1. Same sandbox page → **Sandbox settings** tab.
2. In **"When a message comes in"** put:
   ```
   http://YOUR_VPS_IP:3580/webhook/whatsapp
   ```
   Method: **POST** → **Save**.
3. Test: send `HELP` from your WhatsApp to the sandbox number — you should get the command list back.

### 2d. The 24-hour window — why the 08:00 push needs a template

**Read this before wondering why nothing arrives at 08:00.** It is a WhatsApp platform rule, not a bug in this app.

WhatsApp allows a business to send **freeform** messages only within **24 hours** of that user's last inbound message. Outside that window, only a **pre-approved template** may start the conversation.

The 08:00 brief is business-initiated and therefore **always** outside the window. So:

| Scenario | Works? |
|---|---|
| `npm run send-now` right after the user messaged the bot | ✅ freeform, inside the window |
| `npm run send-now` a day later | ❌ needs a template |
| The 08:00 cron push | ❌ **always** needs a template |

`src/whatsapp.js` already implements the correct strategy: try freeform, and on rejection fall back to the approved template in `TWILIO_CONTENT_SID`. With that variable empty, the fallback has nothing to send and the run logs `outside 24h window and no template configured`.

Twilio signals this in two different ways — error **63016**, or a 400 with **`ContentSid Required`**. The app treats both as "window closed."

### 2e. Production setup (required for the 08:00 push to work at all)

The sandbox **cannot** deliver the daily brief. It has no approved templates of your own, and each user must re-join after 72 hours of inactivity. Three steps, in order:

**1. Register a real WhatsApp sender**

Twilio Console → **Messaging → Senders → WhatsApp senders → New sender**. You'll need:
- A phone number you control that is **not** already on WhatsApp (or delete its WhatsApp account first)
- A Meta Business account (Twilio walks you through creating one)
- Business verification — typically **1–3 days**, sometimes longer

When approved, put that number in `.env` (note the `whatsapp:` prefix and E.164 format):
```
TWILIO_WHATSAPP_FROM=whatsapp:+972XXXXXXXXX
```

**2. Create and submit a content template**

Twilio Console → **Messaging → Content Template Builder → Create new**.
- **Content type:** Text
- **Template name:** `daily_brief_ready`
- **Category:** Utility (cheaper than Marketing, and correct here — the user opted in)
- **Body:** `Your daily brief for {{1}} is ready. Reply GET to receive it.`
- **Sample for {{1}}:** `Portugal`

Submit for WhatsApp approval. Utility templates usually clear in **minutes to a few hours**. Once approved, copy the SID (starts with `HX`) into `.env`:
```
TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. Restart and verify**

```bash
pm2 restart daily-brief && pm2 logs daily-brief
```

Expected log on the next push: `window closed — template sent, waiting for user reply`. The user gets the knock, replies `GET`, that opens a fresh 24-hour window, and the webhook delivers the full brief.

> **Cost note:** each template message is a billed WhatsApp *conversation* (roughly $0.005–0.04 depending on country and category). At 10 users daily that is a few dollars a month — check current rates at https://www.twilio.com/en-us/whatsapp/pricing.

---

## Part 3 — GitHub (get the code from laptop to VPS)

### 3a. Create a private repository

1. Go to **https://github.com** → **+** (top right) → **New repository**.
2. Name: `whatsapp-daily-brief` → select **Private** → **Create repository** (don't add a README, the project has one).

### 3b. Push the project from your laptop

In Cursor's terminal, inside `C:\Work\whatsapp-daily-brief`:

```powershell
git init
git add .
git commit -m "Initial version: daily WhatsApp country brief"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-daily-brief.git
git push -u origin main
```

When Git asks for a password, use a **Personal Access Token**, not your GitHub password:

1. GitHub → click your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `daily-brief`, expiration: 90 days (or more), **Repository access**: only `whatsapp-daily-brief`, **Permissions → Contents: Read and write**.
3. Generate, copy the token (starts with `github_pat_`), and paste it as the password when pushing. Windows will remember it (Git Credential Manager).

> `.gitignore` already excludes `.env` and `data/users.json`, so your secrets and user list never reach GitHub. Keep it that way.

### 3c. You'll clone on the VPS in Part 4 using the same token.

---

## Part 4 — Hetzner VPS (the 24/7 machine)

Any VPS works (DigitalOcean, Vultr, etc.) — Hetzner is one of the cheapest reliable options and its EU datacenters are close to Israel.

### 4a. Create the server

1. Go to **https://www.hetzner.com/cloud** → **Sign up** (ID verification may be requested on new accounts — normal).
2. In the **Cloud Console** (https://console.hetzner.cloud) → **New project** → name it `daily-brief` → open it → **Add server**.
3. Choose:
   - **Location:** Falkenstein or Nuremberg (Germany)
   - **Image:** Ubuntu 24.04
   - **Type:** Shared vCPU → **CX23** (~€5.49/month) — smallest is plenty for this app
   - **Networking:** leave Public IPv4 checked
   - **SSH key:** skip for now (we'll use the root password) — or add one if you already have it
4. Click **Create & buy now**. In ~30 seconds you get a server with a **public IP** (e.g. `95.216.x.x`). If you skipped the SSH key, the root password arrives by email.

### 4b. Open the firewall for port 3580

1. In the Hetzner console: **Firewalls → Create firewall**, name `daily-brief-fw`.
2. Inbound rules:
   - TCP, port **22**, source `0.0.0.0/0, ::/0` (SSH)
   - TCP, port **3580**, source `0.0.0.0/0, ::/0` (the app + Twilio webhook)
3. **Apply to** → select your server → create.

### 4c. Connect from Windows

PowerShell has SSH built in:

```powershell
ssh root@YOUR_VPS_IP
```

Type `yes` to trust the host, enter the root password from the email (Hetzner will make you change it on first login).

### 4d. Install Node.js and pm2 (run these on the VPS)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node -v        # should print v22.x
npm install -g pm2
```

### 4e. Clone the project and configure it

Put the token **in the URL**. The interactive password prompt shows nothing as you type and right-click/Ctrl+V often fails to paste over SSH, which produces a misleading `Invalid username or token`:

```bash
cd /opt && \
git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/whatsapp-daily-brief.git && \
cd whatsapp-daily-brief && \
git remote set-url origin https://github.com/YOUR_USERNAME/whatsapp-daily-brief.git && \
npm install && \
cp .env.example .env && \
nano .env
```

The `set-url` line removes the token from `.git/config`, where cloning writes it in cleartext. Later `git pull`s will then ask for auth again — re-add the token to the URL when deploying, or set up a read-only deploy key.

> Replace **`YOUR_TOKEN`** and **`YOUR_USERNAME`** with real values. Anything in `CAPS_WITH_UNDERSCORES` in this guide is a fill-in-the-blank — pasting it literally creates a remote pointing at a repository that does not exist.
>
> Chain the commands with `&&` as shown. Newline-separated commands each run regardless of whether the previous one failed, so one broken clone produces a cascade of unrelated errors that hides the real cause.

In nano, fill in the real values (Anthropic key, Twilio SID/token). Check that `PORT=3580` and `TIMEZONE=Asia/Jerusalem`. Save with **Ctrl+O**, Enter, exit with **Ctrl+X**.

### 4f. Start it 24/7

```bash
pm2 start src/server.js --name daily-brief
pm2 save
pm2 startup    # prints one command — copy/paste and run it (auto-start on reboot)
pm2 logs daily-brief   # watch it live; Ctrl+C to stop watching (app keeps running)
```

### 4g. Verify

1. On your laptop, open **http://YOUR_VPS_IP:3580** — the registration page should load from anywhere.
2. Register yourself and click **Send brief now** — the brief should reach your WhatsApp in ~1 minute (remember: you must have joined the sandbox, step 2b).
3. Now do Part 2c (point the Twilio webhook at `http://YOUR_VPS_IP:3580/webhook/whatsapp`) and send `STATUS` from WhatsApp.
4. Done — the 08:00 push now runs regardless of your laptop.

---

## Troubleshooting: nothing arrives on WhatsApp

Work top-down. The log line from `pm2 logs daily-brief` (or `npm run send-now`) tells you which case you are in.

| Log line | Meaning | Fix |
|---|---|---|
| `error: ContentSid Required` (code **21654**) | Production sender, no template — business-initiated sends need one | Have the user message the bot first, or finish 2e step 2 |
| `outside 24h window and no template configured` | Same cause, correctly detected | Set `TWILIO_CONTENT_SID` — see 2e |
| `window closed — template sent, waiting for user reply` | Working as designed | User replies `GET` to receive the brief |
| `error: brief generation failed — ...` | Anthropic side, not Twilio | Check `ANTHROPIC_API_KEY` and credit balance |
| `No Twilio trial phone number is assigned...verified recipient` | Account still on trial — recipient not verified | Verify the number, or upgrade the account (below) |
| `Twilio credentials missing` | `.env` not loaded | Confirm `.env` sits next to `package.json` |
| `No user registered with +...` | Number not in `data/users.json` | Register via the web page, or seed the file |
| `Brief sent to ... (6 messages)` | Twilio **accepted** it | The problem is delivery — see below |

**If the log says sent but the phone shows nothing**, Twilio accepted the API call and failed to deliver. Twilio Console → **Monitor → Logs → Messaging** is authoritative: find the message and read its status.

- `delivered` — it arrived; check the phone's archived chats and that you're looking at the right WhatsApp account
- `undelivered` / `failed` — open the message and read the error code
- `sent` and stuck — usually a sandbox recipient who never joined

Most common causes, in order:

1. **The recipient never joined the sandbox.** Every number must send `join <code>` to +1 415 523 8886 from its own phone — including yours. Without it Twilio may accept the call and silently drop the message.
2. **The 72-hour sandbox expiry.** Sandbox joins lapse after 72 hours of inactivity and must be redone. This bites regularly during testing.
3. **Trial-account restriction.** An unupgraded Twilio trial only sends to *verified* numbers — Console → **Phone Numbers → Manage → Verified Caller IDs → Add a new Caller ID**. Twilio calls or texts a 6-digit code to that number; enter it to verify.
   **This does not scale.** Every one of your 10 users would have to be verified individually, and trial credit is capped. Upgrade the account (Console → **Billing → Upgrade**, add a payment method) before going live — it removes the restriction entirely and is a prerequisite for the 08:00 push reaching anyone who isn't you.
4. **Wrong `TWILIO_WHATSAPP_FROM`.** Needs the `whatsapp:` prefix and E.164 form: `whatsapp:+14155238886`.
5. **Number format.** `data/users.json` stores E.164 with no `whatsapp:` prefix — `+972501234567`. The prefix is added in code.

> A Twilio API error means **no message was ever created** — nothing to find in the logs and nothing could have arrived. That is a different failure from an accepted-but-undelivered message, and it is the one to rule out first.

## Everyday operations cheat sheet

| Task | Where | Command |
|---|---|---|
| See logs | VPS | `pm2 logs daily-brief` |
| Restart app | VPS | `pm2 restart daily-brief` |
| App status / uptime | VPS | `pm2 status` |
| Deploy a code change | laptop → VPS | laptop: `git push` · VPS: `cd /opt/whatsapp-daily-brief && git pull && npm install && pm2 restart daily-brief` |
| Test a send immediately | VPS | `npm run send-now` |
| Back up users | VPS | copy `/opt/whatsapp-daily-brief/data/users.json` |

## Security notes (worth 5 minutes)

- The registration page is open to the internet on port 3580 and has no login — anyone with the IP could register numbers. For personal use, obscurity + the 10-user cap is usually fine, but consider adding basic auth (good Cursor task) or restricting the Hetzner firewall's 3580 rule to your own IP once everyone is registered (note: Twilio's webhook still needs access — you can list Twilio's IP ranges or keep the port open and add auth to the page only).
- Never commit `.env`. If a key leaks, revoke it in the Anthropic/Twilio console and create a new one.
- Optional upgrade: put a free domain (e.g. DuckDNS) + Caddy in front for HTTPS. Not required — Twilio accepts `http://` webhooks — but nicer.
