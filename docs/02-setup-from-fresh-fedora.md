# 2. Setup from a fresh Fedora install

This chapter has three parts:

- **A.** What the laptop looked like on day one.
- **B.** Every step that was taken to build phase one, in order, and why.
- **C.** A clean **recipe** to set up another fresh machine, either for development or for production.

## A. Starting point

| Item | Value |
| --- | --- |
| Operating system | Fedora Linux 44, KDE Plasma Desktop Edition |
| Already installed | `git` 2.55, `podman` 5.8.7, `curl`, `openssl`, `dnf` (the package installer) |
| Missing | Node.js, npm, PostgreSQL, a compose tool |
| Hardware | 8 CPU cores, 7.6 GB RAM, 929 GB disk (`/home`) |

The check that was run:

```bash
cat /etc/os-release                       # which Fedora version?
command -v node npm git podman psql       # which tools exist? (prints nothing for missing ones)
```

## B. What was done, step by step

### Step 1: Install system packages

```bash
sudo dnf install -y nodejs24 nodejs24-npm podman-compose
```

| Package | Why |
| --- | --- |
| `nodejs24` (24.18) | Node.js runs JavaScript on a computer (not just in a browser). Next.js needs it. Version 24 is the current long-term-support (LTS) release. |
| `nodejs24-npm` (npm 11.16) | npm downloads and manages the JavaScript libraries the app uses. |
| `podman-compose` (1.6) | Reads `compose.yaml` and starts several containers together (`podman compose …`). |

PostgreSQL was **not** installed on the laptop itself. It runs inside a container instead, so the
laptop stays clean and development matches production exactly.

### Step 2: Create the project folder and Git repository

```bash
mkdir -p ~/Projects/inventory-management-system
cd ~/Projects/inventory-management-system
git init -b main          # start version tracking, main branch called "main"
```

### Step 3: Create the Next.js app skeleton

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --disable-git --yes
```

This generated a starter website: TypeScript (JavaScript with type checking), Tailwind (styling),
ESLint (code-quality checker), the "App Router" (folder-based pages) and a `src/` folder. It also
created `AGENTS.md`, notes that tell AI coding assistants to read the Next.js 16 docs bundled in
`node_modules/next/dist/docs/`.

### Step 4: Install the libraries

```bash
# used by the running app
npm install @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg zod @node-rs/argon2 otpauth \
  qrcode nodemailer @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en \
  server-only openid-client

# only needed while developing/testing
npm install -D prisma@7.10.0 @types/node@24 @types/pg @types/qrcode @types/nodemailer \
  vitest dotenv @playwright/test
```

[Chapter 3](03-technologies.md) explains every library. Three decisions were made here:

- **Prisma was pinned to 7.10.0.** npm's "latest" label pointed at a *release candidate* of Prisma 8
  (not yet stable), so the stable 7.10.0 was chosen, with all three Prisma packages on the same
  version.
- **Security audit fixed.** `npm audit` reported 4 issues inside Prisma's command-line tool (in
  `deepmerge-ts` and `mysql2`). Instead of downgrading Prisma, `package.json` got an `overrides`
  section that forces the patched versions. Result: **0 vulnerabilities**.
- **Install scripts approved.** npm 11 blocks packages from running setup scripts unless approved.
  Prisma needs one to download its migration engine:

  ```bash
  npm approve-scripts prisma @prisma/engines unrs-resolver
  ```

  The approvals are saved in `package.json` under `allowScripts`.

Two libraries were rejected along the way: `@oslojs/otp` and `arctic` (both depend on packages now
marked "no longer supported"). `otpauth` and `openid-client` are used instead.

### Step 5: Set up Prisma

```bash
npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
```

This created `prisma/schema.prisma` (the description of the database tables) and
`prisma7.config.ts` (tells Prisma where things are; Prisma 7.10 looks for this exact file name).

### Step 6: Create the secrets file (`.env`)

Random secrets were generated with `openssl` and written to `.env`: the database password and a
32-byte `ENCRYPTION_KEY`. Today the same thing is one command:

```bash
./scripts/init-env.sh
```

### Step 7: Start the development containers

```bash
npm run services:up      # = podman compose --profile dev up -d db mailpit
```

This downloaded the `postgres:18-alpine` and `mailpit` images and started two containers: the
database and a fake inbox that catches every email the app sends (http://localhost:8025).

### Step 8: Create the database tables

```bash
npx prisma migrate dev --name init          # day 1: users, sessions, recovery codes, reset tokens
npx prisma generate                          # build the typed database client in src/generated/prisma
# day 2 (email verification, Google, rate limits):
npx prisma migrate dev --create-only --name email_verification_google_rate_limits
#   → one line was added by hand so existing accounts count as verified, then:
npx prisma migrate dev
```

### Step 9: Write the application

All code in `src/` was written: pages, forms, sign-in logic, 2FA, emails, Google sign-in. Chapters
[4](04-user-flows.md), [5](05-backend-logic.md) and [6](06-database-and-prisma.md) explain it.

### Step 10: Test everything

```bash
npm run lint                                   # code-quality rules
npm run typecheck                              # TypeScript finds type mistakes
npm test                                       # 48 automated checks against a test database
npm run build                                  # production build must succeed
npx playwright install chromium --only-shell   # download a headless browser (once)
npm run test:e2e                               # robot browser clicks through every flow
```

### Step 11: Build and run the production containers

```bash
podman compose up -d --build                   # builds 2 images, migrates, starts the app
podman compose --profile https up -d           # Nginx + Certbot in front with HTTPS
```

HTTPS was first built with Caddy, then switched to **Nginx + Certbot** on request (day 2), because
Nginx is the more widely known web server.

### Step 12: Move the database into a chosen folder

On day 2 the database files were moved from a hidden Podman volume into `./data/postgres` (setting:
`POSTGRES_DATA_DIR`). The existing accounts were kept safe with the backup scripts:

```bash
./scripts/backup-db.sh backups/before-data-dir-move.dump   # save everything
# (containers recreated with the new storage folder)
./scripts/restore-db.sh backups/before-data-dir-move.dump --yes   # put everything back
```

## C. Recipe: set up a fresh machine

### C1. Development machine (to change the code)

```bash
# 1. Tools
sudo dnf install -y git nodejs24 nodejs24-npm podman podman-compose

