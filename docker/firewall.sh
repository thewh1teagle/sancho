#!/usr/bin/env bash
# Cut the container off from private networks (LAN, Docker host). Internet stays open.
set -euo pipefail

for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  iptables -A OUTPUT -d "$net" -j REJECT
done
for net in fc00::/7 fe80::/10; do
  ip6tables -A OUTPUT -d "$net" -j REJECT 2>/dev/null || true
done
