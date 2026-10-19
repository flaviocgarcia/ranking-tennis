# Orçamento e validação de desempenho

Este documento atende ao **§10 (orçamento de desempenho/banda)** e ao
**§11 (validação antes da entrega)** do requisito especial. Os números foram
medidos neste repositório; **não são garantias** de comportamento em
produção — refaça a medição após o primeiro deploy real (seção 5).

- Data das medições: **19/10/2026**
- Ambiente: Node 22.23.1, npm 10.9.8, `next build` (Next.js 15.5.28)
- Comandos: `npm run typecheck` · `npm run build` · smoke test com `next start`

## 1. Orçamento (limite aceitável por rota)

| Métrica | Orçamento | Status |
| --- | --- | --- |
| First Load JS por rota | ≤ 200 kB (bruto) | ✅ máximo medido: 176 kB |
| JavaScript compartilhado | ≤ 150 kB | ✅ 103 kB |
| HTML estático por página (gzip) | ≤ 10 kB | ✅ 2,3–5,8 kB (`/results` é o maior: 5,8 kB) |
| Requisições de terceiros no navegador (fontes, CDNs, analytics) | 0 | ✅ 0 (fonte do sistema, SVG próprio) |
| Leituras de banco por view de página pública | 0 (servida do CDN) | ✅ 0 |
| Leituras de banco por renderização dinâmica | ≤ 8 | ✅ máximo: 7 (painel de admin de nível) |
| Requisições HTTP por interação de formulário | 1 (a server action) | ✅ nenhum *fetch* de busca/autocomplete no cliente |
| Rotinas periódicas (cron, ISR por tempo, polling, Realtime) | 0 | ✅ 0 — apenas `revalidatePath` sob demanda |

## 2. Tamanho do JavaScript (saída de `npm run build`)

```
Route (app)                                 Size  First Load JS
┌ ○ /                                      179 B         106 kB
├ ○ /_not-found                            987 B         104 kB
├ ƒ /admin                                 179 B         106 kB
├ ƒ /admin/levels                          820 B         107 kB
├ ƒ /admin/levels/[id]                     123 B         108 kB
├ ƒ /admin/levels/new                      123 B         108 kB
├ ƒ /admin/players                         162 B         106 kB
├ ƒ /admin/players/[id]                    176 B         108 kB
├ ƒ /admin/players/new                     175 B         108 kB
├ ƒ /admin/results                       1.11 kB         107 kB
├ ƒ /admin/results/[id]                  2.24 kB         108 kB
├ ƒ /admin/results/new                   2.24 kB         108 kB
├ ƒ /admin/verify                        1.08 kB         107 kB
├ ƒ /api/telegram                          127 B         103 kB
├ ƒ /app                                   179 B         106 kB
├ ƒ /app/results                           781 B         107 kB
├ ƒ /app/results/new                     2.24 kB         108 kB
├ ○ /icon.svg                                0 B            0 B
├ ○ /login                               1.09 kB         175 kB
├ ƒ /profile                             1.75 kB         176 kB
├ ○ /rankings                              179 B         106 kB
├ ● /rankings/[slug]                       179 B         106 kB
├ ○ /register                            1.89 kB         176 kB
├ ○ /results                               179 B         106 kB
├ ● /results/[slug]                        179 B         106 kB
└ ○ /rules                                 127 B         103 kB
+ First Load JS shared by all             103 kB
```

Leitura:

- **Páginas públicas**: 103–106 kB — as mais leves, pois não carregam o
  cliente de Auth.
- **`/login`, `/register`, `/profile`**: 175–176 kB — o excedente (~70 kB) é
  o `@supabase/supabase-js` no navegador, necessário para autenticação. É o
  maior custo do app e está restrito às rotas de auth/perfil.
- **Área administrativa**: 106–108 kB; os maiores custos individuais
  (`2.24 kB`) são os formulários de resultado com validação no cliente.
- Tamanho do HTML gerado (estático, bruto / gzip): `/` 13,2 kB / 3,2 kB ·
  `/rules` 14,9 kB / 3,1 kB · `/rankings` 11,9 kB / 2,8 kB ·
  `/results` 47,8 kB / 5,8 kB (37 partidas) · `/results/a` 23,8 kB /
  4,1 kB · `/login` 7,0 kB / 2,3 kB · `/register` 8,3 kB / 2,8 kB. Tudo
  dentro do orçamento da seção 1.

## 3. Leituras de banco por rota (1ª renderização)

Contagem de requisições PostgREST por renderização (a chamada
`auth.getUser()` é listada à parte). `cache()` do React deduplica a leitura
de sessão entre layout e página.

