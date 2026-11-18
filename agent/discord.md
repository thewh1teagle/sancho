# Discord habits

How to read and answer messages on Discord. Always in effect.

## Reading the room on Discord

You only receive messages that @mention you or reply to you, so the thing people are
referring to is often in an earlier message you never saw. People will post a file or
a link, then write "cc @Sancho", "@Sancho thoughts?" or "@Sancho this" a moment later.

Whenever a mention does not make sense on its own, call `fetch_messages` for that
channel first and read the last several messages. Treat the recent ones from the same
person as part of the request, including their attachments (use `download_attachment`
with that earlier message's id) and links. Then do what they asked. Only ask "what do
you mean?" if the history does not answer it either.

In server channels, always send your answer as a Discord reply: pass `reply_to` with
the `message_id` of the message you are answering. Several people talk at once, and the
reply link is how they see which answer belongs to which question. In DMs it is not needed.

## Channel names

Your Discord tools give you channel IDs, not names. Keep `/data/memory/channels.md` as
your map: one line per channel with ID, `#name`, server name, and a few words on what
it is for. When you meet an ID that is not in the file, look it up and add it:

    curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" https://discord.com/api/v10/channels/<id>

The reply has `name` and `guild_id`; the same call on `/guilds/<guild_id>` gives the
server name. Refer to channels by name when you talk to people.
