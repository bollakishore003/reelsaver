# 🚀 ReelSave — Deployment Guide

This guide walks you through deploying:
- **Backend** → Digital Ocean Droplet (Node.js + yt-dlp)
- **Frontend** → GitHub Pages (free, static hosting)

---

## PART 1 — Backend: Digital Ocean Droplet

### Step 1: Create a Droplet

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com) → **Create Droplet**
2. Choose:
   - **Region**: Nearest to your users
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic → **$6/month (1GB RAM)** is enough
   - **Authentication**: Add your SSH key (recommended) or set a root password
3. Click **Create Droplet**
4. Copy your droplet's **IP address** (example: `143.198.123.45`)

---

### Step 2: Connect to Your Droplet

Open your terminal and SSH in:

```bash
ssh root@YOUR_DROPLET_IP
```

---

### Step 3: Install Dependencies

Run these commands one by one after connecting:

```bash
# Update packages
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node.js
node --version   # Should show v20.x.x

# Install Python (needed for yt-dlp)
apt install -y python3 python3-pip ffmpeg

# Install yt-dlp (video downloader engine)
pip3 install yt-dlp --break-system-packages

# Verify yt-dlp
yt-dlp --version

# Install PM2 (keeps your server running after reboot)
npm install -g pm2
```

---

### Step 4: Upload & Start the Backend

**Option A — Using Git (recommended):**

```bash
# On your droplet:
cd /root
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME/backend
npm install
```

**Option B — Using SCP (upload files manually):**

```bash
# On your LOCAL machine (not the droplet):
scp -r ./backend root@YOUR_DROPLET_IP:/root/reels-backend
```

Then on the droplet:
```bash
cd /root/reels-backend
npm install
```

---

### Step 5: Start the Server with PM2

```bash
# Start the server
pm2 start ecosystem.config.js

# Make it auto-start after reboot
pm2 startup
pm2 save

# Check it's running
pm2 status
pm2 logs reels-downloader
```

Your backend is now live at: **http://YOUR_DROPLET_IP:3000**

Test it by visiting: `http://YOUR_DROPLET_IP:3000` — you should see:
```json
{"status":"ok","message":"Reels Downloader API is running 🚀"}
```

---

### Step 6: Open Firewall Port

Digital Ocean has a firewall. Allow port 3000:

```bash
ufw allow 3000
ufw allow ssh
ufw enable
```

Or through the DO dashboard: **Networking → Firewalls → Add Rule → Custom TCP 3000**

---

## PART 2 — Frontend: GitHub Pages

### Step 1: Create a GitHub Repository

1. Go to [github.com](https://github.com) → **New repository**
2. Name it: `reelsave` (or anything you like)
3. Set to **Public**
4. Click **Create repository**

---

### Step 2: Update the API URL in the Frontend

Before uploading, open `frontend/index.html` and find this line near the bottom:

```javascript
const API_BASE = "http://YOUR_DROPLET_IP:3000";
```

Replace `YOUR_DROPLET_IP` with your actual droplet IP:

```javascript
const API_BASE = "http://143.198.123.45:3000";  // ← your real IP
```

---

### Step 3: Push Frontend to GitHub

**Option A — Using Git:**

```bash
cd frontend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/reelsave.git
git push -u origin main
```

**Option B — Upload via GitHub website:**

1. Open your repo on GitHub
2. Click **Add file → Upload files**
3. Drag & drop `index.html`
4. Click **Commit changes**

---

### Step 4: Enable GitHub Pages

1. Go to your repo → **Settings** tab
2. Left sidebar → **Pages**
3. Under **Source**, select **Branch: main** and folder **/ (root)**
4. Click **Save**
5. Wait ~1 minute, then your site is live at:
   `https://YOUR_USERNAME.github.io/reelsave`

---

## PART 3 — Test Everything

1. Open your GitHub Pages URL
2. Paste a YouTube Shorts URL, e.g.:
   `https://www.youtube.com/shorts/SOME_SHORT_ID`
3. Click **Fetch Video** — you should see the thumbnail and title
4. Click **Download Video** — the file should download

---

## PART 4 — Keep yt-dlp Updated (Important!)

YouTube and Instagram frequently change their APIs. Run this weekly:

```bash
# On your droplet:
pip3 install -U yt-dlp --break-system-packages
```

Or add a cron job to auto-update:

```bash
crontab -e
# Add this line (updates every Sunday at 3am):
0 3 * * 0 pip3 install -U yt-dlp --break-system-packages
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Could not connect to server" | Check PM2 is running: `pm2 status`. Check firewall: `ufw status` |
| "Failed to fetch video info" | Update yt-dlp: `pip3 install -U yt-dlp --break-system-packages` |
| Instagram says "private" | yt-dlp can't download private videos — only public ones |
| Downloads are slow | Upgrade your droplet to 2GB RAM ($12/month) |
| Site shows old version | Clear browser cache, or wait for GitHub Pages to update (~1 min) |

---

## Optional Upgrades

- **Custom domain**: Add a CNAME file to your GitHub Pages repo with your domain
- **HTTPS on backend**: Set up Nginx + Let's Encrypt with Certbot
- **Rate limiting**: Add `express-rate-limit` to prevent abuse
- **Nginx reverse proxy**: Serve backend on port 80/443 instead of 3000

```bash
# Nginx + SSL (optional):
apt install -y nginx certbot python3-certbot-nginx
# Configure your domain in /etc/nginx/sites-available/
```

---

*Built with Node.js, Express, yt-dlp, and hosted on Digital Ocean + GitHub Pages.*