| Rota | Tipo | Consultas | Detalhe |
| --- | --- | --- | --- |
| `/` | estática | 0 | nenhuma leitura |
| `/rules` | estática | 1 | níveis públicos |
| `/rankings` | estática | 2 | níveis + metadados de snapshot |
| `/rankings/[slug]` | SSG | 3 + ⌈n/100⌉ | nível (metadata + página) + snapshot + hidratação de nomes em blocos de 100 |
| `/results` | estática | 2 + ⌈n/100⌉ | níveis + partidas confirmadas (≤60 mais recentes) + hidratação de nomes |
| `/results/[slug]` | SSG | 3 + ⌈n/100⌉ | nível (metadata + página) + partidas do nível (≤500) + hidratação |
| `/login` | estática | 0 | Auth só no navegador |
| `/register` | estática | 1 | níveis públicos, lidos no build (a lista de níveis muda pouco) |
| `/app` | dinâmica | 5 | sessão + nível + snapshot + recentes + hidratação (≤6 ids = 1 bloco) |
| `/app/results` | dinâmica | 2 | sessão + lista paginada com `count:"exact"` na mesma query |
| `/app/results/new` | dinâmica | 3 | sessão + nível + adversários do nível |
| `/profile` | dinâmica | 2 (+1) | sessão + nível; +1 lê o código de vínculo via service key |
| `/admin` | dinâmica | 6 (7 com escopo) | sessão + 3 contagens de resultados + jogadores ativos aprovados + cadastros pendentes; admin de nível soma a leitura do nome do nível e filtra tudo pelo escopo |
| `/admin/levels` | dinâmica | 3 | sessão + níveis + metadados de snapshot |
| `/admin/levels/new` | dinâmica | 1 | só sessão |
| `/admin/levels/[id]` | dinâmica | 2 | sessão + nível |
| `/admin/players` | dinâmica | 3 | sessão + níveis + página com `count:"exact"` (chave de service) |
| `/admin/players/new` | dinâmica | 2 | sessão + níveis |
| `/admin/players/[id]` | dinâmica | 3 | sessão + perfil (chave de service) + níveis |
| `/admin/results` | dinâmica | 3 | sessão + níveis + página com `count:"exact"` |
| `/admin/results/new` | dinâmica | 3 | sessão + níveis + jogadores ativos |
| `/admin/results/[id]` | dinâmica | 5 + m | + perfis dos lados inativos (m = 0–2) |
| `/admin/verify` | dinâmica | 1 | só sessão; o recálculo roda somente após clique |

Rotas dinâmicas somam **+1** chamada ao Auth (`getUser`).

**Rebuild do ranking** (`rebuildRankingSnapshot`, por escrita oficial): 3
leituras (nível, jogadores ativos **aprovados**, resultados confirmados) + 1
upsert — constante, sem N+1, independente do número de jogadores. Só executa
em: confirmar/editar/excluir resultado afetado, alterar configuração do nível,
ativar/desativar ou mudar o nível de um jogador, **aprovar um auto-cadastro** e
no botão "Publicar".

**Verificação de consistência** (§5): `1 + 3 × nº de níveis`, somente sob
demanda, clicando em "Verificar consistência"; nunca em renderização. Admin de
nível verifica apenas o próprio nível (`1 + 3`).

## 4. Estratégia que mantém o consumo baixo

1. **Páginas públicas estáticas** (`○`/`●` no build): nenhum cookie lido,
   nenhum acesso a banco por visitante; servidas pelo CDN da Vercel.
2. **Revalidação sob demanda**: `revalidatePath("/rankings",
   "/rankings/[slug]", "/results", "/results/[slug]", "/rules",
   "/register")` — resultados/ranking via `revalidateLevelPages()`, regras e
   cadastro via `revalidatePublic()` — apenas após escrita administrativa
   oficial ou publicação manual. Sem cron, sem ISR por tempo, sem polling,
   sem Realtime.
3. **Snapshot numérico do ranking**: a página lê um documento JSONB; nomes
   são hidratados em blocos de **≤100 ids por consulta** (nunca 1 por
   linha).
4. **Colunas explícitas + paginação** em todas as consultas; `count` vem da
   própria query (`count: "exact"`), não de uma consulta separada.
5. **Zero chamadas de rede no navegador além da própria página**: `<select>`
   de adversários/níveis é renderizado no servidor; sem autocomplete,
   sem fontes externas, sem analytics de terceiros.
6. **Escopo de admin sem custo nas páginas públicas**: o escopo
   (`admin_level_id`) é lido apenas no perfil de quem entra em `/admin`;
   as páginas estáticas continuam iguais para todos os visitantes.
