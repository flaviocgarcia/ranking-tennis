# Guia de implantação (setup)

Passo a passo para colocar o ranking no ar com **Supabase Free** e
**Vercel Hobby**, incluindo primeiro administrador, Telegram, backup e
reativação após pausa. Custos e limites: `docs/free-tier.md`.

> Lembrete: faixa gratuita **não significa custo garantido** — revise os
> limites oficiais antes de eventos grandes.

## 0. Requisitos

- Conta gratuita em <https://supabase.com> e <https://vercel.com>
- Node.js 22+ e npm 10+ (`node -v`)
- Git (repositório publicado — a Vercel publica a partir do Git)

## 1. Estrutura do banco (Supabase)

1. Crie o projeto em **Supabase → New project** (plano Free, região perto
   do clube).
2. Aguarde o provisionamento e abra **SQL Editor**.
3. Execute, **nesta ordem**, os arquivos do repositório:
   1. `supabase/migrations/0001_initial.sql` — tabelas (`levels`,
      `profiles`, `matches`, `ranking_snapshots`), índices, trigger de
      novo usuário, `is_admin()` e grants.
   2. `supabase/migrations/0002_rls.sql` — políticas de Row Level Security.
   3. `supabase/migrations/0003_public_results.sql` — leitura pública da
      **lista de jogos**: colunas mínimas e **somente resultados
      confirmados** (pendentes/rejeitados continuam privados; `reported_by`,
      `source` e `external_ref` ficam fora do alcance do anon).
   4. `supabase/migrations/0004_admin_scope_and_approval.sql` — escopo de
      administrador por nível (`admin_level_id`), aprovação de auto-cadastro
      (`pending_approval`), trigger atualizado (nível escolhido no cadastro
      + cadastro sempre pendente) e RLS que impede cadastro pendente de
      inserir resultados.
   5. `supabase/seed.sql` *(opcional)* — cria os níveis iniciais **A, B,
      C, D** com a configuração padrão (2 sets + tiebreakão de 10 pts;
      3/2/0 pontos, com 1 ponto para o derrotado no tiebreakão; desempate:
      vitórias → confronto direto → saldo de sets → saldo de games).
4. Confirme em **Table Editor** que as 4 tabelas existem e que
   **Authentication → Providers → Email** está ativo.

Alternativa com CLI (opcional): `supabase link --project-ref <ref>` e
`supabase db push` (mantém as migrations versionadas — recomendado para
alterações futuras; no primeiro envio, aplique os arquivos manualmente como
acima e depois migre para o CLI).

### Decisões de segurança já embutidas

- **RLS ligado em todas as tabelas**; leitura pública apenas de níveis
  ativos, do snapshot publicado e dos **resultados confirmados** (nº
  mínimo de colunas — ver migration 0003).
- O trigger de novo usuário **nunca aceita papel (`role`) vindo do
  cliente** — administrador é atribuído somente no servidor (ação com
  chave de service).
- **Grants de coluna**: o auto-cadastro é aberto, então "autenticado" não
  é "membro do clube". `email` e `telegram_link_code` são privados — só a
  chave de service (painel `/admin/players`, `/profile` e bot) os lê.
  Jogadores entre si veem apenas `id, nome, iniciais, nível, situação`;
  o público (anon) vê apenas `id, nome, iniciais` de jogadores ativos
  (é o que o ranking exibe). UPDATE de perfil é restrito a
  `name`, `initials`, `must_change_password`, `telegram_*` — ninguém
  altera `role`/`level_id`/`active` por RLS.
- Toda ação administrativa roda **no servidor**, após `requireAdmin()`,
  usando `SUPABASE_SERVICE_ROLE_KEY` (que **bypassa RLS** e jamais vai para
  o navegador — não usa prefixo `NEXT_PUBLIC_`).
- **Administrador com escopo de nível**: `admin_level_id` vazio = geral;
  preenchido = administra somente aquele nível (jogadores, resultados e
  verificação). O nível em que joga (`level_id`) é independente — o admin
  pode jogar no próprio nível. Como as escritas usam a chave de service, o
  escopo é validado **no servidor** em cada ação/página, não apenas
  escondido na interface.
- **Auto-cadastro pendente**: o trigger grava `pending_approval = true`
  para todo usuário novo (não confia em metadata do cliente); criado pelo
  administrador, a própria ação marca `false` na sequência. A função
  `is_approved()` + política de INSERT em `matches` impedem que um cadastro
  pendente informe resultados mesmo chamando a API REST diretamente.
- Toda escrita que muda um ranking (resultado oficial, jogador
  ativo/nível/aprovação, configuração) **recalcula e revalida** na mesma
  operação — o snapshot nunca fica divergente do recálculo
  (`/admin/verify` checa).

