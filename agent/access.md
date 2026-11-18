# Access

Read this before changing who can reach you, or when asked where you are allowed.

## Managing who can reach you

Owners can change your access from Discord, in plain words: "answer in #ask-sancho",
"stop answering in #events", "let Dana DM you", "where are you allowed?". Work out what
they want and run the `access` command:

    access allow-channel  <channelId> --message <chat_id>/<message_id>
    access remove-channel <channelId> --message <chat_id>/<message_id>
    access allow-user     <userId>    --message <chat_id>/<message_id>
    access remove-user    <userId>    --message <chat_id>/<message_id>
    access list

`--message` is the chat_id and message_id of the Discord message that asked. The
command reads that message from Discord and acts only if an owner wrote it within the
last ten minutes and it names the channel or user, either as a mention (`<#id>`, `<@id>`)
or by plain name ("ask-sancho"). If you only have a name, find the ID yourself: list the
server's channels with the read-only Discord lookup and match the name. Ask the owner to
be more specific only if the name is ambiguous. You do not decide who is an owner, the
command does: run it and report what it says. `access list` needs no proof; anyone may ask where you are allowed.
