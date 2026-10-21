# 🎾 F CHALLENGER — rankingTenis

Torneio de tênis **F CHALLENGER**: classificação oficial calculada a partir
dos resultados reportados pelos próprios atletas, com jogos livres, partidas
**Normais** ou **Grand Slams**, W.O., limite de 2 partidas por semestre contra
o mesmo adversário e pontos que **caducam ao completar 1 ano**.

Projeto pensado para rodar **sem custo** na faixa gratuita: **Vercel Hobby +
Supabase Free**, com **zero rotinas periódicas** (sem cron, polling ou
Realtime) — a janela de 12 meses é aplicada na leitura.

Documentação: [`docs/setup.md`](docs/setup.md) ·
[`docs/demo-data.md`](docs/demo-data.md) ·
[`docs/free-tier.md`](docs/free-tier.md) ·
[`docs/performance.md`](docs/performance.md)

## Regras implementadas (fonte: planilha "F CHALLENGER R25")

| Tema | Regra |
| --- | --- |
| Normal | melhor de 3; 3º set é **tiebreakão** (1º a 10, vantagem 2) |
| Grand Slam | melhor de 5, **sem** tiebreakão |
| W.O. | incomparecimento: **300 x 50**, vencedor declarado, sem placar |
| Pontos Normal | vence 2×0 → **300/50**; vence 2×1 → **200/100** |
| Pontos Grand Slam | vencedor **450** sempre; perdedor 0/1/2 sets → **75/150/300** |
| Semestre | máx. **2 partidas** por semestre contra o MESMO adversário (validado ao lançar; o admin não é bloqueado) |
| Validade | os pontos **caducam após 1 ano** — só os últimos 12 meses valem |
| Empate | mesma posição (1, 2, 2, 4), exibição alfabética, **sem desempate** |
| Confirmação | resultado entra **pendente** e só pontua após confirmação do admin |

O motor inteiro (pontos, semestres, janela, snapshot) vive em
`src/lib/domain/challenger.ts` — função pura, usada igualmente pelo app,
pelos scripts e pela verificação de consistência.

## Funcionalidades

**Público (páginas estáticas, servidas do CDN)**

- `/` — início do F CHALLENGER; `/rules` — regulamento completo.
- `/rankings` e `/rankings/challenger` — classificação (posição, atleta,
  pontos, jogos **JGS** e média), com janela de 12 meses aplicada na leitura.
- `/results` e `/results/challenger` — resultados confirmados com
  distintivo **Grand Slam** / **W.O.**; pendentes/rejeitados nunca aparecem.
  Vencedor em verde e derrotado em vermelho (inclusive em "Meus resultados").
- `/agenda` — quem marcou disponibilidade nas próximas datas.
- `/atletas` — relação de participantes com o nível A–D de cada um
  (etiqueta editável só pelo administrador, sem efeito no ranking).
- Revalidação **sob demanda** (`revalidatePath` em escritas oficiais +
  `revalidate = 3600` nas páginas de ranking) — nada roda por relógio.

**Ativação de conta (sem auto-cadastro)**

- Os atletas são pré-cadastrados pelo administrador em
  `/admin/convites` e recebem um **código de ativação** (8 caracteres, sem
  caracteres ambíguos — envio por WhatsApp).
- Em `/ativar` (o antigo `/register` redireciona) o atleta digita o código,
  confere o nome e escolhe **e-mail + senha** — a conta nasce aprovada e
  entra automaticamente. O código é de **uso único**.

**Jogador (`/app`)**

- Informar resultado com formato (Normal / Grand Slam / W.O.), validado no
  servidor — inclui o limite de 2 por semestre e a checagem de jogo no mesmo
  dia. Entra **pendente** até o admin confirmar.
- Histórico dos próprios resultados com opção de **retirar** o pendente;
  painel com classificação (janela corrente), últimos jogos e agenda.
- Perfil (`/profile`): nome, senha e código de vínculo do Telegram.

**Administrador (`/admin`)**

- **Convites**: gerar/regenerar/remover código de ativação por atleta.
- **Jogadores**: criar conta (senha temporária exibida uma vez), editar,
  redefinir senha, ativar/desativar.
