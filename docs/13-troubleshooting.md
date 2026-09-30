# 13. Troubleshooting

Start with these three commands. They explain most problems:

```bash
cd ~/Projects/inventory-management-system
podman compose ps                 # is everything running and healthy?
podman compose logs --tail 50 app # what did the app say last?
curl http://localhost:3000/api/health
```

## Common problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `npm run dev` fails with "Can't reach database server at localhost:5432" | Database container not running (e.g. after a reboot) | `npm run services:up` |
| After a reboot, nothing is running | Auto-start not enabled | [Enable linger + podman-restart](10-operations.md#start-automatically-after-a-reboot), or `podman compose up -d` |
| `set POSTGRES_PASSWORD in .env` (or `APP_URL`, `ENCRYPTION_KEY`…) when running compose | `.env` missing or incomplete | `./scripts/init-env.sh`, then fill in the values |
| App container keeps restarting, log says `Invalid environment variables` | A setting is missing or malformed | Fix `.env` (message says which), then `podman compose up -d` |
| App log repeats `[start] waiting for migrations` | The `migrate` job failed or hasn't run | `podman compose logs migrate`; fix the cause, then `podman compose up -d` |
| `db` stays "unhealthy" on the very first start | First-time setup of the data folder is slow on some disks | Wait a minute; check `podman compose logs db` |
| `db` fails with "Permission denied" on its folder | `POSTGRES_DATA_DIR` points somewhere your user can't write (e.g. `/var/lib/…`) | Use a folder you own, or `sudo mkdir -p /srv/inventory && sudo chown $USER /srv/inventory` |
| Emails don't arrive (development) | Mailpit not running | `npm run services:up`; open http://localhost:8025 |
| Emails don't arrive (production) | Wrong SMTP settings, or mail lands in spam | `podman compose logs app \| grep email`; check `SMTP_*`; add SPF/DKIM/DMARC ([chapter 10](10-operations.md#email-providers)) |
| Emails arrive, but links point to `localhost` | `APP_URL` is wrong | Set `APP_URL` to the real address, `podman compose up -d` |
| "Please verify your email address first" | Account not verified yet | Click the link in the newest email; or use Resend; or [verify by hand](06-database-and-prisma.md#admin-recipes-for-support-situations) |
| "Too many sign-in attempts" | Rate limit hit (10 per email per 15 min) | Wait 15 minutes, or [clear the limit](06-database-and-prisma.md#admin-recipes-for-support-situations) |
| 2FA code always "didn't work" | Phone clock is off | Set the phone's time to automatic |
| Lost phone **and** recovery codes | — | An admin turns 2FA off in the database ([recipe](06-database-and-prisma.md#admin-recipes-for-support-situations)) after confirming the person's identity |
| Every 2FA code fails for everyone, suddenly | `ENCRYPTION_KEY` was changed | Put the original key back in `.env` and `podman compose up -d` |
| No "Continue with Google" button | `GOOGLE_CLIENT_ID`/`SECRET` not set | [Set them up](10-operations.md#turn-on-google-sign-in), restart |
| Google says `redirect_uri_mismatch` | Registered redirect URI ≠ `APP_URL` + `/api/auth/google/callback` | Fix it in Google Cloud console (exact match, including `https` and no trailing slash) |
| Sign-in shows "Google sign-in didn't complete" | Took longer than 10 minutes, cookies blocked, or wrong secret | Try again; check `podman compose logs app \| grep google` |
| Site shows "HTTPS is being set up for …" (503) | Nginx is still in HTTP-only mode: Certbot has no certificate yet | `podman compose --profile https logs certbot`. Usually DNS doesn't point at the server yet, or ports 80/443 are blocked; Certbot retries every 15 minutes |
| Certbot log: "Timeout during connect" / "Connection refused" | Let's Encrypt can't reach port 80 from the internet | Open 80/443 in firewalld, the cloud firewall and the router; check `getent hosts <domain>` |
| Certbot log: "too many certificates" / "rateLimited" | Too many requests for the same domain this week | Wait (the log says until when); test with `LETSENCRYPT_STAGING=true`; don't delete the `letsencrypt` volume repeatedly |
| Browser warns "not secure" with `DOMAIN=localhost` | Expected: a self-signed test certificate | Click *Advanced → Continue*; use a real domain for production |
| Browser warns after testing with `LETSENCRYPT_STAGING=true` | Staging certificates aren't trusted | Set it to `false`, `podman volume rm inventory-management-system_letsencrypt`, then `podman compose --profile https up -d` |
| Nginx: "permission denied" / "address in use" on port 80 or 443 | Rootless Podman can't use ports below 1024, or another web server already uses them | [Set `ip_unprivileged_port_start=80`](08-networking-domain-https.md#step-3-let-rootless-podman-use-ports-80443-and-open-the-firewall); `sudo ss -tlnp` to find the other program |
| 502 Bad Gateway from Nginx | The app container is down, starting, or was recreated on its own | `podman compose ps`; wait for `app` to be healthy, then `podman compose --profile https restart nginx` |
| Nginx keeps restarting: `host not found in upstream "app"` | Nginx started while the app container didn't exist | `podman compose --profile https up -d` (starts the app first) |
| Other devices can't open `http://<ip>:3000` | `APP_BIND` is `127.0.0.1` | Set `APP_BIND=0.0.0.0` and `APP_URL=http://<ip>:3000`, `podman compose up -d` |
| "Port 3000 is already in use" | A dev server and the app container both want 3000 | Stop one: Ctrl+C in the dev terminal, or `podman compose stop app` |
| Forms stop working behind a different reverse proxy (app log mentions an origin/host mismatch) | That proxy rewrites the Host header | Make it pass the original Host header (our Nginx config sends `Host $http_host`), or list its domain in `serverActions.allowedOrigins` in `next.config.ts` |
| `npm install` warns about scripts not covered by allowScripts | npm 11 blocks new setup scripts | `npm approve-scripts <package>` if you trust it |
| Browser test: "Executable doesn't exist" | Chromium not downloaded | `npx playwright install chromium --only-shell` |
| Disk filling up | Old images and build caches | `podman image prune -f`, `podman system df` |
| Can't delete `data/postgres` ("Permission denied") | Files belong to the container's user | `podman unshare rm -rf data/postgres` (**deletes the database**; back up first) |

## Starting completely fresh (development only)

This **deletes all local data**:

```bash
./scripts/backup-db.sh                                  # just in case
podman compose --profile dev --profile https down
podman unshare rm -rf data/postgres
npm run services:up && npm run db:migrate
```

## Getting help

When asking someone for help, include:

1. What you did and what you expected.
2. The output of `podman compose ps` and `podman compose logs --tail 100 app`.
3. The output of `git log --oneline -3` (which version is running).

Never paste the contents of `.env`: it holds secrets.
