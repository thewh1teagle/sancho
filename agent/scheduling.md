# Scheduling

Read this before scheduling anything, and when a scheduled task comes due.

## Doing things later

When someone asks you to do something at a later time ("in ten minutes check X",
"remind me Friday at 9", "every morning send me the news"), schedule it with the
`schedule` command. A task runs once, or repeats.

    schedule add --in 20m --chat <chat_id> --user <name> --user-id <user_id> "<task>"
    schedule add --at "2026-11-18 09:00" --tz Asia/Jerusalem --chat <chat_id> --user <name> --user-id <user_id> "<task>"
    schedule add --every day --at 09:00 --tz Asia/Jerusalem --chat <chat_id> --user <name> --user-id <user_id> "<task>"
    schedule add --every mon,thu --at 18:30 --tz Europe/Paris --chat <chat_id> --user <name> --user-id <user_id> "<task>"
    schedule add --every 2h --chat <chat_id> --user <name> --user-id <user_id> "<task>"
    schedule list
    schedule cancel <id>

- Take `chat_id`, the name and `user_id` from the message that asked.
- People here live in different timezones. A delay ("in 20 minutes") needs no timezone:
  use `--in`. A clock time ("at 9", "tomorrow morning") is meant in the asker's own
  timezone, so you need it: look in `/data/memory/people.md`, and if it is not there,
  ask them once and save it. Never guess a timezone. Check the current date with
  `date -u` before working out "tomorrow" or "Friday".
- Write the task as a full instruction that makes sense with no context, because you
  may not remember this conversation when it runs. "Remind Dana to send the camera-ready
  PDF to Morris" works; "remind her about it" does not.
- Confirm with the `<t:...>` tags the command prints, pasted as they are. Discord shows
  each reader that time in their own timezone.
- When a message beginning "Scheduled task" arrives, it is one of these coming due. Do
  the work then, with your full tools, and post the result in the chat it names.
- Repeating tasks: `--every` takes `day`, a list of days (`sun,mon,tue,wed,thu`), or an
  interval of at least 15 minutes (`30m`, `2h`, `1d`) counted from now. "Weekdays" differ
  by country, so ask which days they mean unless it is clear. Always pass the real
  `--user-id` of the person who asked: each person may hold 5 repeating tasks, and the
  command refuses a sixth. Owners have no limit; when the command lists an owner's
  earlier tasks, follow what it says about mentioning stale ones.
- A repeating task costs credits on every run, forever. Before creating one, be sure the
  person wants it to repeat, and in your confirmation say how it repeats and that they
  can ask you to cancel it. If one keeps producing nothing useful, say so and offer to
  cancel it.
- Anyone may ask what is scheduled. Cancel a task when the person who created it, or
  the owner, asks.
