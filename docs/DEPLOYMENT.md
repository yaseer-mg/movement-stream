# Movement Stream — VPS Deployment Guide

Production deployment for a self-hosted live streaming platform.
Target: a single Ubuntu 24.04 VPS with at least **4 GB RAM** (FFmpeg transcoding at 4 quality levels is memory-hungry) and 2+ CPU cores.

## Architecture Summary

Everything runs in **Docker Compose** — including Nginx and FFmpeg, so no host-side
Nginx or FFmpeg installation is required.

| Component | How it runs | Reached from |
|---|---|---|
| postgres | container (port 5432, host-only) | other containers only |
| api-server | container (port 4000, host-only) | Nginx proxy `/api`, `/ws` |
| media-server | container (ports 3001 + 1935, host-only) | Nginx proxy `/whip`; FFmpeg inside container |
| web | container builds the React bundle | served by Nginx |
| nginx | container (public 80/443) | the whole internet |
| Let's Encrypt | certbot on host → certs mounted into nginx | — |

---

## 1. VPS Setup (Ubuntu 24.04)

```bash
# Create a deploy user with sudo
sudo adduser deploy
sudo usermod -aG sudo deploy
su - deploy

# Update the system
sudo apt update && sudo apt upgrade -y

# Optional but recommended: enable automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Check available memory / swap (add swap if low — transcoding needs it)
free -h
```

If the VPS has < 4 GB RAM, add a 2 GB swap file:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Installing Docker + Docker Compose

```bash
# Official convenience script (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (no sudo for every command)
sudo usermod -aG docker deploy

# Log out and back in, then verify
docker --version
docker compose version
```

> **Note:** The convenience script installs both Docker Engine and the `docker compose` plugin.

## 3. FFmpeg

FFmpeg is **installed inside the media-server container** (see
`apps/media-server/Dockerfile`). No host install needed.

If you want a host-side copy for debugging recordings, install it with:

```bash
sudo apt install -y ffmpeg
ffmpeg -version
```

## 4. Nginx

Nginx runs **as a container** (see `infra/nginx.conf`). No host install needed.

The host does NOT run Nginx — the container publishes ports 80 and 443.

## 5. DNS + Let's Encrypt SSL

### 5a. Point your domain at the VPS

Create an **A record**: `stream.yourdomain.com` → `<VPS public IP>`.
Create an **AAAA record** too if the VPS has IPv6.

### 5b. Generate the certificate

Start ONLY the nginx container first so it can answer the ACME challenge.
It must see the `your-domain.com` cert paths — the guide uses a real domain,
so replace `your-domain.com` everywhere below with your actual domain.

```bash
cd ~/movement-stream

# 1. Point the nginx config at your real domain
sudo sed -i 's/your-domain.com/stream.yourdomain.com/g' infra/nginx.conf

# 2. Start nginx alone (HTTP server answers the ACME challenge)
docker compose -f infra/docker-compose.prod.yml up -d nginx

# 3. Install certbot
sudo apt install -y certbot

# 4. Issue the certificate (webroot uses the nginx container's /var/www/certbot)
sudo certbot certonly --webroot -w /var/www/certbot \
  -d stream.yourdomain.com

# 5. Restart the full stack — nginx now loads the real certs
DOMAIN=stream.yourdomain.com docker compose -f infra/docker-compose.prod.yml up -d --build
```

> The `certbot_www` volume is already mounted at `/var/www/certbot` inside the
> nginx container, so the challenge is answered by the container.

## 6. Cloning the Repository

```bash
cd ~
git clone https://github.com/YOUR-ORG/movement-stream.git
cd movement-stream

# Generate a deploy key / personal access token if the repo is private
```

## 7. Setting Up Environment Variables

### `apps/api-server/.env`

```bash
cd ~/movement-stream/apps/api-server
cp .env.example .env
nano .env
```

Set at minimum:

```
NODE_ENV=production
DB_HOST=postgres            # ← compose service name, NOT localhost
DB_NAME=movement_stream
DB_USER=movement_user
DB_PASSWORD=<strong random password>
JWT_ACCESS_SECRET=<generated secret>
JWT_REFRESH_SECRET=<generated secret>
MEDIA_SERVER_URL=http://media-server:3001
MEDIA_SERVER_SECRET=<shared secret>
STREAM_PUBLIC_URL=https://stream.yourdomain.com
AWS_ACCESS_KEY_ID=<your key>
AWS_SECRET_ACCESS_KEY=<your secret>
AWS_REGION=eu-west-1
AWS_S3_BUCKET=movement-recordings
CORS_ORIGIN=https://stream.yourdomain.com

# Optional — social media (leave blank to disable)
FACEBOOK_PAGE_ID=
FACEBOOK_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=
```

Generate secrets:

```bash
openssl rand -hex 32   # use for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
openssl rand -hex 32   # use for MEDIA_SERVER_SECRET / API_SERVER_SECRET
```

