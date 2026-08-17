# DEPLOYMENT.md — connect every service, step by step

This guide takes you from zero to a 24/7 agent running on a cheap VPS, independent of your laptop. Four services are involved:

| Service | What it does here | Cost |
|---|---|---|
| **Anthropic (Claude API)** | Writes the daily brief with live web search | Pay per use, ~a few $/month for 10 users |
| **Gmail (SMTP)** | Delivers the brief to each subscriber's inbox | Free |
| **GitHub** | Moves your code from laptop → VPS, keeps it versioned | Free (private repo) |
| **Hetzner (VPS)** | Runs the server 24/7 | ~€5.50/month (CX23) |

The app listens on port **3580** everywhere (local and VPS).

> **Why email and not WhatsApp?** WhatsApp Business requires a Meta business account, identity/business verification, and a Meta-approved message template for any message the business starts. The 08:00 brief is business-initiated by definition, so none of it is optional there. Email has no such gate — no verification, no templates, no per-message cost, no 24-hour reply window.

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

## Part 2 — Gmail (sending the mail)

Gmail won't accept your normal account password over SMTP. You need an **App Password** — a 16-character key that only works for mail sending and can be revoked on its own.

### 2a. Turn on 2-Step Verification

App passwords don't exist without it.

1. Go to **https://myaccount.google.com/security**.
2. Under "How you sign in to Google", open **2-Step Verification** and finish the setup.

### 2b. Create the App Password

1. Go to **https://myaccount.google.com/apppasswords** (or Security → search "App passwords").
2. Enter the name `daily-brief` → **Create**.
3. Google shows a 16-character code in four groups, e.g. `abcd efgh ijkl mnop`.
4. Copy it and **remove the spaces** — it goes into `.env` as one 16-character string:
   ```
   SMTP_USER=you@gmail.com
   SMTP_PASS=abcdefghijklmnop
   ```

> The code is shown once. If you lose it, delete the entry and create a new one — no harm done.

### 2c. Verify before sending anything

The check below logs into Gmail without generating a brief, so it costs nothing. Do this **before** `send-now`: a failed `send-now` still bills a full Anthropic call with web search.

```bash
npm run check-mail                      # login only
npm run check-mail -- you@gmail.com     # login + a one-line test email
```

`SMTP login OK` means you're done with Google.

### 2d. Using a provider other than Gmail

Set `SMTP_HOST` and `SMTP_PORT` in `.env`. Port **465** uses implicit TLS, **587** uses STARTTLS — the app picks the right mode from the port number. Everything else is identical.

---

## Part 3 — GitHub (get the code from laptop to VPS)

### 3a. Create a private repository

