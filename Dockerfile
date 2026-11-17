FROM debian:bookworm-slim

ARG CLAUDE_CODE_VERSION=2.1.326
ARG UID=1000
ARG GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq unzip ripgrep iptables util-linux poppler-utils \
 && rm -rf /var/lib/apt/lists/*

# GitHub CLI, from GitHub's own apt repository.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -g ${GID} sancho \
 && useradd -m -u ${UID} -g ${GID} -s /bin/bash sancho \
 && mkdir -p /data /opt/tools && chown sancho:sancho /data /opt/tools

USER sancho
ENV HOME=/home/sancho
ENV PATH=/opt/tools/bin:/home/sancho/.local/bin:/home/sancho/.bun/bin:$PATH
ENV CLAUDE_CONFIG_DIR=/home/sancho/.claude
ENV DISABLE_AUTOUPDATER=1
# Everything the agent installs for itself lands in the /opt/tools volume.
ENV UV_TOOL_DIR=/opt/tools/uv/tools \
    UV_TOOL_BIN_DIR=/opt/tools/bin \
    UV_PYTHON_INSTALL_DIR=/opt/tools/uv/python \
    UV_CACHE_DIR=/opt/tools/uv/cache

RUN curl -fsSL https://bun.sh/install | bash \
 && curl -LsSf https://astral.sh/uv/install.sh | sh \
 && curl -fsSL https://claude.ai/install.sh | bash -s ${CLAUDE_CODE_VERSION} \
 && mkdir -p /home/sancho/.claude

# Safety rules live in the image, root-owned, so the agent cannot edit them.
USER root
COPY AGENTS.md /etc/claude-code/CLAUDE.md
COPY docker/ /opt/sancho/
RUN chmod 644 /etc/claude-code/CLAUDE.md && chmod 755 /opt/sancho/*.sh \
 && chmod 755 /opt/sancho/say.ts /opt/sancho/allow-server.ts /opt/sancho/schedule.ts /opt/sancho/access.ts \
 && ln -s /opt/sancho/access.ts /usr/local/bin/access \
 && ln -s /opt/sancho/schedule.ts /usr/local/bin/schedule \
 && ln -s /opt/sancho/allow-channel.sh /usr/local/bin/allow-channel \
 && ln -s /opt/sancho/allow-server.ts /usr/local/bin/allow-server \
 && ln -s /opt/sancho/say.ts /usr/local/bin/say

WORKDIR /data
ENTRYPOINT ["/opt/sancho/entrypoint.sh"]