> The `MEDIA_SERVER_SECRET` in `apps/api-server/.env` MUST equal
> `API_SERVER_SECRET` in `apps/media-server/.env`.

### `apps/media-server/.env`

```bash
cd ~/movement-stream/apps/media-server
cp .env.example .env
nano .env
```

```
NODE_ENV=production
API_SERVER_URL=http://api-server:4000    # ← compose service name
API_SERVER_SECRET=<same shared secret as above>
AWS_ACCESS_KEY_ID=<your key>
AWS_SECRET_ACCESS_KEY=<your secret>
AWS_REGION=eu-west-1
AWS_S3_BUCKET=movement-recordings
```

## 8. Running Migrations

Migrations run **automatically**: the postgres container mounts
`infra/postgres` into `/docker-entrypoint-initdb.d`, so all `*.sql` files
execute on the **first** database initialization.

If the DB volume already exists (e.g. re-deploying), run them manually:

```bash
docker compose -f infra/docker-compose.prod.yml exec postgres \
  psql -U movement_user -d movement_stream \
  -f /docker-entrypoint-initdb.d/run_migrations.sql
```

Verify the tables:

```bash
docker compose -f infra/docker-compose.prod.yml exec postgres \
  psql -U movement_user -d movement_stream -c '\dt'
```

The seed accounts from `infra/postgres/seed.sql` are inserted on first init too:

| Email | Password | Role |
|---|---|---|
| superadmin@movement.ng | Test1234! | super_admin |
| admin@movement.ng | Test1234! | admin |
| cam1@movement.ng | Test1234! | camera_op |
| cam2@movement.ng | Test1234! | camera_op |
| viewer@movement.ng | Test1234! | viewer |

> ⚠️ **Change the seed passwords immediately after first login.**

## 9. Starting All Services

```bash
cd ~/movement-stream
DOMAIN=stream.yourdomain.com \
  docker compose -f infra/docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -f infra/docker-compose.prod.yml ps
docker compose -f infra/docker-compose.prod.yml logs -f api-server
```

Smoke-test the stack:

```bash
curl -s https://stream.yourdomain.com/health
curl -s https://stream.yourdomain.com/api/stream/status
curl -s -I https://stream.yourdomain.com/hls/master.m3u8   # expect 404 until a stream runs
```

## 10. Firewall Rules (UFW)

Only ports **80** and **443** need to be open to the internet.
The API (4000), media server (3001/1935) and DB (5432) are bound to
`127.0.0.1` only and are never exposed publicly.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH            # or: sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

> Do **not** open 4000, 3001, 1935, or 5432 to the world.

## 11. Auto-Start on Reboot

Every service uses `restart: unless-stopped`, so Compose already restarts
everything when the daemon starts. Two more steps make reboot robust:

### 11a. Enable Docker on boot

```bash
sudo systemctl enable docker
```

### 11b. systemd unit for the stack

```bash
sudo nano /etc/systemd/system/movement-stream.service
```

```ini
[Unit]
Description=Movement Stream Docker Compose stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/deploy/movement-stream
Environment=DOMAIN=stream.yourdomain.com
ExecStart=/usr/bin/docker compose -f infra/docker-compose.prod.yml up -d --build
ExecStop=/usr/bin/docker compose -f infra/docker-compose.prod.yml stop
ExecReload=/usr/bin/docker compose -f infra/docker-compose.prod.yml up -d

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now movement-stream
sudo systemctl status movement-stream
```

Test a full reboot:

```bash
sudo reboot
# after boot:
docker compose -f ~/movement-stream/infra/docker-compose.prod.yml ps
```

## Renewing the SSL Certificate

```bash
sudo certbot renew
```

Add a cron job (or systemd timer) so renewal is automatic:

```bash
sudo crontab -e
# add:
0 3 * * * certbot renew --quiet --deploy-hook "docker compose -f /home/deploy/movement-stream/infra/docker-compose.prod.yml restart nginx"
```

## Updating the App

```bash
cd ~/movement-stream
git pull
DOMAIN=stream.yourdomain.com docker compose -f infra/docker-compose.prod.yml up -d --build
```

## Troubleshooting

| Problem | Check |
|---|---|
| `Cannot connect to database` | Is postgres healthy? `docker compose ps`; check `DB_HOST=postgres` |
| Nginx `host not found in upstream` | Container not on the compose network — run via compose, never `docker run` alone |
| SSL `error:0200000E` / cert missing | Certbot hasn't run yet; confirm `infra/nginx.conf` domain matches |
| WHIP handshake fails | Confirm `stream.yourdomain.com/whip` proxies to media-server; port 3001 is host-only |
| No HLS / `404` on `/hls` | Stream must be live first; check `hls_data` volume is mounted in both media-server and nginx |
| High RAM usage | Reduce transcoder presets in `apps/media-server/src/transcoder/index.js` |
| Media server crashes at build | `wrtc` needs build tools — the Dockerfile installs them; ensure ≥ 4 GB RAM or add swap |
