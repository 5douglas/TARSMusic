<div align="center">

# TARSMusic

**Seu próprio "Spotify" para a sua biblioteca de música no Navidrome.**

[![Release](https://img.shields.io/github/v/release/5douglas/TARSMusic?label=APK&logo=android)](https://github.com/5douglas/TARSMusic/releases/latest)
![Platform](https://img.shields.io/badge/platform-Android-3DDC84)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

</div>

TARSMusic é um app Android para ouvir a sua biblioteca de música hospedada no
[Navidrome](https://www.navidrome.org/) (ou outro servidor compatível com a API Subsonic),
com o visual e o jeito de usar do Spotify, mantendo o azul do TARSMusic.

É um fork do [Substreamer](https://github.com/ghenry22/substreamer), de Gaven Henry, com
interface redesenhada e recursos próprios.

## Download

Baixe o APK mais recente em **[Releases](https://github.com/5douglas/TARSMusic/releases/latest)**.

Depois de instalado, o próprio app avisa quando sai uma versão nova (Configurações ›
*Check for updates*, ou o menu do perfil). No Android 12 ou mais novo a atualização se
instala sozinha: o app fecha e é só abrir de novo. Na primeira vez o Android pode pedir para
permitir instalações do TARSMusic.

## O que tem no TARSMusic

**Visual do Spotify**
- Início com atalhos, mixes e lançamentos; Buscar; Sua Biblioteca com filtros, ordenação e grade.
- Player com a linha da letra embaixo da capa, prévia da letra no tom da capa, letra em tela
  cheia sincronizada, card do álbum e próximas da fila.
- Botão **Traduzir** na letra: a tradução (no idioma do celular) aparece embaixo de cada linha.
- Página do artista com ouvintes, Populares (com número de plays), Discografia
  (Lançamentos populares, Álbuns, Singles e EPs, Compilações), Fãs também curtem e Sobre.
- Página de álbum, single e EP com tipo, ano, duração e "Mais de" o artista.
- Menu do perfil com foto e estatísticas de audição.

**Seus dados no servidor**
- Histórico de audição, estatísticas, correções de metadados, exclusões de scrobble e
  marcadores são salvos automaticamente no Navidrome (numa playlist privada
  *TARSMusic backup (não apagar)*) e voltam sozinhos quando você entra na conta, mesmo
  num celular novo ou depois de reinstalar.

**Descobrir música**
- Mix diário e mixes por artista feitos a partir do que você ouve.
- Integração com um servidor *Discover* próprio: novos lançamentos e paradas do Deezer,
  e download pelo deemix direto para a biblioteca (Configurações › Discover).
- Estatísticas públicas de artista e música pelo Last.fm (com chave de API) ou Deezer.

**Herdado do Substreamer**
- Reprodução em segundo plano, controles na tela de bloqueio, fila, shuffle e repeat.
- Downloads para ouvir offline, modo offline automático, scrobbles, favoritos e avaliações.
- Playlists, compartilhamento, histórico de audição e correção de metadados (MusicBrainz).

## Servidor

O app funciona com qualquer servidor da API Subsonic; o recomendado é o
[Navidrome](https://www.navidrome.org/). Detalhes de configuração de servidores estão em
[SERVERS.md](SERVERS.md).

## Gerar o APK

O APK é gerado pelo GitHub Actions ([android-release.yml](.github/workflows/android-release.yml)):
rode o workflow **Android release APK** com a versão (ex.: `8.3.3`) ou envie uma tag `v8.3.3`.
Ele publica o APK como release, que é de onde o app baixa as atualizações.

Para desenvolver localmente:

```bash
npm ci
npx tsc --noEmit -p .   # tipos
npx jest                # testes
npx expo run:android    # app no emulador ou no celular
```

## Créditos e licença

TARSMusic é baseado no [Substreamer](https://github.com/ghenry22/substreamer) © Gaven Henry e
colaboradores. Assim como o original, é distribuído sob a
[GNU General Public License v3.0](LICENSE).
