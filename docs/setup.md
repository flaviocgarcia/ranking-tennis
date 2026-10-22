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
      administrador por nível (`admin_level_id`), aprovação de cadastro
      (`pending_approval`), trigger atualizado e RLS que impede cadastro
      pendente de inserir resultados.
   5. `supabase/migrations/0005_availability.sql` — **agenda de
      disponibilidade** (`availability`): uma marca por jogador por data
      (upsert), leitura pública mínima, escrita apenas do próprio jogador e
      nenhuma rotina periódica.
   6. `supabase/migrations/0006_challenger.sql` — **F CHALLENGER**:
      `matches.format` (`normal`/`grand_slam`/`walkover`) +
      `walkover_winner`, e a tabela `invites` (pré-cadastro dos atletas com
      **código de ativação** — tabela privada, só `service_role`).
   7. `supabase/migrations/0007_invites_activated_at.sql` — separa
      "conta pré-criada" de "ativação concluída" (`invites.activated_at`).
   8. `supabase/migrations/0008_ref_level.sql` — `profiles.ref_level`
      (nível A–D do atleta, etiqueta da planilha — só o admin edita),
      backfill a partir dos convites e política pública que esconde
      cadastros pendentes de aprovação.
4. Confirme em **Table Editor** que as 6 tabelas existem (`levels`,
   `profiles`, `matches`, `ranking_snapshots`, `availability`, `invites`) e
   que **Authentication → Providers → Email** está ativo.
5. Em **Authentication → URL Configuration**, aponte o Auth para o domínio
   definitivo do app:
   - **Site URL**: `https://seu-app.vercel.app`;
   - **Redirect URLs**: `https://seu-app.vercel.app/**`.

   O app não usa confirmação de e-mail por link (`email_confirm: true` no
   servidor), mas links gerados pelo Supabase — recuperação de senha — usam
   a Site URL.

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
- **Grants de coluna**: não existe auto-cadastro aberto — os atletas são
  pré-cadastrados e ativados por **código**. Ainda assim "autenticado" não
  é "membro do torneio": `email` e `telegram_link_code` são privados — só a
  chave de service (painel `/admin/players`, `/profile` e bot) os lê.
  Jogadores entre si veem apenas `id, nome, iniciais, nível, situação`;
  o público (anon) vê apenas `id, nome, iniciais` de jogadores ativos
  (é o que a classificação exibe). UPDATE de perfil é restrito a
  `name`, `initials`, `must_change_password`, `telegram_*` — ninguém
  altera `role`/`level_id`/`active` por RLS.
- **`invites` é tabela privada**: nenhuma leitura para `anon`/
  `authenticated` (o código de ativação é credencial) — só a server action
  com chave de service a toca.
- Toda ação administrativa roda **no servidor**, após `requireAdmin()`,
  usando `SUPABASE_SERVICE_ROLE_KEY` (que **bypassa RLS** e jamais vai para
  o navegador — não usa prefixo `NEXT_PUBLIC_`).
- **Administrador com escopo de nível**: `admin_level_id` vazio = geral;
  preenchido = administra somente aquele nível (jogadores, resultados e
  verificação). O nível em que joga (`level_id`) é independente — o admin
  pode jogar no próprio nível. Como as escritas usam a chave de service, o
  escopo é validado **no servidor** em cada ação/página, não apenas
  escondido na interface.
- **Auto-cadastro não existe** — o antigo `/register` redireciona para
  `/ativar`. O trigger continua gravando `pending_approval = true` para
  todo usuário novo (não confia em metadata do cliente); quem é criado pela
  importação ou pelo administrador tem `false` gravado em seguida, no
  servidor. A função `is_approved()` + política de INSERT em `matches`
  impedem que um cadastro pendente informe resultados mesmo chamando a API
  REST diretamente.
- Toda escrita que muda um ranking (resultado oficial, jogador
  ativo/nível/aprovação, configuração) **recalcula e revalida** na mesma
  operação — o snapshot nunca fica divergente do recálculo
  (`/admin/verify` checa).

### Importação da planilha F CHALLENGER (wipe total)

O torneio é importado de `F CHALLENGER R25.xlsx` (aba de origem: a pasta
`Downloads` de quem opera). **Apaga todos os dados** (partidas, perfis,
convites, snapshots, níveis e todos os usuários do Auth — exceto a conta
`flaviocgarcia@gmail.com`) e recria o mundo F CHALLENGER:

```bash
npm run fch:export               # xlsx -> /tmp/opencode/fchallenger.json
npm run fch:import -- --yes      # WIPE + importação (irreversível)
```

O que o import faz (detalhe em `scripts/reset-and-import.mjs`):

1. cria o nível **F CHALLENGER** (`slug: challenger`);
2. cria os **51 atletas** com **conta placeholder** (e-mail provisório
   `@fch.example.com`, senha desconhecida) já vinculada ao convite —
   necessário porque os 84 jogos históricos exigem perfil dos dois lados;
   ninguém entra nessas contas: o atleta define **e-mail + senha** em
   `/ativar` com o código;
3. recria o perfil do **Flavio Garcia como administrador** (conta Auth
   preservada) e marca o convite dele como ativado;
4. importa as **84 partidas** (todas confirmadas; o exportador corrige 3
   erros de digitação e 2 datas com ano errado);
5. cria as contas demo E2E (`demo:seed` é o mesmo conjunto);
6. calcula e publica o snapshot **com o mesmo motor do app** e confere o
   recálculo contra o RANKING oficial da planilha (esperado: 37/38
   idênticos — RODRIGO MEINCKE difere porque o ranking oficial da planilha
   está defasado; decisão: recalcular pelas regras);
7. grava os **códigos de ativação** dos 51 atletas em
   `/tmp/opencode/fchallenger_codigos.txt` (dado pessoal — fora do
   repositório, como o JSON).

O exportador (`scripts/export_fchallenger.py`, `python3.10` + `openpyxl`)
também valida os dados: placares sem vencedor, datas fora do período e
divergências de pontos saem no relatório — em caso de problema ele termina
com código de erro.

## 2. Primeiro administrador

Na prática o F CHALLENGER já nasce com administrador: a importação
(`fch:import`) **preserva a conta `flaviocgarcia@gmail.com`** e recria o
perfil dela como `admin` geral. Para um projeto novo sem importação:

1. No **Supabase → Authentication → Users → Add user**, crie a conta com
   e-mail e senha (marque *Auto Confirm*). O trigger cria o perfil
   automaticamente (nível ativo, `pending_approval = true`).
2. No **SQL Editor**, promova e aprove:

```sql
update public.profiles
set role = 'admin',
    pending_approval = false,
    updated_at = now()
where email = 'seu-email@exemplo.com';
```

3. Faça login em `/login` — o menu administrativo (`/admin`) aparece.
4. Recomendado: **Authentication → Settings** — defina *Secure email
   change* e limite de envios.

> Para mais administradores, use `/admin/players/new` com o perfil
> **Administrador**. Não existe mais auto-cadastro público: quem não tem
> conta recebe um **código de ativação**.

### Conta de jogadores (os dois caminhos)

- **Ativação por código** (caminho principal): gere o convite em
  `/admin/convites` (nome, telefone, nível de referência da planilha) e
  envie o código de 8 caracteres por WhatsApp. O atleta entra em
  `/ativar`, digita o código (etapa 1 mostra o nome dele), escolhe
  **e-mail + senha** (etapa 2) e a conta nasce **aprovada**, com login
  automático. O código é de uso único; o admin pode regerar um código não
  ativado em `/admin/convites`.
- **Pelo administrador**: `/admin/players/new` → gera senha temporária
  exibida **uma única vez** → jogador entra e é obrigado a trocar a senha
  (`must_change_password`). Já nasce **aprovado**.
- Ao ativar/criar, a classificação é recalculada e republicada na hora.

### Atalho para testes: contas demo

```bash
npm run demo:seed     # cria/ajusta demo-admin + demo-player (0 jogos)
npm run demo:reset    # remove SOMENTE os dados demo
```

