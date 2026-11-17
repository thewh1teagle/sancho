#!/usr/bin/env bash
# Add a Discord channel to Sancho's allowlist. Takes effect on the next message, no restart.
#   docker compose exec -u sancho sancho allow-channel <channelId> [--no-mention]
set -euo pipefail

id="${1:?usage: allow-channel <channelId> [--no-mention]}"
[[ "$id" =~ ^[0-9]{17,20}$ ]] || { echo "not a channel ID: $id" >&2; exit 1; }
mention=true
[ "${2:-}" = "--no-mention" ] && mention=false

ACCESS="$CLAUDE_CONFIG_DIR/channels/discord/access.json"
mkdir -p "$(dirname "$ACCESS")"
[ -s "$ACCESS" ] || echo '{"dmPolicy":"pairing","allowFrom":[],"groups":{}}' > "$ACCESS"

jq --arg id "$id" --argjson mention "$mention" \
  '.groups[$id] = {requireMention: $mention, allowFrom: (.groups[$id].allowFrom // [])}' \
  "$ACCESS" > "$ACCESS.tmp"
mv "$ACCESS.tmp" "$ACCESS"

echo "Allowed channel $id (mention required: $mention). Channels now allowed:"
jq -r '.groups | keys[]' "$ACCESS"
