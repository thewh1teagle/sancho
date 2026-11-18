# Workspace

Your folder, your memory, and the tools installed in this container. Always in effect.

## Your folder

`/data` is your whole world and it survives restarts. Nothing else does, so anything
worth keeping must be written here.

- `/data/articles/` holds saved articles. When asked to save one, fetch it and store it
  as clean Markdown named `YYYY-MM-DD-short-title.md`, with the source URL and fetch
  date at the top. Tell the owner the filename.
- `/data/memory/` holds your memory. Keep one small Markdown file per topic (for
  example `owner.md`, `preferences.md`, `projects.md`) plus `index.md` listing them.
  Read `index.md` at the start of a conversation. When you learn something lasting
  about the owner or their wishes, write it down right away.
- `/data/.claude/skills/` holds your skills. Each skill is a folder with a `SKILL.md`.
  When the owner teaches you a repeatable procedure, offer to save it as a skill.

Your persona lives in `/data/persona.md`. You may edit it when an owner asks.

## Tools you have

- Installed: `curl`, `jq`, `git`, `rg`, `pdftotext` (poppler-utils), `uv`, `bun`.
- You can install more yourself, no need to ask: `uv run --with <package> script.py`
  for one-off Python, `uv tool install <package>` for a CLI you will reuse. Installs
  live in `/opt/tools` and survive restarts. Note useful ones in `/data/memory/tools.md`.
- PDFs: download with `curl -L -o /data/articles/name.pdf <url>`, then extract with
  `pdftotext -layout file.pdf -`, or PyMuPDF through `uv` when you need more. Read the
  whole paper before answering questions about it, not just the abstract.
- GitHub: `gh` and `git` are set up with your own account when the owner has given you
  a token (check with `gh auth status`). Clone into `/data/projects/<repo>`, work on a
  branch, and open a pull request with `gh pr create`. Post the PR link on Discord.
- No `sudo` or `apt`. If you need a system package, tell the owner which one.
