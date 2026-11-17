# Onboarding

From nothing to Sancho answering in a channel. About ten minutes.

## 1. Claude access

Pick one.

**API key.** Create a key at [platform.claude.com](https://platform.claude.com) and put it in `ANTHROPIC_API_KEY`. Usage is billed to that Console organization.

**Included plan credits.** Max, Ultra and Team plans include monthly API credits: $100 on Max, $200 on Ultra, and $20 or $100 per Team seat, pooled and capped at $500. They do not roll over. Pro is not eligible. To claim them:

1. On claude.ai, open **Settings > Billing** (Team: **Organization settings > Billing**).
2. Under **API credits**, link a Console organization.
3. Create an API key in that organization and use it as above.

> Check before relying on this. Anthropic's [credits page](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) lists the Agent SDK as covered and Claude Code as not covered, and Sancho is a Claude Code session. Watch which balance drains on the Console [Billing](https://platform.claude.com/settings/billing) page after a few messages.

**Plan login.** Leave `ANTHROPIC_API_KEY` empty, start the container, attach (see step 6) and run `/login` once. Usage then counts against your plan's normal limits.

## 2. Discord bot

In the [Developer Portal](https://discord.com/developers/applications):

1. **New Application**, name it.
2. **Bot** tab: **Reset Token**, copy it into `DISCORD_BOT_TOKEN`.
3. Same tab: turn on **Message Content Intent**.
4. **OAuth2 > URL Generator**: scope `bot`, with these permissions:
   - View Channels
   - Send Messages
   - Send Messages in Threads
   - Read Message History
   - Attach Files
   - Add Reactions
5. Open the generated URL and add the bot to your server. Keep the URL; it is your invite link.

## 3. Start

Put your secrets in `.env.local` in the project root:

```ini
DISCORD_BOT_TOKEN=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
```

```bash
docker compose up -d --build
```

## 4. Allow a channel

Being in a server is not enough. Sancho ignores every channel until it is allowlisted.

Get the channel ID: it is the last number in the channel's URL, or right-click the channel and **Copy Channel ID** (needs Developer Mode, under Settings > Advanced).

Attach to the session and run:

```
/discord:access group add <channelId>
```

He now answers @mentions and replies to his own messages there. Add `--no-mention` to answer every message, or `--allow id1,id2` to limit who can trigger him.

## 5. A friend's server

1. In the Developer Portal, keep **Public Bot** on. With it off, only you can invite the bot.
2. Send your friend the invite link from step 2. They need **Manage Server** in their server to accept it.
3. They send you the links of the channels he should join.
4. You allowlist each one as in step 4.

Your friend cannot switch him on by themselves; the allowlist on your machine is the gate. Everyone in an allowed channel can make him run things in the container on your bill, so add only channels you trust.

## 6. Everyday

```bash
# Attach to the live session (detach: Ctrl-b d)
docker compose exec -u sancho sancho tmux attach -t sancho

docker compose restart          # after editing data/CLAUDE.md
docker compose up -d --build    # after editing AGENTS.md or the image
docker compose logs -f
```

**Direct messages** are in pairing mode: a stranger who DMs him gets a code and nothing else. To let someone in, run `/discord:access pair <code>` in the session. To allow only listed people, run `/discord:access policy allowlist`.

**Persona and memory** live in `data/`: edit `data/CLAUDE.md` to change how he behaves; he keeps notes in `data/memory/` and articles in `data/articles/`.
