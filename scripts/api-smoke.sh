#!/usr/bin/env bash
# End-to-end check of the MarbleTime API, the way the TV and the parent app use it: pair a TV, claim a job on
# the TV, approve it as the parent, and see the new balance on the TV. Cleans up the kid and TV it made.
# Usage: scripts/api-smoke.sh                                  (dev server: cd backend && npm run dev)
#        API=https://<id>.execute-api.us-east-1.amazonaws.com PARENT_TOKEN=<Cognito token> scripts/api-smoke.sh
# Without PARENT_TOKEN it signs in as a new dev parent ("Bearer dev-smoke-…"), which only the dev server accepts.
# JSON goes through jq if it's installed, else python3.
set -euo pipefail

API="${API:-http://localhost:8787}"
PARENT="Bearer ${PARENT_TOKEN:-dev-smoke-$RANDOM$RANDOM}"

ok() { echo "✓ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }

# jget <json> <path>: a value by a simple path (.a.b[0].c); empty when missing.
jget() {
  if command -v jq >/dev/null; then
    jq -r "$2 // empty" <<<"$1"
  else
    python3 -c '
import json, re, sys
data = json.load(sys.stdin)
for name, index in re.findall(r"\.([A-Za-z_]\w*)|\[(\d+)\]", sys.argv[1]):
    try:
        data = data[name] if name else data[int(index)]
    except (KeyError, IndexError, TypeError):
        data = None
        break
if data is not None:
    print(data if isinstance(data, str) else json.dumps(data))' "$2" <<<"$1"
  fi
}

# jfind <json> <array path> <id> <field>: a field of the array item with that id.
jfind() {
  if command -v jq >/dev/null; then
    jq -r --arg id "$3" "$2[] | select(.id == \$id) | .$4 // empty" <<<"$1"
  else
    python3 -c '
import json, sys
items = json.load(sys.stdin)
for name in sys.argv[1].strip(".").split("."):
    items = items[name]
found = [item.get(sys.argv[3]) for item in items if item.get("id") == sys.argv[2]]
if found and found[0] is not None:
    print(found[0] if isinstance(found[0], str) else json.dumps(found[0]))' "$2" "$3" "$4" <<<"$1"
  fi
}

# call <method> <path> [json body] [authorization]: sets STATUS and BODY.
call() {
  local args=(-sS -X "$1" -w $'\n%{http_code}' -H 'content-type: application/json')
  [ -n "${4:-}" ] && args+=(-H "authorization: $4")
  [ -n "${3:-}" ] && args+=(--data "$3")
  local out
  out=$(curl "${args[@]}" "$API$2") || fail "no answer from $API (is the dev server running? cd backend && npm run dev)"
  STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}
expect() { [ "$STATUS" = "$1" ] || fail "$2: expected HTTP $1, got $STATUS $BODY"; }

uuid() {
  if command -v uuidgen >/dev/null; then uuidgen | tr 'A-Z' 'a-z'; else python3 -c 'import uuid; print(uuid.uuid4())'; fi
}

echo "API smoke test against $API"

# The parent: onboarding if needed, then a kid and a job.
call GET /me "" "$PARENT"; expect 200 "GET /me"
if [ -z "$(jget "$BODY" .family.id)" ]; then
  call POST /family '{"name":"Smoke test family","lang":"en","timezone":"Europe/Tallinn","pin":"1234"}' "$PARENT"
  expect 201 "create the family"
fi
call POST /children '{"name":"Smoke","avatar":"bear","color":"mint","age":6}' "$PARENT"; expect 201 "add a kid"
child=$(jget "$BODY" .id)
call POST /chores "{\"title\":\"Feed the cat\",\"minutes\":10,\"childIds\":[\"$child\"]}" "$PARENT"; expect 201 "add a job"
chore=$(jget "$BODY" .id)
[ "$(jget "$BODY" .icon)" = cat ] || fail "the server should pick the cat icon, got $(jget "$BODY" .icon)"
ok "parent: family, kid and job (icon picked: cat)"

# The TV asks for a code; the parent confirms it; the TV gets its token once.
call POST /pairings '{"platform":"fireos"}'; expect 201 "the TV asks for a pairing code"
code=$(jget "$BODY" .code)
call GET "/pairings/$code"; expect 200 "the TV polls"
[ "$(jget "$BODY" .status)" = waiting ] || fail "expected waiting, got $BODY"
call POST "/pairings/$code/confirm" '{"name":"Smoke TV"}' "$PARENT"; expect 201 "the parent confirms the code"
device=$(jget "$BODY" .id)
call GET "/pairings/$code"; expect 200 "the TV polls again"
token=$(jget "$BODY" .deviceToken)
[ -n "$token" ] || fail "no device token: $BODY"
call GET "/pairings/$code"
[ -z "$(jget "$BODY" .deviceToken)" ] || fail "the device token was handed out twice"
TV="Device $token"
ok "TV paired with code $code; token handed out once"

call GET /device/state "" "$TV"; expect 200 "the TV's state"
[ "$(jget "$BODY" .device.name)" = "Smoke TV" ] || fail "the TV should see its own name: $(jget "$BODY" .device)"
[ "$(jfind "$BODY" .children "$child" balanceSec)" = 0 ] || fail "the new kid should start at 0"
[ "$(jfind "$BODY" .children "$child" dailyBaseMin)" = 30 ] || fail "the new kid should get the default daily base (30 min)"
case "$(jget "$BODY" .gameSets)" in "["*) ;; *) fail "the TV state has no gameSets list" ;; esac
case "$(jget "$BODY" .realtimeUrl)" in ws://*|wss://*) ;; *) fail "the TV state has no realtimeUrl" ;; esac
call GET /push/key; expect 200 "the Web Push key"
[ -n "$(jget "$BODY" .publicKey)" ] || fail "no Web Push public key"