## 2. Primeiro administrador

1. Acesse `https://seu-app.vercel.app/register` (ou local
   `http://localhost:3000/register`) e crie a conta com **seu e-mail**,
   escolhendo o nível em que você joga. O cadastro nasce **pendente de
   aprovação**.
2. Depois, no **SQL Editor do Supabase**, promova e aprove a conta:

```sql
update public.profiles
set role = 'admin',
    pending_approval = false,
    updated_at = now()
where email = 'seu-email@exemplo.com';
```

3. Faça login em `/login` — o menu administrativo (`/admin`) aparece.
4. Recomendado: **Authentication → Settings** — defina *Secure email
   change* e limite de envios; no plano Free há limite de e-mails/hora no
   cadastro com confirmação. Se o clube for pequeno e o primeiro admin já
   existir, considere criar os demais jogadores pelo painel
   (`/admin/players/new`) — eles recebem **senha temporária** e definem a
   própria senha no primeiro acesso (sem dependência do e-mail de
   confirmação).

> Para mais administradores, use `/admin/players/new` com o perfil
> **Administrador**. Deixe o *escopo* vazio para admin geral ou escolha um
> nível para um admin restrito. O mesmo formulário define o nível em que
> ele **joga** (pode ser o mesmo do escopo).

### Cadastro de jogadores (os dois caminhos)

- **Pelo administrador** (recomendado): `/admin/players/new` → gera
  senha temporária exibida **uma única vez** → jogador entra e é obrigado
  a trocar a senha (`must_change_password`). Já nasce **aprovado**.
- **Auto-cadastro**: qualquer pessoa em `/register` escolhe o nível e cria
  a conta; ela entra como **pendente** e não aparece no ranking nem pode
  informar resultados até o administrador aprovar em
  `/admin/players?pending=1` (ou no próprio perfil do jogador). O nível
  escolhido é validado no banco; o admin pode ajustá-lo depois.
- Ao aprovar, o ranking do nível é recalculado e republicado na hora.

### Atalho para testes: massa de dados demo

Para testar tudo (admin, jogadores, resultados e rankings publicados) sem
cadastrar nada na mão:

```bash
npm run demo:seed     # cria superadmin + admin de nível + 19 jogadores + 41 partidas
npm run demo:reset    # remove SOMENTE os dados demo
```

Acesso criado: **`demo-admin@example.com`** / senha **`Demo@12345`**
(superadmin). Também são criados **`demo-admin-b@example.com`** (admin
somente do nível B, que também joga nele) e **`demo-pendente@example.com`**
(auto-cadastro pendente, para testar a aprovação). Remover nunca afeta
dados reais. Detalhes: [`docs/demo-data.md`](demo-data.md).

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` (local) e configure na Vercel
(**Project → Settings → Environment Variables**):

| Variável | Obrigatória | Conteúdo |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | `https://<projeto>.supabase.co` (Supabase → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | sim* | `service_role` key (*necessária para criar/editar usuários pelo painel e para o bot) |
| `NEXT_PUBLIC_SITE_URL` | sim | `https://seu-app.vercel.app` (usada no webhook do Telegram) |
| `NEXT_PUBLIC_CLUB_NAME` | não | nome exibido no site |
| `TELEGRAM_BOT_TOKEN` | não | token do @BotFather (sistema funciona sem) |
| `TELEGRAM_WEBHOOK_SECRET` | não | segredo aleatório longo para o header do webhook |

No Supabase, adicione o domínio da Vercel em **Authentication → URL
Configuration → Redirect URLs**: `https://seu-app.vercel.app/**`.

## 4. Deploy na Vercel

1. Envie o repositório para o GitHub/GitLab.
2. Em **Vercel → Add New → Project**, importe o repositório (framework
   detectado: Next.js — nenhum ajuste de build necessário).
3. Preencha as variáveis da seção 3 e clique em **Deploy**.
4. Após o primeiro deploy: defina `NEXT_PUBLIC_SITE_URL` como o domínio
   final e redeploy (ou atualize a variável e faça *Redeploy*).
5. Smoke test pós-deploy: `/`, `/rules`, `/rankings`, `/results` (200 e
   sem erros; nomes dos jogadores visíveis e **nenhum jogo pendente** na
   lista); `/login` entra e sai; `/app`
   redireciona para `/login` sem sessão; `/admin` só acessível com sessão
   admin; `/admin/players` lista com e-mails e `/profile` mostra
   e-mail + código de vínculo (**exigem `SUPABASE_SERVICE_ROLE_KEY`** —
   sem ela aparece o aviso amigável).
