#!/usr/bin/env bash
# The whole stack on this Mac for a phone and the TV on the same Wi-Fi: the backend's dev server and the parent
# app over https, because a phone's browser gives notifications (Web Push) only to https pages.
# Usage: scripts/dev.sh [--seed]      Stop with Ctrl-C.
# Your family's data is kept in .data/dev.bin between runs. --seed is the demo family instead (Mia and Leo,
# sign in as "demo"), in memory only.
# The certificate comes from mkcert (brew install mkcert). Once per phone, install mkcert's root certificate
# ("$(mkcert -CAROOT)/rootCA.pem") as a CA certificate; never share rootCA-key.pem.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/.env.local"
# shellcheck disable=SC1090
[ -f "$ENV" ] && source "$ENV"

# Web Push needs a key pair that stays the same between runs (a phone's subscription is tied to it).
if [ -z "${VAPID_PUBLIC_KEY:-}" ]; then
  keys="$(cd "$ROOT/backend" && npx web-push generate-vapid-keys --json)"
  VAPID_PUBLIC_KEY="$(node -pe 'JSON.parse(process.argv[1]).publicKey' "$keys")"
  VAPID_PRIVATE_KEY="$(node -pe 'JSON.parse(process.argv[1]).privateKey' "$keys")"
  printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n' "$VAPID_PUBLIC_KEY" "$VAPID_PRIVATE_KEY" >> "$ENV"
  echo "New Web Push keys saved in .env.local"
fi

# The Mac's address on the network it reaches the internet through (Wi-Fi or a cable, whichever is in use),
# and a certificate for it (made again when the address changes).
lan="$(ipconfig getifaddr "$(route -n get default | awk '/interface:/{print $2}')")"
certs="$ROOT/parent-web/.cert"
mkdir -p "$certs"
[ -f "$certs/$lan.pem" ] || mkcert -cert-file "$certs/$lan.pem" -key-file "$certs/$lan-key.pem" "$lan" localhost
url="https://$lan:5173"

# The demo family never mixes with the real data: with --seed nothing is read from or written to the file.
# DATA_FILE=<file> keeps the data in another file instead (e.g. a family made up for filming).
[[ " $* " == *" --seed "* ]] || export DATA_FILE="${DATA_FILE:-$ROOT/.data/dev.bin}"

trap 'kill $(jobs -p) 2>/dev/null' EXIT
(cd "$ROOT/backend" && DEV_CA_FILE="$(mkcert -CAROOT)/rootCA.pem" PWA_URL="$url" VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" npm run dev -- "$@") &
(cd "$ROOT/parent-web" && VITE_API_URL="$url/api" VITE_REALTIME_URL="wss://$lan:5173/realtime" DEV_HTTPS_CERT="$certs/$lan.pem" DEV_HTTPS_KEY="$certs/$lan-key.pem" npm run dev -- --host) &

sleep 3
echo
echo "Parent app (phone): $url"
echo "Certificate (once per phone, then notifications work): http://$lan:8787/dev/ca.crt"
echo "TV:                 scripts/fire.sh open api=http://$lan:8787"
wait
