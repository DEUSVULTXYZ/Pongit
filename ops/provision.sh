#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 ca-certificates curl git
systemctl enable --now docker
usermod -aG docker pongit
install -d -m 750 -o pongit -g pongit /opt/pongit /opt/pongit/releases /opt/pongit/shared
ufw allow 3333/tcp
ufw allow 80/tcp
ufw allow 443/tcp
docker --version
docker compose version
ufw status
