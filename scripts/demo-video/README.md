# Vídeo de demonstração

Gera o vídeo de apresentação do Ranking de Tênis com **narração em pt-BR**
(Piper, offline), **cena gravada com Playwright** e **legenda queimada no
rodapé** (ffmpeg + libass). Cada passo do roteiro tem uma fala e uma ação: a
ação roda primeiro e a narração começa em seguida, garantindo sincronia mesmo
quando o servidor demora a responder.

Saídas:

- `demo-video/ranking-tenis-demonstracao.mp4` — vídeo final (H.264/AAC, 1280x800).
- `demo-video/legendas.srt` — as mesmas falas em arquivo de legendas.

## Pré-requisitos

1. **App no ar.** O build aponta para `http://localhost:3000` por padrão; use
   `VIDEO_BASE` para apontar para outro endereço (recomendado um servidor de
   produção isolado, mais rápido e sem overlays do modo dev):

   ```bash
   # terminal 1 — app em modo dev (ou build+start)
   npm run dev

   # terminal 2 — geração
   VIDEO_BASE=http://localhost:3000 npm run demo:video
   ```

2. **Playwright** instalado (`npx playwright install chromium`) — já consta em
   `devDependencies`.

3. **Piper + voz pt-BR + ffmpeg com libass**, fora do repositório, em
   `~/.local/video-demo`:

   ```
   ~/.local/video-demo/
   ├── piper/piper                      # binário do Piper
   ├── models/pt_BR-faber-medium.onnx   # (+ .onnx.json)
   └── ffmpeg/bin/{ffmpeg,ffprobe}      # ffmpeg estático com libass
   ```

   Fonte usada nas legendas: `DejaVu Sans`
   (`/usr/share/fonts/truetype/dejavu`).

4. **Supabase configurado** (`.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY`) e a massa demo carregada (`npm run demo:seed`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run demo:video` | Grava e monta o vídeo final completo. |
| `npm run demo:video -- --dry` | Só valida seletores e ações, **sem TTS e sem vídeo** (rápido). |
| `npm run demo:video -- --only=jogador` | Grava apenas uma cena (útil para ajustar textos/tempos). |
| `npm run demo:video:cleanup` | Remove a conta demo criada e sobras do cenário do jogador. |
| `node scripts/demo-video/qa.mjs` | Confere o resultado por análise de pixels/áudio (legenda queimada, sincronia, silêncio final). |

Exemplos:

```bash
npm run demo:video -- --dry                  # validação rápida de todo o roteiro
npm run demo:video -- --only=admin-nivel     # regrava só uma cena
VIDEO_BASE=http://localhost:3100 npm run demo:video
```

## O roteiro

Cada cena vive em `narrativa.mjs`; os cards de abertura/encerramento são HTML
(`assets/card.html`) abertos por `file://` com os parâmetros `k` (kicker),
`t` (título), `s` (subtítulo) e `b` (itens separados por `;;`).

Cenas: abertura, visitante, cadastro, pendente, jogador, admin-nivel,
admin-aprovacao, admin-regras e encerramento.

## Dados tocados (não destrutivo)

O build ajusta e **restaura** o estado sozinho:

- **Pendências demo** (`demo-a-pending`, `demo-b-pending`): o vídeo confirma e
  depois reabre as duas, voltando a ficar pendentes.
- **Partidas demo de seed** (`demo-<nível>-<n>`, ex.: `demo-a-5`, `demo-b-2`):
  normalizadas como **confirmadas** caso uma execução interrompida as tenha
  deixado pendentes (e os rankings são recalculados nesse caso).
- **Conta de auto-cadastro** (`demo-video.cadastro@example.com`): criada como
  pendente no setup e **aprovada durante a cena** (por isso o setup a recria
  como pendente na execução seguinte).
- **Cenário do jogador** (Rafael Almeida × Bruno Carvalho): cria um resultado
  pendente e o retira ao final; sobras de execuções anteriores são removidas.
- **Nível A**: abre o formulário de configuração e salva sem alterar valores.

Nenhum dado real do clube é modificado. O que a demo cria pode ser removido com
`npm run demo:video:cleanup`.

## Estrutura

```
scripts/demo-video/
├── build.mjs          # orquestrador: TTS, gravação, ASS, mux, concatenação
├── narrativa.mjs      # cenas, falas (pt-BR) e ações Playwright
├── assets/card.html   # cards de abertura/encerramento
├── cache/tts/         # áudios narrados em cache (por hash do texto)
└── out/               # bruto: vídeos, timelines.json, mix, frames de QA
```

Arquivos de saída intermediários (`cache/`, `out/`) são ignorados pelo git. O
MP4 final e o `legendas.srt` são versionáveis.

## Notas de implementação

- **Cache de TTS por hash do texto**: reexecutar sem mudar o roteiro não
  regenera o áudio.
- **Gravação**: `recordVideo` do Playwright a 1280x800, 25 fps. Cada cena usa um
  contexto novo (sem sessão prévia) e espera a hidratação do React antes de
  clicar em componentes de cliente. Um pulso visual mínimo é injetado em cada
  página para o Chromium continuar emitindo quadros em trechos estáticos.
- **Duração da cena = narração**: o mux corta exatamente no fim do áudio e, se
  a gravação tiver sido mais curta (página estática), clona o último quadro.
  Assim nenhuma fala é cortada, mesmo que o webm termine antes.
- **Cliques robustos**: ações que removem a linha da lista usam
  `clickUntilDetached`, que reclica se a primeira tentativa cair numa corrida
  de hidratação.
- **Localização de linhas**: as listas do painel podem conter outras partidas
  dos mesmos jogadores; por isso as ações casam a linha pelo **nome dos
  jogadores + a data** da pendência demo (derivada do banco no setup).
- **Legendas**: arquivo ASS no rodapé + banner com o nome da cena no topo; os
  tempos vêm das durações reais do áudio (`out/timelines.json`).