# 2. Get the code
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/AmmadIrshad/Inventory-management-system.git inventory-management-system
cd inventory-management-system

# 3. Libraries (also builds the Prisma client automatically)
npm install

# 4. Settings with fresh secrets (defaults already point at the dev containers)
./scripts/init-env.sh

# 5. Database + test inbox
npm run services:up

# 6. Tables
npm run db:migrate

# 7. Run it
npm run dev
```

Open http://localhost:3000 for the app and http://localhost:8025 for the emails it sends.

### C2. Production server (to run it for real)

Node.js is **not** needed: everything is built inside containers.

```bash
# 1. Tools (Fedora/RHEL; on Debian/Ubuntu: sudo apt install -y git podman podman-compose)
sudo dnf install -y git podman podman-compose

# 2. Get the code (or copy the project folder over)
git clone https://github.com/AmmadIrshad/Inventory-management-system.git inventory-management-system
cd inventory-management-system

# 3. Settings
./scripts/init-env.sh
nano .env        # set APP_URL, SMTP_*, MAIL_FROM, POSTGRES_DATA_DIR, DOMAIN (see chapter 9)

# 4. Allow ports 80/443 for rootless Podman, and open the firewall (only for HTTPS with a domain)
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/50-unprivileged-ports.conf
sudo sysctl --system
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload

# 5. Start: with HTTPS for your domain…
podman compose --profile https up -d --build
#    …or without a domain (plain HTTP on port 3000; set APP_BIND=0.0.0.0 to reach it from the network)
podman compose up -d --build

# 6. Start again automatically after reboots
sudo loginctl enable-linger "$USER"
systemctl --user enable --now podman-restart.service
```

The first build takes about 5–10 minutes (it downloads and compiles everything). Later builds reuse
cached layers and are faster.

## D. What got installed where

| Location | Contents | Size (approx.) |
| --- | --- | --- |
| `/usr/bin/node`, `/usr/bin/npm` | Node.js and npm (from `dnf`) | — |
| `~/Projects/inventory-management-system/` | The project | — |
| `…/node_modules/` | Downloaded libraries (recreated by `npm install`, never edited by hand) | 840 MB |
| `…/.next/` | Build output of Next.js (recreated by `npm run dev`/`build`) | 570 MB |
| `…/src/generated/prisma/` | Generated database client (recreated by `npm run db:generate`) | small |
| `…/data/postgres/` | The database files (`POSTGRES_DATA_DIR`) | grows with data |
| `…/backups/` | Database backups made by `backup-db.sh` | small |
| `~/.local/share/containers/storage/` | Podman's images, container layers and named volumes | ~2.3 GB |
| `~/.cache/ms-playwright/` | The headless Chromium used by browser tests | ~200 MB |
| `~/.npm/` | npm's download cache | varies |

`node_modules/`, `.next/`, `src/generated/`, `data/`, `backups/` and `.env` are listed in
`.gitignore`, so they are **never** uploaded to GitHub.

## E. Is it working? Checklist

```bash
cd ~/Projects/inventory-management-system
podman compose ps                        # containers listed as "Up" / "healthy"
curl http://localhost:3000/api/health    # → {"status":"ok"}
```

Then, in the browser: sign up at http://localhost:3000/signup, open the verification email at
http://localhost:8025, click the link, and sign in.
