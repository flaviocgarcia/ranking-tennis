# Massa de teste (demo)

Cria um **superadmin**, um **administrador restrito a um nível**, jogadores e
resultados fictícios completos (níveis, jogadores e partidas) para você testar
o sistema de ponta a ponta — e remove tudo com um comando quando quiser.

```bash
npm run demo:seed    # cria (ou recria) a massa de teste
npm run demo:reset   # remove TUDO que a massa criou
```

> Requer o `.env.local` preenchido (URL + **service role**) e as migrations
> `0001` a `0004` aplicadas.

## Acessos criados pelo seed

Senha única: **`Demo@12345`**.

| Papel | E-mail |
|---|---|
| **Superadmin** (todos os níveis) | `demo-admin@example.com` |
| **Admin restrito ao nível B** (também joga no B) | `demo-admin-b@example.com` |
| Jogadores (18) | `demo-<nome.sobrenome>@example.com` |
| **Auto-cadastro pendente** (nível B) | `demo-pendente@example.com` |

Exemplos de jogador: `demo-rafael.almeida@example.com`,
`demo-diego.nunes@example.com`, `demo-thiago.mendes@example.com`.

Entre em `/login` com o superadmin e vá para `/admin`.

## O que o seed cria

- 1 superadmin (`role = admin`, `admin_level_id` vazio = admin geral).
- 1 **admin de nível** (`demo-admin-b`): administra somente o nível B e
  **também joga** no B — os dois papéis são independentes
  (`admin_level_id` ≠ `level_id`).
- 18 jogadores distribuídos nos níveis ativos **A (6), B (4), C (4), D (4)**,
  todos ativos e com senha já definida (sem troca obrigatória, para o teste
  ser direto). Com o admin do B, são **19 jogadores demo**.
- 1 **cadastro pendente** no nível B (`demo-pendente`), para exercitar a
  aprovação em `/admin/players?pending=1` ou no perfil do jogador.
- **37 partidas confirmadas** (A 15, B 10, C 6, D 6) e **1 partida pendente
  por nível** — para você exercitar a confirmação no painel em
  `/admin/results`.
- Os **rankings já publicados** em `/rankings/a`, `/rankings/b`,
  `/rankings/c` e `/rankings/d`, gerados com a **mesma função de domínio** do
  app (já considerando a pontuação vigente, inclusive o ponto do derrotado no
  tiebreakão).
- A **lista pública de jogos** em `/results` (e `/results/a` …
  `/results/d`) já mostra as 37 confirmadas — as 4 pendentes ficam fora até
  você confirmá-las em `/admin/results`.

Os placares são gerados por um sorteio **determinístico**: rodar o seed duas
vezes produz exatamente a mesma massa.

## Roteiro rápido de teste

1. **Aprovação** — entre como superadmin, abra `/admin` (o contador
   “Aguardando aprovação” mostra 1) e aprove `demo-pendente` em
   `/admin/players?pending=1`. O ranking do nível B é recalculado na hora.
   Antes de aprovar, entre com `demo-pendente` e confirme que `/app` mostra
   “Cadastro em análise”.
2. **Escopo de admin** — saia e entre com `demo-admin-b`:
   - `/admin` mostra “Painel · Nível B”, sem o menu **Níveis**;
   - `/admin/players` e `/admin/results` só têm o nível B;
   - abrir um jogador do nível A em `/admin/players/<id>` resulta em `404`.
3. **Admin jogando** — ainda como `demo-admin-b`, abra “Informar resultado”
   em `/app`: ele aparece como jogador do B e pode reportar partidas.
4. **Pontuação** — a configuração padrão dá **3 pts** ao vencedor de 2×0,
   **2 pts** ao vencedor decidido no tiebreakão e **1 pt** ao derrotado nesse
   tiebreakão (configurável em `/admin/levels/<id>`). Um jogo 2×1 soma, então,
   **2 + 1** pontos. Alterar a regra exige republicar os rankings afetados
   (a ação de salvar o nível já faz isso automaticamente; para todos os
   níveis de uma vez use `npm run rankings:rebuild`).
5. **Consistência** — em `/admin/verify`, clique em “Verificar
   consistência”: deve responder que todos os rankings estão consistentes.

## Por que roda sem medo de sujar dados reais

O `demo:reset` remove apenas:

- usuários de Auth cujo e-mail começa com **`demo-`**;
- partidas com `external_ref` começando com **`demo-`**;
- os snapshots publicados (os rankings públicos voltam ao estado vazio).

Seu administrador real, seus jogadores e seus resultados **não são tocados**.
Também é seguro rodar `demo:seed` repetidas vezes: ele limpa a massa anterior
antes de recriar. Jogadores reais do clube continuam aparecendo no ranking
junto com a massa (por exemplo, um jogador real no nível A deixa o A com 7
participantes em vez de 6).

> **Cache em produção:** o reset/seed limpa e recria dados **no banco** e
> regrava os snapshots. Em `npm run dev` a página pública reflete isso na hora
> (a revalidação acontece na própria requisição). Num build de produção
> (Vercel), as páginas públicas são estáticas: o HTML só muda quando o próximo
> resultado oficial for confirmado/editado, quando o admin publicar, ou num
> novo deploy (`npm run build` lê o banco na geração). Depois de um
> `demo:seed`/`demo:reset` em produção, rode um novo deploy ou faça uma
> escrita oficial para republicar.

## Detalhe técnico

O seed gera os snapshots usando **a mesma função de domínio do app**
(`src/lib/domain/ranking.ts`), compilada na hora para um diretório temporário.
Assim, o que a massa publica é idêntico ao que `/admin/verify` recalcula — se
aparecer qualquer divergência ali, é sinal de problema real, não de massa
inconsistente.

## Ordem do ranking (importante)

O ranking é ordenado **primeiro por pontos**; os critérios configurados
(vitórias → confronto direto → saldo de sets → saldo de games, ou a ordem que
o admin escolher) são aplicados **apenas dentro de cada grupo empatado em
pontos**, exatamente como a tela de configuração descreve.
