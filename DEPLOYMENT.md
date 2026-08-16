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

### 2d. Later: production (optional, when you outgrow the sandbox)

The sandbox needs each user to send the join code and re-join every 72 hours of inactivity. For a permanent setup: in Twilio go to **Messaging → Senders → WhatsApp senders** → register your own number (business verification via Meta, ~1–3 days), then create a **Content Template** ("Your daily brief is ready — reply GET") and put its SID in `.env` as `TWILIO_CONTENT_SID`. The app already knows how to use it.

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

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/whatsapp-daily-brief.git
# username: YOUR_USERNAME
# password: paste your github_pat_... token

cd whatsapp-daily-brief
npm install
cp .env.example .env
nano .env
```

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
