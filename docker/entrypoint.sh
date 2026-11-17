#!/usr/bin/env bash
# Boot order: firewall (root) -> drop to sancho -> config setup -> headless Claude.
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  /opt/sancho/firewall.sh
  # Owners may change access from Discord. The list is root-owned so the agent cannot edit it.
  mkdir -p /etc/sancho
  printf '%s\n' "${DISCORD_OWNER_ID:-}" | tr ',' '\n' > /etc/sancho/owners
  exec setpriv --reuid=sancho --regid=sancho --init-groups "$0"
fi

export HOME=/home/sancho

# Empty values in .env.local must not shadow saved logins or tokens.
for v in DISCORD_BOT_TOKEN ANTHROPIC_API_KEY ANTHROPIC_MODEL DISCORD_OWNER_ID DISCORD_CHANNEL_ID GH_TOKEN; do
  [ -n "${!v:-}" ] || unset "$v"
done

/opt/sancho/setup.sh

# Tell Discord when the API refuses a request, since the model cannot say so itself.
(while true; do bun /opt/sancho/watchdog.ts; sleep 5; done) &

# Run Claude headless under the supervisor. When it exits, the container exits and
# `restart: always` brings it back.
exec bun /opt/sancho/sancho.ts
