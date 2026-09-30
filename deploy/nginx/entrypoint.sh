#!/bin/sh
# nginx container entrypoint. Picks the config that matches the certificate state, then reloads
# nginx when the certbot container creates the first certificate and every 6 hours (renewals).
set -eu

: "${DOMAIN:?DOMAIN must be set}"
case "$DOMAIN" in
  *[!A-Za-z0-9.-]*) echo "[nginx] invalid DOMAIN: $DOMAIN" >&2; exit 1 ;;
esac

TEMPLATES=/etc/nginx/ims
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

current_mode() {
  if [ -s "$CERT" ] && [ -s "$KEY" ]; then echo https; else echo http-only; fi
}

render() {
  sed "s/__DOMAIN__/${DOMAIN}/g" "${TEMPLATES}/$1.conf.template" > /etc/nginx/conf.d/default.conf
}

mode=$(current_mode)
render "$mode"
echo "[nginx] serving ${DOMAIN} in ${mode} mode"

(
  seconds=0
  while sleep 30; do
    seconds=$((seconds + 30))
    new_mode=$(current_mode)
    if [ "$new_mode" != "$mode" ] || [ "$seconds" -ge 21600 ]; then
      render "$new_mode"
      if nginx -t -q; then
        nginx -s reload
        echo "[nginx] reloaded (${new_mode} mode)"
      fi
      mode=$new_mode
      seconds=0
    fi
  done
) &

exec nginx -g 'daemon off;'
