# Links de compartilhamento do TARSMusic

Serviço pequeno que responde aos links que o app compartilha:

    https://<endereço do Discover>/s/<song|album|artist|playlist>/<id>

- No navegador mostra capa, nome e os botões **Abrir no TARSMusic** e **Baixar o TARSMusic**.
- WhatsApp e Telegram usam as tags da página para mostrar a prévia com capa.
- `/.well-known/assetlinks.json` faz o Android abrir esses links direto no app.
- Playlists só aparecem se forem públicas no Navidrome.

## Instalar no servidor

```sh
cd ~/tarsmusic-share          # cópia desta pasta
cp .env.example .env          # usuário e senha do Navidrome
docker compose up -d --build  # escuta em 127.0.0.1:8086
```

No túnel do Cloudflare, antes da regra do Discover, mande para `http://localhost:8086`
os caminhos `^/s/` e `^/\.well-known/assetlinks\.json$` do host do Discover.