# The kid says "I did it!" on the TV (the outbox may send it twice).
claim=$(uuid)
claim_body="{\"id\":\"$claim\",\"childId\":\"$child\",\"choreId\":\"$chore\",\"at\":$(($(date +%s) * 1000))}"
call POST /device/claims "$claim_body" "$TV"; expect 201 "claim on the TV"
call POST /device/claims "$claim_body" "$TV"; expect 200 "the same claim again"
ok "TV: claim sent (a resend changes nothing)"

# The parent sees it waiting and says yes.
call GET "/claims?status=waiting" "" "$PARENT"; expect 200 "the approvals inbox"
[ "$(jfind "$BODY" .claims "$claim" status)" = waiting ] || fail "the claim is not in the inbox: $BODY"
call POST "/claims/$claim/approve" "" "$PARENT"; expect 200 "approve"
[ "$(jget "$BODY" .status)" = approved ] || fail "expected approved, got $BODY"
ok "parent: approved"

# The TV's next poll shows the new balance.
call GET /device/state "" "$TV"; expect 200 "the TV's state after approval"
balance=$(jfind "$BODY" .children "$child" balanceSec)
[ "$balance" = 600 ] || fail "expected 600 s on the TV, got $balance"
[ "$(jfind "$BODY" .claims "$claim" status)" = approved ] || fail "the TV doesn't see the approval"
ok "TV: balance 600 s (10 min = 2 marbles)"

# The parent takes 5 minutes away, with a reason; the TV can say why the jar changed.
call POST "/children/$child/adjust" '{"deltaMin":-5,"reason":"Smoke test"}' "$PARENT"; expect 200 "take 5 minutes away"
call GET /device/state "" "$TV"; expect 200 "the TV's state after the minus"
[ "$(jfind "$BODY" .children "$child" balanceSec)" = 300 ] || fail "expected 300 s after the minus"
[ "$(jget "$BODY" .adjustments[0].childId)" = "$child" ] && [ "$(jget "$BODY" .adjustments[0].deltaMin)" = -5 ] ||
  fail "the TV doesn't see the minus: $(jget "$BODY" .adjustments)"
ok "parent: 5 min taken away; the TV sees it with its reason"

# Brain-game sets may land in the background between the two requests, so give it a few tries.
for _ in 1 2 3; do
  etag=$(curl -sS -o /dev/null -D - -H "authorization: $TV" "$API/device/state" | tr -d '\r' | awk -F': ' 'tolower($1) == "etag" {print $2}')
  status=$(curl -sS -o /dev/null -w '%{http_code}' -H "authorization: $TV" -H "if-none-match: $etag" "$API/device/state")
  [ "$status" = 304 ] && break
done
[ "$status" = 304 ] || fail "an unchanged state should answer If-None-Match with 304"
ok "TV: unchanged state → 304"

# Clean up: the kid (and the job only they had) and the TV.
call DELETE "/children/$child" "" "$PARENT"; expect 204 "remove the kid"
call DELETE "/devices/$device" "" "$PARENT"; expect 204 "remove the TV"
# The token index is eventually consistent on AWS, so allow it a moment.
for _ in 1 2 3 4 5 6; do
  call GET /device/state "" "$TV"
  [ "$STATUS" = 401 ] && break
  sleep 0.5
done
expect 401 "a removed TV's token"
ok "cleaned up (the removed TV's token no longer works)"
echo "All good."
