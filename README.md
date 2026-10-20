# 🎾 rankingTenis

Ranking de tênis de clube com resultado reportado pelos próprios jogadores,
painel administrativo de níveis/configuração e páginas públicas leves —
projetado para rodar **sem custo** na faixa gratuita: **Vercel Hobby +
Supabase Free**, com **zero rotinas periódicas** (sem cron, polling,
Realtime ou ISR por tempo).

Documentação: [`docs/setup.md`](docs/setup.md) ·
[`docs/demo-data.md`](docs/demo-data.md) ·
[`docs/free-tier.md`](docs/free-tier.md) ·
[`docs/performance.md`](docs/performance.md)

## Funcionalidades

**Público (páginas estáticas, servidas do CDN)**

- `/` — início com visão geral; `/rules` — regras e configuração vigente.
- `/rankings` — ranking de todos os níveis ativos; `/rankings/[slug]` —
  detalhe com tabela, pontuação e critérios de desempate.
- `/results` — lista pública das partidas **confirmadas** (data, nível,
  jogadores, placar e vencedor destacado); `/results/[slug]` — jogos de um
  nível. Jogos pendentes/rejeitados **nunca** aparecem (política RLS da
  migration `0003`).
- Atualização **sob demanda**: as páginas são revalidadas apenas quando um
  resultado oficial é confirmado/editado ou o admin publica — nunca por
  relógio.

**Jogador (`/app`)**

- Informar resultado (placar por sets, validado no servidor; empate de sets
  exige o tiebreakão) — entra como **pendente** até o admin confirmar.
- Histórico dos próprios resultados com opção de **retirar** o pedido
  pendente; ranking do seu nível e suas últimas partidas no painel.
- Perfil (`/profile`): trocar nome e senha, código de vínculo do Telegram.
- Primeiro acesso com senha temporária é **obrigado a definir a própria
  senha**.
- **Auto-cadastro** em `/register`: a pessoa escolhe o nível em que joga e
  fica **aguardando aprovação** — entra no sistema, mas só aparece no
  ranking e pode informar resultados depois que o administrador aprovar.

**Administrador (`/admin`)**

- **Níveis/categorias**: criar, editar, ativar/desativar (A, B, C, D e
  extensões como Feminino — futuramente Duplas).
- **Configuração por nível**: formato (2 sets + tiebreakão de 10 pts, ou
  1 set cada com super tiebreak), **pontuação** (ex.: 3 pts para 2×0, 2
  pts para vitória com tiebreak; **derrotado no tiebreakão ganha 1 ponto —
  ligado por padrão** e configurável) e **ordem dos critérios de desempate**
  (vitórias → confronto direto → saldo de sets → saldo de games — a ordem
  é configurável). O ranking é ordenado **por pontos**; a cadeia de desempate
  entra apenas dentro de cada grupo empatado em pontos.
- **Vários administradores**: no cadastro/edição de usuário é possível
  definir `admin` **geral** (todos os níveis) ou **restrito a um nível**
  (gerencia apenas jogadores e resultados daquele nível). O nível em que o
  administrador **joga** é independente do escopo de administração, então
  um admin pode jogar e administrar o próprio nível.
- **Usuários**: criar jogador (gera senha temporária exibida uma vez),
  editar nível/perfil/ativo, redefinir senha e **aprovar auto-cadastros**.
  Jogador criado pelo admin já nasce aprovado.
- **Resultados**: lançar, confirmar/rejeitar, editar e excluir; filtros e
  paginação. Confirmar recalcula e republica **somente o ranking afetado**.
- **Verificação de consistência** (`/admin/verify`): recalcula cada ranking
  a partir dos resultados oficiais com a mesma função de domínio e compara
  com o publicado — só leitura, sob demanda.

**Telegram (100% opcional)** — bot com `/start`, `/ajuda`, `/vincular`,
`/desvincular`, `/ranking` (top 10), `/meus` (últimos 5) e
`/registrar JOGADOR 6-4 7-5`. Sem token configurado, o site funciona
normalmente e a rota do webhook responde 404.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase
(Postgres + Auth + RLS) · CSS global próprio (sem UI kit, sem fontes ou
imagens externas — **zero requisições de terceiros** no navegador).

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
# aplique supabase/migrations/0001..0005 e (opcional) seed.sql no SQL Editor
npm run dev                  # http://localhost:3000
```

Scripts: `npm run dev` · `npm run build` · `npm run typecheck` ·
`npm run demo:seed` / `npm run demo:reset` (massa de teste — ver
[`docs/demo-data.md`](docs/demo-data.md)) ·
`npm run rankings:rebuild` (republica todos os rankings com a configuração
vigente) · `npm run telegram:set-webhook`.

Deploy: `docs/setup.md` (inclui promoção do primeiro administrador,
backup, pausa/reativação do Supabase).

## Arquitetura (resumo)

- **Snapshot do ranking**: o ranking é materializado como JSONB numérico
  (`ranking_snapshots`); nomes são hidratados em blocos de ≤100 ids — sem
  N+1 e sem recálculo por visitante.
- **Páginas públicas estáticas**: não leem cookies nem banco; revalidação
  por `revalidatePath` apenas em escritas oficiais.
- **RLS + chave de service**: jogadores operam sob RLS (e até entre
  autenticados `email`/código do bot são privados — grants de coluna);
  ações administrativas rodam no servidor após `requireAdmin()` com
  `SUPABASE_SERVICE_ROLE_KEY` (nunca no navegador).
- **Escopo de administrador**: `admin_level_id` separa "onde administra" de
  `level_id` ("onde joga"); a checagem é feita em cada server action e
  página (a chave de service ignora RLS, então o escopo é validado no
  servidor, não só escondido na interface).
- **Aprovação de cadastro**: `pending_approval` nasce `true` no trigger
  (inclusive se o cliente tentar forjar metadata) e só o admin o desliga;
  RLS também impede que um cadastro pendente insira resultados direto pela
  API.
- **Sem middleware** para manter as páginas públicas estáticas.
- **Consulta econômica**: colunas explícitas, paginação, `count` na própria
  query, leituras em `Promise.all`.

## Limitações conhecidas (MVP)

- **Duplas/pares não implementadas** — a estrutura (`levels`, `matches`)
  foi deixada extensível para um futuro nível de duplas, mas o par de
  jogadores por resultado não existe hoje.
- **Sem histórico de posições**: só o ranking vigente é publicado (o
  snapshot guarda a data do cálculo); não há notificação de subida/queda.
- **Sem envio de imagem de placar** nem anexos; o placar é textual.
- **Escala protegida**: recálculo limitado a 2.000 jogadores e 10.000
  resultados por nível (proteção de memória da função serverless).
- **Busca por nome** usa `ilike` simples — suficiente para dezenas de
  jogadores; `pg_trgm` é uma evolução documentada.
- **Planos gratuitos têm limites e pausas** (Supabase pausa projetos
  inativos após ~1 semana): leia `docs/free-tier.md` — **nenhum custo é
  garantido como zero**.

## Estrutura

```
src/app/(site)/     páginas públicas estáticas (/, rules, rankings, results)
src/app/login       autenticação (register em src/app/register)
src/app/app/        área do jogador         (/app, /app/results)
src/app/admin/      painel admin            (níveis, jogadores, resultados, verify)
src/actions/        server actions
src/lib/queries/    camada de dados (colunas explícitas, paginação)
src/lib/domain/     regras puras (formato, pontuação, ranking, iniciais)
src/lib/results/    montagem da lista pública de jogos (funções puras)
supabase/migrations schema versionado + RLS
docs/               free-tier, setup, performance, demo-data
```
