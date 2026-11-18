# Onboarding

From nothing to Sancho answering in a channel. About ten minutes.

## 1. Claude access

Pick one.

**API key.** Create a key at [platform.claude.com](https://platform.claude.com) and put it in `ANTHROPIC_API_KEY`. Usage is billed to that Console organization.

**Included plan credits.** Max, Ultra and Team plans include monthly API credits: $100 on Max, $200 on Ultra, and $20 or $100 per Team seat, pooled and capped at $500. They do not roll over. Pro is not eligible. To claim them:

1. On claude.ai, open **Settings > Billing** (Team: **Organization settings > Billing**).
2. Under **API credits**, link a Console organization.
3. Create an API key in that organization and use it as above.

Sancho runs Claude Code headless, which Anthropic bills as Agent SDK usage, so these credits cover him. An interactive Claude Code session on the same key is not covered.

**Plan login.** Leave `ANTHROPIC_API_KEY` empty and log in once with `docker compose run --rm -it -u sancho --entrypoint claude sancho`, then `/login`, then exit and start Sancho. Usage then counts against your plan's normal limits.

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

## 4. Allowlist a channel

Inviting Sancho to a server does nothing by itself. He ignores every channel until you add it to his allowlist, and messages sent before that are dropped.

This is done on the host, not in Discord. Asking him in chat to allow a channel will not work: his rules forbid changing access on request, so that nobody can talk their way in.

1. Get the channel ID. It is the last number in the channel's URL:
   `discord.com/channels/<server>/<channelId>`
2. Run this on the machine hosting Sancho:

   ```bash
   docker compose exec -u sancho sancho allow-channel <channelId>
   ```

3. Mention `@Sancho` in that channel. No restart needed.

He answers @mentions and replies to his own messages. Add `--no-mention` to make him answer every message in the channel.

To allow every channel a server has right now, use its ID (the first number in any of its channel URLs):

```bash
docker compose exec -u sancho sancho allow-server <serverId>
```

Every text channel the bot can see there is allowed. Channels created later are not added; run the command again or add them one by one.

The allowlist is a JSON file, `access.json`, in his private config volume. To limit a channel to specific people or remove one, send the plugin's access command as the owner (step 6), for example `say "/discord:access group add <channelId> --allow id1,id2"`.

## 5. A friend's server

1. In the Developer Portal, keep **Public Bot** on. With it off, only you can invite the bot.
2. Send your friend the invite link from step 2. They need **Manage Server** in their server to accept it.
3. They send you the link of each channel he should answer in.
4. You allowlist each one as in step 4. Until you do, he stays silent there.

Your friend cannot switch him on by themselves; the allowlist on your machine is the gate. Everyone in an allowed channel can make him run things in the container on your bill, so add only channels you trust.

## 6. Everyday

```bash
docker compose logs -f          # one line per message, tool call and turn
docker compose restart          # after editing data/persona.md
docker compose up -d --build    # after editing agent/ or the image

# Talk to him as the owner, from the host. He answers in your terminal.
docker compose exec -u sancho sancho say "what did you save to memory today?"
```

`say` is how you give him instructions outside Discord, such as "read channel X" or "post a summary in channel Y".

**Direct messages** are in pairing mode: a stranger who DMs him gets a code and nothing else. To let someone in, run `say "/discord:access pair <code>"`. To allow only listed people, run `say "/discord:access policy allowlist"`.

**GitHub access** is optional. Create a separate GitHub account for him, generate a classic token there with the `repo`, `workflow` and `read:org` scopes, and add `GH_TOKEN=...` to `.env.local`. He then works on branches and opens pull requests: from a fork for repositories he cannot write to, or directly where you have added his account as a collaborator. He can also create repositories under his own account. Protect your default branches; his rules forbid pushing to them, but a rule is not a lock.

**Managing access from Discord.** Put your Discord user ID in `DISCORD_OWNER_ID` in `.env.local` (comma-separated for several owners). Owners can then tell him in plain words, in a DM or any channel he answers in, to "answer in #some-channel", "stop answering in #other", or "let @someone DM you". He runs an `access` command that reads the request back from Discord and acts only if an owner really sent it, so nobody else can talk him into it.

**Scheduled tasks.** Ask him to do something later ("in 20 minutes check X", "remind me Friday at 9") and he queues it, then does the work with his full tools when it comes due. One-off times only. For a clock time he asks your timezone once and remembers it. The queue is `data/schedule.json`.

**When the API refuses him** (no credits, rate limit, outage), a watchdog replies in the channel with the reason, so people are not left waiting.

**Persona and memory** live in `data/`: edit `data/persona.md` to change how he behaves; he keeps notes in `data/memory/` and articles in `data/articles/`.
