# 9. Configuration (`.env`)

All settings and secrets live in one file, `.env`, in the project folder. It is **never** committed to
Git (it's in `.gitignore`). The template with explanations is `.env.example`; create a real one with
fresh secrets using:

```bash
./scripts/init-env.sh      # refuses to overwrite an existing .env
```

`.env` is read by: the app (`npm run dev` / `npm start`), the Prisma CLI, `podman compose` (which passes
the values into the containers), and the tests.

## Every setting

### App

| Variable | Development value | Production example | What it does |
| --- | --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | `https://inventory.example.com` | The address people use. Used in email links and the Google redirect; `https://` turns on `Secure` cookies. **Required.** |
| `APP_BIND` | `127.0.0.1` | `127.0.0.1` (with HTTPS) or `0.0.0.0` | Which network the app container's port listens on ([chapter 8](08-networking-domain-https.md)). |
| `APP_PORT` | `3000` | `3000` | The host port for the app. |
| `DOMAIN` | *(empty)* | `inventory.example.com` | Only for `--profile https`: the domain Nginx serves and Certbot gets a certificate for. Empty = `localhost` (a self-signed test certificate). |
| `LETSENCRYPT_EMAIL` | *(empty)* | `you@example.com` | Optional contact for your Let's Encrypt account. |
| `LETSENCRYPT_STAGING` | `false` | `false` | `true` uses Let's Encrypt's **test** servers (no weekly limits, but browsers don't trust the certificate). Before switching back to `false`, delete the `letsencrypt` volume. |
| `HTTP_PORT` / `HTTPS_PORT` | *(not set → 80 / 443)* | 80 / 443 | Nginx's host ports. Change only for local testing (e.g. 8080/8443). |
| `ENCRYPTION_KEY` | generated | generated | 32 random bytes (base64) that encrypt 2FA secrets. **Required. Back it up. Never change it** after people have enabled 2FA. |

### Database

| Variable | Value | What it does |
| --- | --- | --- |
| `POSTGRES_USER` | `inventory` | Database user name (created on first start). |
| `POSTGRES_PASSWORD` | generated | Database password. **Required.** |
| `POSTGRES_DB` | `inventory` | Database name. |
| `POSTGRES_DATA_DIR` | `./data/postgres` | **Host folder for the database files.** Absolute (`/srv/inventory/postgres`) or relative to the project. |
| `POSTGRES_PORT` | *(not set → 5432)* | Host port for the database (always bound to `127.0.0.1`). |
| `DATABASE_URL` | `postgresql://inventory:<password>@localhost:5432/inventory` | How *your laptop* (dev server, Prisma CLI) reaches the database. The containers build their own URL from the `POSTGRES_*` values. |
| `TEST_DATABASE_URL` | `…/inventory_test` | The throwaway database for `npm test` (name must end in `_test`). |

The user and password are only applied when the data folder is **first created**. Changing
`POSTGRES_PASSWORD` later requires changing it inside PostgreSQL too:

```bash
podman exec -it inventory-management-system_db_1 psql -U inventory -d inventory \
  -c "ALTER USER inventory PASSWORD 'new-password';"
# then update POSTGRES_PASSWORD, DATABASE_URL and TEST_DATABASE_URL in .env, and:
podman compose up -d
```

### Email (SMTP)

| Variable | Development (Mailpit) | Production example (Brevo) | What it does |
| --- | --- | --- | --- |
| `SMTP_HOST` | `localhost` | `smtp-relay.brevo.com` | Mail server address |
| `SMTP_PORT` | `1025` | `587` | `587` = STARTTLS, `465` = TLS from the start |
| `SMTP_SECURE` | `false` | `false` for 587, `true` for 465 | Use TLS immediately |
| `SMTP_USER` | *(empty)* | your SMTP login | |
| `SMTP_PASSWORD` | *(empty)* | your SMTP key | |
| `MAIL_FROM` | `"Inventory <no-reply@inventory.local>"` | `"Inventory <no-reply@example.com>"` | Sender shown to recipients. Must be an address your provider allows (a verified domain). |
| `CONTAINER_SMTP_HOST` | `mailpit` (only when testing the containers locally) | *(empty)* | The SMTP host as seen *from the app container*, if different. Inside a container, `localhost` means the container itself. |

### Google sign-in (optional)

| Variable | What it does |
| --- | --- |
| `GOOGLE_CLIENT_ID` | From Google Cloud console → Credentials → OAuth client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | Same place |

Both empty = no Google button. Setup steps are in [chapter 10](10-operations.md#turn-on-google-sign-in).

## Changing a setting

| Where it runs | How to apply a change to `.env` |
| --- | --- |
| Development (`npm run dev`) | Stop the dev server (Ctrl+C) and start it again. |
| Production containers | `podman compose up -d` (or with `--profile https`). Podman notices the changed settings and recreates only the affected containers. No rebuild needed. |

The app checks its settings when it starts. If something required is missing or malformed (for
example an `ENCRYPTION_KEY` that isn't 32 bytes), it stops with a clear message such as
`Invalid environment variables: ENCRYPTION_KEY …`. Look at `podman compose logs app`.

## Secrets to keep safe

| Secret | If lost | If leaked |
| --- | --- | --- |
| `ENCRYPTION_KEY` | Every enrolled authenticator stops working; users must use recovery codes, or an admin turns 2FA off ([chapter 6](06-database-and-prisma.md#admin-recipes-for-support-situations)) | Together with a database copy, 2FA secrets could be decrypted. Plan a 2FA re-enrolment. |
| `POSTGRES_PASSWORD` | Reset it inside PostgreSQL (above) | Only reachable from the machine itself, but change it anyway |
| `SMTP_PASSWORD` | Create a new key at your provider | Revoke it at your provider |
| `GOOGLE_CLIENT_SECRET` | Create a new one in Google Cloud | Reset it in Google Cloud |

Keep a copy of `.env` in a password manager or another safe place, **separate** from the database backups.