Acessos: **`demo-admin@example.com`** e **`demo-player@example.com`**,
senha **`Demo@12345`**. Remover nunca afeta dados reais. Detalhes:
[`docs/demo-data.md`](demo-data.md).

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` (local) e configure na Vercel
(**Project → Settings → Environment Variables**):

| Variável | Obrigatória | Conteúdo |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | `https://<projeto>.supabase.co` (Supabase → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | sim* | `service_role` key (*necessária para criar/editar usuários pelo painel e para o bot) |
| `NEXT_PUBLIC_SITE_URL` | sim | `https://seu-app.vercel.app` (usada no webhook do Telegram) |
| `NEXT_PUBLIC_CLUB_NAME` | não | nome exibido no site (ex.: `F CHALLENGER`) |
| `TELEGRAM_BOT_TOKEN` | não | token do @BotFather (sistema funciona sem) |
| `TELEGRAM_WEBHOOK_SECRET` | não | segredo aleatório longo para o header do webhook |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | não | chave pública VAPID das notificações push (sistema funciona sem) |
| `VAPID_PRIVATE_KEY` | não | chave privada VAPID (pareada com a pública; nunca no navegador) |
| `VAPID_SUBJECT` | não | contato do responsável: `mailto:email@dominio.com` |

As chaves VAPID das notificações push geram-se com
`npx web-push generate-vapid-keys` (a pública é exposta ao navegador
por definição; a privada fica só no servidor).

No Supabase, adicione o domínio da Vercel em **Authentication → URL
Configuration → Redirect URLs**: `https://seu-app.vercel.app/**`.

## 4. Deploy na Vercel

1. Envie o repositório para o GitHub/GitLab.
2. Em **Vercel → Add New → Project**, importe o repositório (framework
   detectado: Next.js — nenhum ajuste de build necessário).
3. Preencha as variáveis da seção 3 e clique em **Deploy**.
4. Após o primeiro deploy: defina `NEXT_PUBLIC_SITE_URL` como o domínio
   final e redeploy (ou atualize a variável e faça *Redeploy*).
5. Smoke test pós-deploy: `/`, `/rules`, `/rankings` e
   `/rankings/challenger`, `/results` (200 e sem erros; nomes dos
   atletas visíveis, distintivos Grand Slam/W.O. e **nenhum jogo
   pendente** na lista); `/login` entra e sai; `/ativar` valida um código
   qualquer de teste; `/app` redireciona para `/login` sem sessão;
   `/admin` só acessível com sessão admin; `/admin/players` lista com
   e-mails e `/profile` mostra e-mail + código de vínculo (**exigem
   `SUPABASE_SERVICE_ROLE_KEY`** — sem ela aparece o aviso amigável).
   Automatizado: `node scripts/smoke-prod.mjs`.
6. Verificação de privacidade (sem sessão, em terminal):
   ```bash
   curl -s "https://SEU-PROJETO.supabase.co/rest/v1/profiles?select=email" \
     -H "apikey: ANON_KEY" | head -c 300
   ```
   Esperado: erro/colunas não expostas — `email` e `telegram_link_code`
   **não** devem sair para a anon key.

Localmente: `npm install`, `cp .env.example .env.local`, `npm run dev`.

## 5. Publicação e verificação da classificação

- A classificação é recalculada **automaticamente** quando um resultado é
  confirmado/editado/excluído, um jogador é ativado/desativado ou um
  convite é usado; as páginas públicas são revalidadas na mesma operação.
- A **janela de 12 meses** é aplicada na leitura (`revalidate = 3600` nas
  páginas de classificação): pontos caducam sozinhos, sem nenhum rebuild.
- Para republicar à mão (ex.: depois de mudança de regra em
  `src/lib/domain/challenger.ts`): `npm run rankings:rebuild`.
- **`/admin/verify`** confere, sob demanda, se a classificação publicada
  bate com o recálculo a partir dos resultados oficiais — sem alterar nada.
- As regras em si (formatos, pontuação, limite por semestre, janela)
  vivem em `src/lib/domain/challenger.ts` e estão descritas em `/rules`;
  não há tela de configuração de níveis (o torneio é único).

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
3. **Planilha pronta pelo painel** — Admin → **Exportar planilha** (ou
   `/admin/results/export`): baixa um CSV com **todos os resultados
   confirmados** do escopo do administrador, já com vencedor, perdedor,
   sets e **pontos atribuídos a cada jogador** (a mesma regra do ranking),
   além da origem e das datas de confirmação. Abre direto no Excel/Google
   Sheets (BOM UTF-8 + separador `;`). O download exige sessão de
   administrador — jogadores comuns são redirecionados.
4. Guarde o arquivo fora do Supabase (o Free não retém histórico).

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
