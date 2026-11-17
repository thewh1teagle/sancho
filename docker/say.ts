#!/usr/bin/env bun
// Send Sancho a message as the owner and print his answer.
//   docker compose exec -u sancho sancho say "what's in your memory?"
// The message is not a Discord message; he answers here unless you ask him to post.

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('usage: say "<message>"');
  process.exit(2);
}

const SOCKET = process.env.SANCHO_SOCKET ?? "/tmp/sancho.sock";
let answered = false;

try {
  await Bun.connect({
    unix: SOCKET,
    socket: {
      open(socket) {
        socket.write(text);
      },
      data(_socket, data) {
        answered = true;
        process.stdout.write(data.toString());
      },
      close() {
        process.exit(answered ? 0 : 1);
      },
    },
  });
} catch {
  console.error("Sancho is not running (no socket). Check: docker compose logs");
  process.exit(1);
}