1. Go to **https://github.com** → **+** (top right) → **New repository**.
2. Name: `whatsapp-daily-brief` → select **Private** → **Create repository** (don't add a README, the project has one).

### 3b. Push the project from your laptop

```powershell
git init
git add .
git commit -m "Initial version"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-daily-brief.git
git push -u origin main
```

When Git asks for a password, use a **Personal Access Token**, not your GitHub password:

1. GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `daily-brief`, expiration: 90 days or more, **Repository access**: only `whatsapp-daily-brief`, **Permissions → Repository → Contents: Read and write**.
3. Generate and copy the token (starts with `github_pat_`).

> **Contents** is the permission git uses. Not "Repository security advisories", not anything else. Without it you get `403 Write access to repository not granted` even though the token authenticates fine.

> `.gitignore` already excludes `.env` and `data/users.json`, so your secrets and subscriber list never reach GitHub. Keep it that way.

---

## Part 4 — Hetzner VPS (the 24/7 machine)

Any VPS works (DigitalOcean, Vultr, etc.) — Hetzner is one of the cheapest reliable options and its EU datacenters are close to Israel.

### 4a. Create the server

1. **https://www.hetzner.com/cloud** → **Sign up** (ID verification may be requested on new accounts — normal).
2. **Cloud Console** → **New project** → name it `daily-brief` → **Add server**.
3. Choose:
   - **Location:** Falkenstein or Nuremberg (Germany)
   - **Image:** Ubuntu 24.04
   - **Type:** Shared vCPU → **CX23** (~€5.49/month)
   - **Networking:** leave Public IPv4 checked
4. **Create & buy now**. You get a public IP; if you skipped the SSH key, the root password arrives by email.

### 4b. Open the firewall for port 3580

1. **Firewalls → Create firewall**, name `daily-brief-fw`.
2. Inbound rules:
   - TCP, port **22**, source `0.0.0.0/0, ::/0` (SSH)
   - TCP, port **3580**, source `0.0.0.0/0, ::/0` (the registration page)
3. **Apply to** → select your server → create.

### 4c. Connect from Windows

```powershell
ssh root@YOUR_VPS_IP
```

If the session keeps dropping when idle, add `-o ServerAliveInterval=60`.

### 4d. Install Node.js and pm2 (on the VPS)

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

> Replace **`YOUR_TOKEN`** and **`YOUR_USERNAME`** with real values. Anything in `CAPS_WITH_UNDERSCORES` in this guide is a fill-in-the-blank.
>
> Chain the commands with `&&` as shown. Newline-separated commands each run regardless of whether the previous one failed, so one broken clone produces a cascade of unrelated errors that hides the real cause.

In nano, fill in the Anthropic key and the Gmail App Password. Check that `PORT=3580` and `TIMEZONE=Asia/Jerusalem`. Save with **Ctrl+O**, Enter, exit with **Ctrl+X**.

### 4f. Verify mail before anything else

```bash
npm run check-mail -- you@gmail.com
```

### 4g. Start it 24/7

```bash
pm2 start src/server.js --name daily-brief
pm2 save
pm2 startup    # prints one command — copy/paste and run it (auto-start on reboot)
pm2 logs daily-brief
```

### 4h. Verify

1. Open **http://YOUR_VPS_IP:3580** — the registration page loads from anywhere.
2. Register yourself and click **Send brief now** — the email arrives in ~1 minute.
3. Done — the 08:00 push now runs regardless of your laptop.

To test the schedule without waiting for morning: set `DAILY_HOUR` to the next hour, `pm2 restart daily-brief`, watch for `[scheduler] HH:00 — starting daily send`, then set it back to `8`.

---

## Troubleshooting: no email arrives

Read the log line from `pm2 logs daily-brief`.

| Log line | Cause | Fix |
|---|---|---|
| `SMTP credentials missing` | `.env` not loaded | Confirm `.env` sits next to `package.json` |
| `Invalid login` / `535` | Wrong App Password, or you used the account password | Regenerate the App Password, paste without spaces |
| `Missing credentials for "PLAIN"` | `SMTP_USER` or `SMTP_PASS` empty | Fill both in `.env`, restart |
| `self signed certificate` | Corporate proxy intercepting TLS | Use port 587, or a different network |
| `error: brief generation failed` | Anthropic side, not mail | Check `ANTHROPIC_API_KEY` and credit balance |
| `No user registered with ...` | Address not in `data/users.json` | Register on the page |
| `Brief sent to ... (6 sections)` | Sent successfully | Check spam; add the sender to contacts |

**If mail sends but never arrives**, it's almost always the spam folder on the first send. Gmail sending to itself is usually clean, but a brand-new sending pattern can still get filed. Mark it "not spam" once and it sticks.

---

## Everyday operations cheat sheet

| Task | Where | Command |
|---|---|---|
| See logs | VPS | `pm2 logs daily-brief` |
| Restart app | VPS | `pm2 restart daily-brief` |
| App status / uptime | VPS | `pm2 status` |
| Check mail login only | VPS | `npm run check-mail` |
| Deploy a code change | laptop → VPS | laptop: `git push` · VPS: `cd /opt/whatsapp-daily-brief && git pull && npm install && pm2 restart daily-brief` |
| Send a brief immediately | VPS | `npm run send-now` |
| Back up subscribers | VPS | copy `/opt/whatsapp-daily-brief/data/users.json` |

## Security notes (worth 5 minutes)

- The registration page is open to the internet on port 3580 and has no login — anyone with the IP could subscribe an address. For personal use, obscurity plus the 10-user cap is usually fine, but consider adding basic auth or restricting the Hetzner firewall's 3580 rule to your own IP once everyone is registered.
- Never commit `.env`. If a key leaks, revoke it: Anthropic keys in their console, Gmail App Passwords at **myaccount.google.com/apppasswords** (deleting the entry kills it instantly).
- An App Password grants mail-sending access to your Google account. It is safer than your real password — revocable, single-purpose — but still treat it as a secret.
- Optional upgrade: put a free domain (e.g. DuckDNS) + Caddy in front for HTTPS on the registration page.
