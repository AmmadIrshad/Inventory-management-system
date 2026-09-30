#!/bin/sh
# Creates .env from .env.example with freshly generated secrets.
# Never overwrites an existing .env (the encryption key must not change once in use).
set -eu
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo ".env already exists; leaving it untouched." >&2
  exit 0
fi

encryption_key=$(head -c 32 /dev/urandom | base64 | tr -d '\n')
db_password=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')

sed -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${encryption_key}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_password}|" \
    -e "s|CHANGE_ME|${db_password}|g" \
    .env.example > .env
chmod 600 .env

cat <<'EOF'
Created .env with a new database password and encryption key.
Before starting production, edit .env and set at least:
  APP_URL            the address users open (https://your-domain for production)
  SMTP_*, MAIL_FROM  your email provider
  POSTGRES_DATA_DIR  where the database files should live on this machine
Optional: DOMAIN (automatic HTTPS), GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
Keep a copy of ENCRYPTION_KEY somewhere safe: without it, 2FA secrets can't be read.
EOF
