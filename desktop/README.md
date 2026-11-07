# TARSMusic para Windows

O app de Windows é o mesmo código do app do celular, rodando dentro do Electron
pelo build web (react-native-web). Ele conecta no mesmo servidor Navidrome e no
mesmo serviço Discover.

- `main.js`: a janela do Electron, que serve o build web em `app://tarsmusic` e
  instala as atualizações automáticas das releases do GitHub.
- `shims/`: as versões para Windows dos módulos nativos do celular (player de
  áudio com fila, crossfade, equalizador e ReplayGain; banco SQLite; arquivos;
  cores da capa; notificações). `shims/map.js` diz qual módulo cada arquivo
  substitui, e o `metro.config.js` só usa essa troca no build web.
- `../index.web.js` e `bootstrap.js`: entrada do build web.

## Gerar o instalador

O instalador é gerado no GitHub Actions (workflow **Windows release**, em uma
máquina Windows) e vai para a release da versão, junto com o APK. Para gerar à mão
em um PC com Windows:

```
npm ci
cd desktop
npm ci
npm run dist
```

O instalador fica em `desktop/dist/TARSMusic-Setup-<versão>.exe`.

Para testar sem instalar: `npm run build:web` e depois `npm start` (dentro de
`desktop/`). F12 abre as ferramentas de desenvolvedor.
