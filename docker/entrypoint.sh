#!/usr/bin/env bash
# Boot order: firewall and owner list (root) -> drop to sancho -> setup -> headless Claude.
# This is the only shell script: the privileged step should depend on as little as possible.
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  # Cut the container off from private networks (LAN, Docker host). Internet stays open.
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
    iptables -A OUTPUT -d "$net" -j REJECT
  done
  for net in fc00::/7 fe80::/10; do
    ip6tables -A OUTPUT -d "$net" -j REJECT 2>/dev/null || true
  done

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

bun /opt/sancho/setup.ts

# Tell Discord when the API refuses a request, since the model cannot say so itself.
(while true; do bun /opt/sancho/watchdog.ts; sleep 5; done) &

# Run Claude headless under the supervisor. When it exits, the container exits and
# `restart: always` brings it back.
exec bun /opt/sancho/sancho.ts
