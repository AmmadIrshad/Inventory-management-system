# 10. Running in production

## First deployment checklist

```bash
cd inventory-management-system
./scripts/init-env.sh                     # 1. create .env with secrets
nano .env                                 # 2. APP_URL, DOMAIN, SMTP_*, MAIL_FROM, POSTGRES_DATA_DIR
podman compose --profile https up -d --build   # 3. start (or without --profile https for plain HTTP)
podman compose ps                         # 4. db and app "healthy", migrate "Exited (0)"
curl -I "$(grep ^APP_URL .env | cut -d= -f2)/login"   # 5. expect HTTP 200
```

Then: 6. sign up with your own email, receive the verification email, sign in, turn on 2FA.
7. Set up automatic start-up and backups (below). 8. Copy `.env` somewhere safe.

## Start automatically after a reboot

Rootless containers belong to your user, so two one-time commands are needed:

```bash
sudo loginctl enable-linger "$USER"                   # your services run even when you're not logged in
systemctl --user enable --now podman-restart.service  # at boot, start every container marked "restart: always"
```

`db`, `app`, `nginx`, `certbot` and `mailpit` are marked `restart: always`. They also restart by
themselves if they crash.

## Updating to a new version

```bash
cd inventory-management-system
./scripts/backup-db.sh          # always back up first
git pull                        # get the new code
podman compose --profile https up -d --build
podman compose logs migrate     # "All migrations have been successfully applied" or "No pending migrations"
podman image prune -f           # remove old images to free disk space
```

What happens: new images are built, `migrate` applies any new migrations, and the new app container
waits for them, then replaces the old one. Expect a few seconds of downtime while the app restarts.

**Rolling back** code: `git checkout <previous-commit>` (or `git revert`) and rebuild. If the update
included a migration, also restore the backup taken before the update ([chapter 11](11-making-changes.md#undoing-a-change)).

## Backups

```bash
./scripts/backup-db.sh                    # → backups/inventory-YYYYmmdd-HHMMSS.dump
./scripts/backup-db.sh /mnt/usb/inv.dump  # or choose the file
```

- Uses `pg_dump` inside the `db` container: a consistent copy even while people use the app.
- The `.dump` file is compressed; this project's is about 20 KB today.
- **Copy backups off the machine** (USB drive, another server, cloud storage). A backup on the same
  disk doesn't survive a disk failure.

### Automatic daily backups (systemd timer)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/inventory-backup.service <<'EOF'
[Unit]
Description=Back up the inventory database

[Service]
Type=oneshot
WorkingDirectory=%h/Projects/inventory-management-system
ExecStart=%h/Projects/inventory-management-system/scripts/backup-db.sh
# keep 14 days of backups
ExecStartPost=/usr/bin/find %h/Projects/inventory-management-system/backups -name 'inventory-*.dump' -mtime +14 -delete
EOF

cat > ~/.config/systemd/user/inventory-backup.timer <<'EOF'
[Unit]
Description=Daily inventory database backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now inventory-backup.timer
systemctl --user list-timers            # shows the next run
```

(Adjust the paths if the project lives elsewhere.)

## Restoring a backup

```bash
./scripts/restore-db.sh backups/inventory-20260930-020000.dump
```

It asks you to type `restore`, stops the app, replaces **all** data with the backup, and starts the
app again. Add `--yes` to skip the question (for scripts).

## Moving to another server

1. Old server: `./scripts/backup-db.sh` and copy the `.dump` file **and** `.env` to the new server.
2. New server: install Podman, get the code (`git clone` or copy the folder **without** `data/`),
   put `.env` in place (adjust `POSTGRES_DATA_DIR`, `APP_URL`, `DOMAIN` if needed).
3. `podman compose up -d --build` (creates an empty database with the tables).
4. `./scripts/restore-db.sh <file>.dump`.
5. Point DNS at the new server. Certbot gets a new certificate by itself (it retries every 15
   minutes until DNS points at the new machine).

Use the **same `ENCRYPTION_KEY`**, or 2FA stops working.

## Logs and health

```bash
podman compose ps                        # status + health of every container
podman compose logs -f app               # app log (errors, "[email] failed to send…", Google problems)
podman compose --profile https logs certbot   # certificate requests and renewals
podman compose --profile https logs nginx     # "serving … in https mode", reloads, proxy errors
podman compose logs db                   # database messages
curl http://localhost:3000/api/health    # {"status":"ok"} or 503 if the database is unreachable
podman system df                         # disk space used by images and volumes
```

## Email providers

The app works with any provider that offers SMTP. Pick one and put its settings in `.env`
([chapter 9](09-configuration.md#email-smtp)).

| Option | Open source | Cost | Notes |
| --- | --- | --- | --- |
| **Mailpit** (included) | ✅ | free | Development only. Nothing leaves the machine. |
| **Brevo** | ❌ hosted | free up to 300 emails/day | Simple SMTP relay, good for small apps |
| **Resend** | ❌ hosted | free up to 3,000/month | Developer-friendly |
| **Amazon SES** | ❌ hosted | about $0.10 per 1,000 | Cheapest at volume, more setup |
| **Gmail + app password** | ❌ hosted | free, about 500/day | Personal use; needs 2-Step Verification on the Google account |
| **Stalwart, Postal, docker-mailserver, Mailu** | ✅ self-hosted | a server | Full control, but you run a mail server: static IP, reverse DNS, port 25 open, reputation building |

(Free-tier limits change from time to time; check each provider's current pricing page.)

**Making email trustworthy (not spam):** whichever provider you use, add the DNS records it gives you
for your domain:

| Record | What it proves |
| --- | --- |
| **SPF** (a `TXT` record) | Which servers may send mail for your domain |
| **DKIM** (a `TXT`/`CNAME` record) | A digital signature on each email, proving it wasn't altered |
| **DMARC** (a `TXT` record on `_dmarc`) | What receivers should do if SPF/DKIM fail, and where to send reports |

Gmail example for `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop      # 16-character app password from myaccount.google.com/apppasswords
MAIL_FROM="Inventory <you@gmail.com>"
```

Apply with `podman compose up -d`, then test with **Forgot password** on your own account.

## Turn on Google sign-in

1. Open https://console.cloud.google.com, create a project (e.g. "Inventory").
2. **APIs & Services → OAuth consent screen:** app name, support email, and your domain. While the
   app is in "Testing", add the Google accounts allowed to use it; "Publish" it for everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs:** add `<APP_URL>/api/auth/google/callback`, e.g.
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://inventory.example.com/api/auth/google/callback` (production)
5. Copy the **Client ID** and **Client secret** into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
6. Restart: `podman compose up -d` (production) or restart `npm run dev`.

"Continue with Google" now appears on the sign-in and sign-up pages. If Google shows
`redirect_uri_mismatch`, the address in step 4 doesn't exactly match `APP_URL`.

## Disk and housekeeping

| What grows | How to clean |
| --- | --- |
| Old images after updates | `podman image prune -f` |
| Backups | the timer above keeps 14 days; or delete old files in `backups/` |
| Database | tiny for phase one; expired rate-limit rows clean themselves |
| Old day-one volume | `podman volume rm inventory-management-system_pgdata` (once you're sure) |
