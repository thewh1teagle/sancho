#!/usr/bin/env bash
# Prepare Claude Code's config so the session starts with no interactive prompts.
set -euo pipefail

CFG="$CLAUDE_CONFIG_DIR"
STATE="$CFG/.claude.json"
ACCESS="$CFG/channels/discord/access.json"

# Answer the onboarding, theme, trust and API-key prompts in advance (merged every boot).
[ -s "$STATE" ] || echo '{}' > "$STATE"
key="${ANTHROPIC_API_KEY:-}"
jq --arg tail "${key: -20}" '
  .hasCompletedOnboarding = true
  | .theme //= "dark"
  | .projects["/data"].hasTrustDialogAccepted = true
  | if $tail != "" then .customApiKeyResponses = {approved: [$tail], rejected: []} else . end
' "$STATE" > "$STATE.tmp"
mv "$STATE.tmp" "$STATE"
chmod 600 "$STATE"

[ -f "$CFG/settings.json" ] || echo '{"skipDangerousModePermissionPrompt": true}' > "$CFG/settings.json"

# First boot only: allow the owner (and optionally one channel), so no pairing step is needed.
if [ ! -f "$ACCESS" ] && [ -n "${DISCORD_OWNER_ID:-}" ]; then
  mkdir -p "$(dirname "$ACCESS")"
  jq -n --arg owner "$DISCORD_OWNER_ID" --arg chan "${DISCORD_CHANNEL_ID:-}" '{
    dmPolicy: "allowlist",
    allowFrom: ($owner | split(",")),
    groups: (if $chan != "" then {($chan): {requireMention: true, allowFrom: []}} else {} end)
  }' > "$ACCESS"
fi

if ! claude plugin list 2>/dev/null | grep -q 'discord@claude-plugins-official'; then
  claude plugin marketplace add anthropics/claude-plugins-official || true
  claude plugin install discord@claude-plugins-official --scope user
fi

# Install the plugin's dependencies now; doing it on first connect is slow enough to time out.
for dir in "$CFG"/plugins/cache/claude-plugins-official/discord/*/; do
  (cd "$dir" && bun install --no-summary) || true
done

# GitHub: if a token is set, commit as that account and let git push over HTTPS with it.
if [ -n "${GH_TOKEN:-}" ]; then
  if user=$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com \(.login)"' 2>/dev/null); then
    git config --global user.email "${user%% *}"
    git config --global user.name "${user##* }"
    gh auth setup-git
  else
    echo "[setup] GH_TOKEN is set but GitHub rejected it" >&2
  fi
fi

# First boot: start from the example persona. The owner edits it from then on.
[ -f /data/CLAUDE.md ] && [ ! -f /data/persona.md ] && mv /data/CLAUDE.md /data/persona.md  # older installs
[ -f /data/persona.md ] || cp /etc/claude-code/persona.example.md /data/persona.md

mkdir -p /data/articles /data/memory /data/projects
