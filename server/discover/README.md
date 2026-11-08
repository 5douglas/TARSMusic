# navidrome-discover

Backend da aba **Descobrir** do fork do Substreamer. Python 3.12 só com stdlib,
container `navidrome-discover` na rede `navidrome_default`, porta `8085`
(publicada só em `127.0.0.1:8085` no servidor).

**URL pública:** `https://discover.douglas.seg.br` (túnel Cloudflare → `localhost:8085`,
sem Cloudflare Access; a proteção é o token abaixo).

- Fontes: API pública do Deezer, cópia read-only do `navidrome.db` (biblioteca e
  histórico) e cache de IDs Deezer do `navidrome-autodl` (`data/state.json`).
- Downloads: `deemix-gui` em `http://deemix:6595` (`/api/loginArl` + `/api/addToQueue`),
  ARL vindo de `DEEMIX_ARL` no `.env`.
- Instalar/atualizar no servidor: `bash setup.sh` (cria o `.env` com um token novo
  e o ARL do autodl, depois `docker compose up -d --build`).

## Autenticação

Todo endpoint, exceto `/` e `/health`, exige o token (`DISCOVER_TOKEN` no `.env`):

```
Authorization: Bearer <token>
```

ou `?token=<token>` na query (usado pela tag `<audio>` em `/preview`).
Sem token ou token errado: `401 {"error": "unauthorized"}`.

## Endpoints

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/health` | `{"ok": true}` (sem token) |
| GET | `/` | Página HTML de teste (pede o token) |
| GET | `/playlists` | Índice: `{"playlists": [{id, title, path}]}` |
| GET | `/home` | Seções da aba Descobrir: `{updated, scanning, sections: [{id: releases\|mixes\|charts, title, items: Card[]}]}` |
| GET | `/playlists/mix/{deezerArtistId}` | Mix de um artista: radio + top de relacionados, sem faixas da biblioteca (até 40) |
| GET | `/playlists/new-releases` | Lançamentos dos últimos 30 dias de artistas da biblioteca |
| GET | `/playlists/recommended` | Rádio + artistas relacionados aos mais ouvidos, sem faixas já na biblioteca |
| GET | `/playlists/charts?country=BR` | Top do país (playlist editorial "Top <país>" do Deezer). `GLOBAL` = Top Worldwide; `API` = `/chart` do Deezer; também `US`, `AR`, `MX`, `FR`, `DE`, `GB`, `PT`... |
| GET | `/search?q=texto&type=track` | Busca no Deezer; `type` = `track` (padrão), `album` ou `artist`. `{query, type, count, items}` |
| GET | `/artist-missing?name=Artista` | Lançamentos do artista no Deezer que faltam na biblioteca: `{artist, count, items: AlbumItem[]}` (404 se o nome não casar) |
| GET | `/browse/album/{id}` | Playlist com as faixas do álbum + `album` (AlbumItem), `cover`, `link` |
| GET | `/browse/artist/{id}` | Top 20 faixas em `items` + `albums` (discografia, mais novo primeiro) + `artist` |
| GET | `/preview/{deezer_track_id}` | `302` para um preview de 30s válido |
| POST | `/download` | Manda um link do Deezer para a fila do deemix |
| GET | `/download/queue` | Fila do deemix agrupada: `{counts, active, queued, failed, completed}` |
| POST | `/download/remove` · `/download/retry` | `{uuid}` de um item da fila (`track_123_3`); `{ok}` |
| POST | `/download/clear-finished` · `/download/cancel-all` | Sem corpo; `{ok}` |

`?refresh=1` em qualquer `/playlists/...` força remontar (senão, cache de 40 min;
charts 30 min). A primeira montagem de `recommended`/`new-releases` leva ~15–30 s.

### Playlist

```json
{
  "id": "recommended",
  "title": "Recomendadas para voce",
  "description": "...",
  "updated": "2026-10-19T02:23:59+00:00",
  "count": 60,
  "items": [ Item, ... ]
}
```

Campos extras por playlist: `seeds` (recommended: artistas usados como semente),
`scanned`/`scanning` (new-releases: quando a varredura de 12 h rodou),
`country`, `cover`, `deezer_playlist_id`, `link` (charts).

### Item

```json
{
  "id": 3282842161,                 // id da faixa no Deezer
  "type": "track",
  "title": "Elevador",
  "artist": "Ana Laura Lopes",
  "artist_id": 123,
  "album": "Elevador",
  "album_id": 456,
  "cover": "https://cdn-images.dzcdn.net/.../1000x1000...jpg",
  "cover_small": "https://cdn-images.dzcdn.net/.../250x250...jpg",
  "preview": "https://cdnt-preview.dzcdn.net/...mp3?hdnea=exp=...",
  "duration": 187,                  // segundos
  "explicit": false,
  "link": "https://www.deezer.com/track/3282842161",
  "album_link": "https://www.deezer.com/album/456",
  "in_library": false               // ja existe no Navidrome (artista + titulo normalizados)
}
```

Extras: `reason` (recommended, ex. "Porque voce ouve Jão"), `position` (charts),
`release_date`, `record_type` (`single`/`ep`/`album`) e `album_in_library` (new-releases).

**Preview expira** (~1 h, assinatura `hdnea`). Se tocar mais tarde, use
`/preview/{id}?token=...`, que sempre redireciona para um link novo.

### AlbumItem / ArtistItem (busca e /browse)

```json
{"id": 9, "type": "album", "title": "...", "artist": "...", "artist_id": 5, "cover": "...",
 "cover_small": "...", "record_type": "album", "release_date": "2026-07-27", "track_count": 14,
 "explicit": false, "link": "https://www.deezer.com/album/9", "in_library": true}

