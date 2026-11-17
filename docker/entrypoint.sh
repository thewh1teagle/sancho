#!/usr/bin/env bash
# Boot order: firewall (root) -> drop to sancho -> config setup -> Claude in tmux.
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  /opt/sancho/firewall.sh
  exec setpriv --reuid=sancho --regid=sancho --init-groups "$0"
fi

export HOME=/home/sancho

# Empty values in .env.local must not shadow saved logins or tokens.
for v in DISCORD_BOT_TOKEN ANTHROPIC_API_KEY ANTHROPIC_MODEL DISCORD_OWNER_ID DISCORD_CHANNEL_ID; do
  [ -n "${!v:-}" ] || unset "$v"
done

/opt/sancho/setup.sh

# Claude needs a terminal; tmux provides one. Attach with:
#   docker compose exec -u sancho sancho tmux attach -t sancho   (detach: Ctrl-b d)
tmux new-session -d -s sancho -x 200 -y 50 -c /data \
  "claude --channels plugin:discord@claude-plugins-official --dangerously-skip-permissions"

# When the session ends the container exits and `restart: always` brings it back.
while tmux has-session -t sancho 2>/dev/null; do sleep 5; done
