# Chat do TARSMusic

Serviço pequeno (Python, sem dependências) que guarda as conversas entre os
usuários do Navidrome. O app fala com ele em `<URL do Discover>/chat`.

- Login: cada pedido leva o usuário e o token Subsonic do app. O serviço confere
  no Navidrome (`ping.view`), então cada um só lê e envia como ele mesmo.
- Dados: um arquivo SQLite em `data/chat.db` (mensagens, contatos).
- Lista de usuários: com `NAVIDROME_ADMIN_USER` e `NAVIDROME_ADMIN_PASSWORD` no
  `.env`, aparecem todas as contas do servidor. Sem isso, só quem já abriu o chat.

## Instalar no servidor

```
cp -r server/chat ~/tarsmusic-chat
cd ~/tarsmusic-chat
cp .env.example .env   # preencher a conta admin
chmod 600 .env
docker compose up -d --build
curl http://127.0.0.1:8087/chat/health
```

No túnel da Cloudflare, o hostname do Discover ganha uma regra de caminho
`/chat/*` apontando para `http://127.0.0.1:8087`, antes da regra do Discover.

## Testes

```
python3 -m unittest test_chat_server.py
```