{"id": 5, "type": "artist", "title": "Jão", "cover": "...", "cover_small": "...", "fans": 727412,
 "album_count": 28, "link": "https://www.deezer.com/artist/5", "in_library": true}
```

Busca em cache por 10 min, `/browse` por 30 min (`?refresh=1` força). Id inexistente: `404`.

### POST /download

```json
{"url": "https://www.deezer.com/album/456"}
// ou
{"type": "track", "id": 3282842161}
```

Aceita links `deezer.com/{track|album|playlist|artist}/{id}` (com ou sem prefixo de
idioma), `deezer.page.link/...` e `link.deezer.com/s/...`. Resposta:

- `200 {"queued": true, "url": "...", "deemix": {...}}`
- `400` link inválido · `502` deemix recusou/falhou (`{"queued": false, ...}` ou `{"error": ...}`)

O arquivo cai em `/home/ubuntu/gdrive_videos/music` (Google Drive via rclone) e entra
no Navidrome no próximo scan.

### Card (GET /home)

Lançamentos usam o AlbumItem. Mixes e charts:

```json
{"id": "mix-5297266", "type": "mix", "title": "Mix Jão", "artist": "Jão", "cover": "...",
 "cover_small": "...", "path": "/playlists/mix/5297266"}
{"id": "charts-br", "type": "chart", "title": "Top Brasil", "count": 100, "cover": "...",
 "cover_small": "...", "path": "/playlists/charts?country=BR"}
```

`path` é o endpoint da playlist do card.

### GET /download/queue

```json
{"counts": {"active": 1, "queued": 3, "failed": 2, "completed": 4870},
 "active": [QueueItem], "queued": [QueueItem], "failed": [QueueItem], "completed": [QueueItem]}
```

QueueItem: `{uuid, title, artist, type, status, cover, progress, downloaded, failed, size}`.
`status` = `downloading` · `inQueue` · `failed` · `withErrors` · `completed`. `queued` e `failed`
vêm limitados a 50 itens; `completed` aos 30 mais recentes.

## Configuração (`.env` / environment)

| Variável | Padrão | |
|---|---|---|
| `DISCOVER_TOKEN` | — | token da API (obrigatório) |
| `DEEMIX_ARL` | — | ARL do Deezer para o deemix |
| `HISTORY_USERS` | todos | usuários do Navidrome cujo histórico conta (ex. `dino,douglas`) |
| `LOOKBACK_DAYS` | 30 | janela de lançamentos |
| `SCAN_INTERVAL_HOURS` | 12 | varredura de lançamentos |
| `PLAYLIST_TTL` | 2400 | cache das playlists (s) |