6. Verificação de privacidade (sem sessão, em terminal):
   ```bash
   curl -s "https://SEU-PROJETO.supabase.co/rest/v1/profiles?select=email" \
     -H "apikey: ANON_KEY" | head -c 300
   ```
   Esperado: erro/colunas não expostas — `email` e `telegram_link_code`
   **não** devem sair para a anon key.

Localmente: `npm install`, `cp .env.example .env.local`, `npm run dev`.

## 5. Publicação e verificação do ranking

- O ranking é recalculado **automaticamente** quando um resultado é
  confirmado/editado/excluído, a configuração do nível muda, um jogador é
  ativado/desativado/muda de nível ou um **auto-cadastro é aprovado**; as
  páginas públicas são revalidadas na mesma operação.
- Botão **"Publicar"** em `/admin/levels` recalcula e republica à mão.
  Para republicar **todos** os níveis depois de uma mudança de regra:
  `npm run rankings:rebuild`.
- **`/admin/verify`** confere, sob demanda, se o ranking publicado bate
  com o recálculo a partir dos resultados oficiais (§5) — sem alterar
  nada. Admin de nível verifica apenas o próprio nível.
- Trocar a configuração: `/admin/levels/[id]` (formato: sets, tiebreakão,
  pontuação — inclusive **ponto do derrotado no tiebreakão**, ligado por
  padrão — e **ordem dos critérios de desempate**).

## 6. Telegram (opcional)

1. Com o app do Telegram, fale com **@BotFather** → `/newbot` → copie o
   token.
2. Gere um segredo longo (ex.: `openssl rand -hex 32`) — será o
   `TELEGRAM_WEBHOOK_SECRET`.
3. Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` e
   `NEXT_PUBLIC_SITE_URL` (local e/ou Vercel) e registre o webhook:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
NEXT_PUBLIC_SITE_URL=https://seu-app.vercel.app \
npm run telegram:set-webhook
```

   ou com curl:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://seu-app.vercel.app/api/telegram","secret_token":"<SEGREDO>"}'
```

4. Cada jogador envia `/vincular <CÓDIGO>` no bot (código em `/profile`).
   Comandos: `/start`, `/ajuda`, `/vincular`, `/desvincular`, `/ranking`,
   `/meus`, `/registrar JOGADOR 6-4 7-5`.
5. Sem token/segredo configurados, a rota `/api/telegram` responde **404**
   e nada muda no site. Para desligar: remova as envs e/ou
   `deleteWebhook`.

## 7. Backup e exportação (obrigatório no Free)

O plano Free **não tem backups automáticos**. Rotina sugerida (mensal):

1. **Dump completo** — Supabase CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db dump --file backup-$(date +%Y-%m).sql
   ```
   Alternativa sem CLI: **Database → Backups (manual)** no dashboard
   (verifique a disponibilidade na sua conta) ou `pg_dump` com a
   *connection string* (Session pooler) e senha do banco.
2. **CSV das tabelas do negócio** — SQL Editor:
   ```sql
   copy (select * from public.matches order by played_on) to stdout with csv header;
   copy (select * from public.levels) to stdout with csv header;
   copy (select id, email, name, initials, role, level_id, active from public.profiles) to stdout with csv header;
   copy (select * from public.ranking_snapshots) to stdout with csv header;
   ```
3. Guarde o arquivo fora do Supabase (o Free não retém histórico).

## 8. Pausa por inatividade e reativação

- Projetos Free são **pausados após ~1 semana sem atividade** (limites:
  `docs/free-tier.md`).
- Durante a pausa o site público passa a exibir o *fallback* amigável
  (as páginas continuam no ar, sem dados) e o login não funciona.
- **Reativar**: Supabase → dashboard → projeto pausado → **Restore/
  Reactivate** (grátis). Pode levar alguns minutos; nenhuma ação extra no
  código.
- Dica: um acesso ao painel/SQL Editor evita a pausa por longos períodos
  de offseason.

## 9. Operação e limites conhecidos

- **Migrations versionadas**: toda alteração de banco entra como
  `supabase/migrations/000N_descricao.sql` e é aplicada no SQL Editor (ou
  via `supabase db push`).
- **Sem cron/polling/Realtime**: nada roda periodicamente; atualização é
  sob demanda (escrita + `revalidatePath`).
- **Rate limit do Telegram**: uma requisição por mensagem recebida;
  deduplicação por `external_ref` (índice único parcial) evita duplicar
  resultado se o Telegram reentregar a mensagem.
- **Limites de escala do MVP**: até ~2.000 jogadores e ~10.000 resultados
  por ranking em memória no recálculo (proteção de memória da função);
  `pg_trgm` para busca por nome pode ser avaliado se o clube crescer
  (ver `docs/free-tier.md`).
- Faça `npm run typecheck` e `npm run build` antes de cada push.