- **Resultados**: lançar, confirmar/rejeitar, editar e excluir; filtros e
  paginação. Confirmar recalcula e republica a classificação na hora.
- **Verificação de consistência** (`/admin/verify`): recalcula a partir dos
  resultados com a MESMA função de domínio e compara com o publicado — só
  leitura, sob demanda.

**Telegram (100% opcional, webhook atualmente pausado)** — `/start`,
`/ajuda`, `/vincular`, `/desvincular`, `/ranking`, `/meus` e
`/registrar JOGADOR 6-4 7-5` (registra como Normal).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase
(Postgres + Auth + RLS) · CSS global próprio (sem UI kit, sem fontes ou
imagens externas — **zero requisições de terceiros** no navegador).

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
# aplique supabase/migrations/0001..0007 no SQL Editor (ou psql -f)
npm run dev                  # http://localhost:3000
```

Importação da planilha (wipe total da base — ver `docs/setup.md`):

```bash
npm run fch:export                        # xlsx -> /tmp/opencode/fchallenger.json
npm run fch:import -- --yes               # apaga e reimporta tudo
```

Scripts: `npm run dev` · `npm run build` · `npm run typecheck` ·
`npm run demo:seed` / `npm run demo:reset` (contas E2E — ver
[`docs/demo-data.md`](docs/demo-data.md)) ·
`npm run rankings:rebuild` (republica a classificação com o motor vigente) ·
`npm run telegram:set-webhook`.

Deploy: `docs/setup.md` (inclui promoção do primeiro administrador,
backup, pausa/reativação do Supabase).

## Arquitetura (resumo)

- **Snapshot com histórico**: `ranking_snapshots.data` guarda as
  contribuições `[data, pontos]` de cada partida; a **janela de 12 meses é
  aplicada na leitura** (páginas públicas com `revalidate = 3600`) — os
  pontos caducam sozinhos, sem cron.
- **Páginas públicas estáticas**: não leem cookies; revalidação por
  `revalidatePath` apenas em escritas oficiais (confirmação, edição,
  exclusão de resultado).
- **RLS + chave de service**: jogadores operam sob RLS (e-mails e códigos
  privados — grants de coluna); `invites` é tabela **privada** (só
  `service_role`) porque o código de ativação é credencial.
- **Ativação por código**: `/ativar` valida o código (etapa 1: mostra o
  nome) e cria/ativa a conta no servidor (etapa 2), com uso único via
  condição `.is("activated_at", null)` — fecha corrida de duplo envio.
- **Sem middleware** para manter as páginas públicas estáticas.
- **Consulta econômica**: colunas explícitas, paginação, `count` na própria
  query, leituras em `Promise.all`.

## Limitações conhecidas (MVP)

- **Duplas/pares não implementadas** — estrutura deixada extensível.
- **Sem histórico de posições**: só a classificação vigente é publicada
  (o snapshot guarda a data do cálculo).
- **Histórico da planilha**: 1 par teve 3 partidas no mesmo semestre em
  2026-S1 (violação pré-existente, mantida na importação — a validação vale
  para novos lançamentos).
- **Escala protegida**: recálculo limitado a 2.000 jogadores e 10.000
  resultados por nível (proteção da função serverless).
- **Planos gratuitos têm limites e pausas** (Supabase pausa projetos
  inativos após ~1 semana): leia `docs/free-tier.md` — **nenhum custo é
  garantido como zero**.

## Estrutura

```
src/app/(site)/     páginas públicas estáticas (/, rules, rankings, results, agenda)
src/app/ativar      ativação de conta por código (login em src/app/login)
src/app/app/        área do jogador         (/app, /app/results, /app/agenda)
src/app/admin/      painel admin            (convites, jogadores, resultados, verify)
src/actions/        server actions
src/lib/queries/    camada de dados (colunas explícitas, paginação)
src/lib/domain/     regras puras (challenger, formato, pontuação, agenda)
src/lib/results/    montagem da lista pública de jogos (funções puras)
supabase/migrations schema versionado + RLS
scripts/            export da planilha, importação/wipe, demos, smoke E2E
docs/               free-tier, setup, performance, demo-data
```
