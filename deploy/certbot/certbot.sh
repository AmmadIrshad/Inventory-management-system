#!/bin/sh
# certbot container. Obtains the Let's Encrypt certificate for $DOMAIN once, then checks twice a
# day and renews it when fewer than 30 days remain. nginx picks up new files by itself.
set -u

: "${DOMAIN:?DOMAIN must be set}"
LIVE="/etc/letsencrypt/live/${DOMAIN}"
WEBROOT=/var/www/certbot

trap 'exit 0' TERM INT
pause() { sleep "$1" & wait $!; }

if [ "$DOMAIN" = "localhost" ]; then
  # Let's Encrypt never issues certificates for localhost: use a self-signed one for local tests.
  if [ ! -s "$LIVE/fullchain.pem" ]; then
    python3 /etc/ims-certbot/self_signed.py "$LIVE"
    echo "[certbot] created a self-signed certificate for localhost (browsers will show a warning)"
  fi
  while :; do pause 86400; done
fi

if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
  account="--email ${LETSENCRYPT_EMAIL}"
else
  account="--register-unsafely-without-email"
fi
staging=""
if [ "${LETSENCRYPT_STAGING:-false}" = "true" ]; then staging="--staging"; fi

# nginx starts in http-only mode; wait until it serves the challenge folder.
mkdir -p "$WEBROOT/.well-known/acme-challenge"
echo ok > "$WEBROOT/.well-known/acme-challenge/ims-ping"
until python3 -c "import urllib.request as u; u.urlopen('http://nginx/.well-known/acme-challenge/ims-ping', timeout=5)" 2>/dev/null; do
  echo "[certbot] waiting for nginx..."
  pause 5
done

until [ -s "$LIVE/fullchain.pem" ]; do
  # $account and $staging are intentionally unquoted: they hold zero, one or two words.
  if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" $account \
      --agree-tos --non-interactive --keep-until-expiring $staging; then
    break
  fi
  echo "[certbot] no certificate yet. Check that DNS for ${DOMAIN} points at this server and ports 80/443 are open. Retrying in 15 minutes."
  pause 900
done
echo "[certbot] certificate in place for ${DOMAIN}"

while :; do
  pause 43200
  certbot renew --webroot -w "$WEBROOT" --quiet || echo "[certbot] renewal failed; retrying in 12 hours"
done
