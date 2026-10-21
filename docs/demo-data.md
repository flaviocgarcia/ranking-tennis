# Contas de demonstração (E2E)

O projeto não tem mais "massa de teste" com partidas fictícias — os dados
reais do F CHALLENGER vêm da planilha (ver `docs/setup.md`, seção de
importação). Restam **duas contas de demonstração** usadas pelos testes
automatizados (`scripts/smoke-prod.mjs` e `scripts/check-agenda.mjs`):

```bash
npm run demo:seed    # cria/ajusta as contas (idempotente)
npm run demo:reset   # remove SOMENTE as contas demo-*
```

> Requer `.env.local` preenchido (URL + **service role**) e a importação
> já executada (há um nível ativo).

## Acessos

Senha única: **`Demo@12345`**.

| Papel | E-mail | Uso |
|---|---|---|
| **Administrador** | `demo-admin@example.com` | smoke test em `/admin` |
| **Jogador** | `demo-player@example.com` | E2E da agenda (`/app/agenda`) |

Ambas pertencem ao nível F CHALLENGER, estão **ativas e aprovadas**, têm
**0 jogos** e por isso **não aparecem na classificação** (a leitura só
mostra quem tem partida na janela de 12 meses). Elas também ficam fora da
aba de convites — não recebem código de ativação.

## O que o seed cria/ajusta

- Cria a conta (se faltar), redefina a senha para `Demo@12345` e ajusta o
  perfil: nome, iniciais, papel, nível ativo, ativa e aprovada.
- **Não cria partidas, convites nem snapshots** — nunca suja a
  classificação real.

## O que o reset remove

- usuários de Auth cujo e-mail começa com **`demo-`** (e seus perfis, em
  cascata);
- eventuais partidas com `external_ref` começando com **`demo-`**
  (sobras de versões antigas).

Atletas, códigos de ativação, partidas da planilha e a classificação
publicada **não são tocados**.

> **Cache em produção:** o seed/reset mexe só no banco. Em `npm run dev` a
> página pública reflete na hora; num build de produção (Vercel) as páginas
> públicas são estáticas — depois de um `demo:reset` que afete conteúdo
> público, faça um novo deploy ou uma escrita oficial (confirmação de
> resultado) para revalidar.

## Detalhe técnico

Os testes de fato (login, agenda, admin) rodam via Playwright:

```bash
npm run dev                                # local, ou BASE=https://...
node scripts/smoke-prod.mjs                # rotas públicas/privadas + login
node scripts/check-agenda.mjs              # E2E completo da agenda (se limpa)
node scripts/check-pwa.mjs                 # manifesto, SW e cache offline
node scripts/check-tables.mjs              # ordenação/busca em /rankings e /results
node scripts/check-mobile.mjs              # layout e placar em viewport de celular
```
