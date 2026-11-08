#!/bin/bash
# Cria o .env (token novo + ARL copiado do autodl, sem imprimir segredos) e sobe o container.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
if [ ! -f .env ]; then
  umask 077
  {
    echo "UID_GID=$(id -u):$(id -g)"
    echo "DISCOVER_TOKEN=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
    grep '^DEEMIX_ARL=' /home/ubuntu/navidrome-autodl/.env
  } > .env
  echo ".env criado (token em $(pwd)/.env)"
fi
docker compose up -d --build
