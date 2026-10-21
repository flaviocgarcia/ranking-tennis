# Vídeo de demonstração (F CHALLENGER)

Gera a demonstração completa do sistema com **narração em pt-BR** (Piper,
offline), **cenas gravadas com Playwright** e **legenda queimada no rodapé**
(ffmpeg + libass). Cada passo do roteiro tem uma fala e uma ação: a ação roda
primeiro e a narração começa em seguida, garantindo sincronia mesmo quando o
servidor demora a responder.

O roteiro (`narrativa.mjs`) cobre **três personas**:

| Ato | Persona | Conteúdo |
| --- | --- | --- |
| 1 | Visitante (sem login) | home, regulamento, classificação (ordenação/busca), resultados, atletas, agenda, ativação por código |
| 2 | Jogador aprovado | login, painel, novo resultado com validação de placar, meus resultados, perfil e Telegram |
| 3 | Administrador | painel, lançar resultado, pendências, confirmar → impacto no ranking, reabrir, jogadores (etiqueta A–D), convites, excluir, verificar consistência |

Saídas (em `demo-video/`, versionáveis):

- `fchallenger-demonstracao.mp4` — vídeo completo (~7 min) + `legendas.srt`.
- `fchallenger-publico.mp4`, `fchallenger-jogador.mp4`, `fchallenger-admin.mp4`
  — um vídeo por ato (~2–3 min cada) + `legendas-<ato>.srt`, gerados do
  mesmo conjunto de cenas.

## Dados de demonstração: cria, grava e RESTAURA

O vídeo usa os **atletas reais** do ranking para ser fiel ao dia a dia, com
**restauração total** ao final:

1. **Setup** (`setup`): grava backup completo (partidas, convites, perfis e
   snapshots) em `scripts/demo-video/out/backup.json`; escolhe no ranking
   real o adversário que mais sobe de posição somando 300 pontos; cria um
   convite demo (`Convite Demonstração (vídeo)`) para a tela `/ativar`; e,
   se a cena do jogador não fizer parte do run, cria a pendência do impacto
   direto no banco.
2. **Gravação**: o jogador informa uma derrota (fica pendente) → o admin
   confirma → o ranking muda na tela → o admin reabre (volta ao estado
   anterior), edita etiqueta A–D do demo, cria convite, exclui o lançamento
   de exemplo e verifica a consistência.
3. **Restauração** (`finally`, roda SEMPRE — inclusive em `--dry`): remove
   tudo que a demo criou, devolve o que mudou (status, etiquetas, códigos),
   repõe o snapshot publicado exatamente como estava e confere que nenhuma
   sobra demo permaneceu.

Se algo sair do trilho: `node scripts/demo-video/build.mjs --cleanup`
repete a restauração a partir do backup.

Após a gravação, purgue também o cache ISR da **produção** (o revalidatePath
da gravação só limpa o servidor local; a Vercel pode ter cacheado o estado
demo se o tick horário de ISR pegar a janela da gravação):

```bash
node scripts/demo-video/purge-cache.mjs https://ranking-tenis-app.vercel.app
```

## Pré-requisitos

1. **App no ar.** O build aponta para `http://localhost:3000` por padrão; use
   `VIDEO_BASE` para apontar para outro endereço (recomendado build+start,
   mais rápido e sem overlays do modo dev):

   ```bash
   # terminal 1
   npm run build && npm run start -- -p 3100

   # terminal 2
   VIDEO_BASE=http://localhost:3100 npm run demo:video
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
   `SUPABASE_SERVICE_ROLE_KEY`) e as contas demo existentes
   (`demo-player@example.com` / `demo-admin@example.com`, senha `Demo@12345`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run demo:video` | Grava e monta o vídeo completo + os três por ato. |
| `node scripts/demo-video/build.mjs --dry` | Só valida seletores/ações (sem TTS/vídeo); ainda assim grava e restaura o backup. |
| `node scripts/demo-video/build.mjs --only=<id>` | Grava apenas uma cena (ex.: `--only=adm-pendentes`). |
| `node scripts/demo-video/build.mjs --cleanup` | Repete a restauração a partir do `backup.json`. |
| `node scripts/demo-video/purge-cache.mjs <url>` | Limpa o cache ISR de `/rankings` e `/results` (local ou produção) sem alterar dado algum. |
| `node scripts/demo-video/qa.mjs` | QA objetivo: confere legenda queimada, áudio da fala e silêncio no fim de cada cena (usa `out/timelines.json` + `out/mix/`). |