7. **Pendentes fora do caminho quente**: o filtro `pending_approval = false`
   entra nos índices/consultas do snapshot e das listas, de modo que um
   auto-cadastro não aprovado não gera ranking nem aparece para outros
   jogadores.

## 5. Validação antes da entrega (§11)

Executado em 19/10/2026 neste repositório:

| Etapa | Comando | Resultado |
| --- | --- | --- |
| Tipos | `npm run typecheck` (`tsc --noEmit`) | ✅ sem erros |
| Build de produção | `npm run build` em cópia isolada (sem `dev` concorrente) | ✅ 30 rotas/páginas; públicas `○`/`●`, privadas `ƒ` |
| Smoke test local | `next start` + `curl` em `/`, `/rules`, `/rankings`, `/rankings/[a-d]`, `/results`, `/results/[a-d]`, `/login`, `/register`, `/app`, `/admin`, `/profile`, `/api/telegram` | ✅ públicas/`login`/`register` `200`; privadas `307 → /login`; `POST /api/telegram` → `404` (desligado sem env) |
| Cache das públicas | headers de `/results` | ✅ `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000` |
| Privacidade da lista pública | REST como anon (`/matches?select=...`) | ✅ `status=eq.pending` → 0 linhas; `reported_by`/`source`/`external_ref` → `401 permission denied`; `profiles.email` → `42501` |
| Privacidade da lista pública | HTML público de `/rankings/b` e `/results/b` | ✅ 0 ocorrências do cadastro pendente |
| Auto-cadastro pendente | login `demo-pendente` em `/app` e `/app/results/new` | ✅ telas de “Cadastro em análise”/“aguarda aprovação”; POST REST de partida → `42501` (RLS) |
| Trigger de novo usuário | `auth.admin.createUser` com metadata `level_id` + `role: admin` | ✅ nível aplicado, `role` ignorado (continua `player`), `pending_approval = true` |
| Aprovação pelo admin | formulário em `/admin/players?pending=1` | ✅ `pending_approval` vira `false`, ranking do nível é recalculado/republicado na hora |
| Escopo de admin | login `demo-admin-b` em `/admin`, `/admin/levels`, `/admin/players` | ✅ “Painel · Nível B”, `/admin/levels` → `307 /admin`, jogador do nível A → `404`, listas só do B |
| Pontuação do tiebreakão | `computeRanking` com placar 2×1 | ✅ vencedor 2 / derrotado 1; com a opção desligada: 2 / 0; 2×0: 3 / 0 |
| Consistência dos snapshots | recálculo A–D comparado ao snapshot (`/admin/verify`) | ✅ A, B, C e D “Consistente”, 0 placar inválido |
| Webhook sem env | `POST /api/telegram` | ✅ `404` (desligado por padrão) |
| Classes CSS usadas vs. definidas | varredura `className` × `globals.css` | ✅ nenhuma classe órfã |
| Docs obrigatórios | `docs/free-tier.md`, `docs/setup.md`, `docs/performance.md`, `docs/demo-data.md` | ✅ presentes e atualizados |

Checklist de entrega:

- [x] Orçamento definido (seção 1) e medições anexadas (seções 2–3).
- [x] Nenhuma rotina periódica de atualização (cron/polling/Realtime/ISR por tempo).
- [x] Páginas públicas permanecem estáticas em produção (sem `cookies()`/`headers()`).
- [x] Consultas com colunas explícitas, paginação e `count` na própria query.
- [x] Sem dependências de UI externas nem requisições de terceiros.
- [x] Limites de faixa gratuita consultados nas fontes oficiais (`docs/free-tier.md`).
- [x] Roteiro de deploy, backup e reativação documentado (`docs/setup.md`).
- [ ] **Pós-deploy real**: medir na Vercel (Observability → Functions/Edge
      Requests) e no Supabase (Organization → Usage) e comparar com a
      seção 1. Os números desta página são de build local.

## 6. Se algo estourar o orçamento

| Sintoma | Ação |
| --- | --- |
| First Load JS > 200 kB | revisar imports de cliente (evitar importar servidor/cliente no mesmo módulo); checar se alguma lib nova entrou em `package.json` |
| Consultas > 8 por render dinâmica | conferir `src/lib/queries/*` por loop ou consulta fora de `Promise.all` |
| Banda da Vercel crescendo | verificar se alguma rota pública virou dinâmica (build deve continuar mostrando `○`/`●`) |
| Egress do Supabase crescendo | revisar paginação e colunas; checar `hydrateNames` (blocos ≤ 100) |
