# Faixa gratuita (Vercel Hobby + Supabase Free)

> **Aviso importante:** nenhum custo é **garantido**. Os valores abaixo são
> limites publicados pelas plataformas em outubro/2026 e podem mudar; os
> planos gratuitos têm uso justo (*fair use*) e cobrança de excedente ou
> suspensão conforme a política de cada provedor. Confira sempre as fontes
> oficiais antes de decidir orçamento:
>
> - Vercel Hobby: <https://vercel.com/docs/plans/hobby> · Limites: <https://vercel.com/docs/limits> · Functions: <https://vercel.com/docs/functions/limitations>
> - Supabase Free: <https://supabase.com/pricing> · Faturamento/quotas: <https://supabase.com/docs/guides/platform/billing-on-supabase>

Este projeto foi desenhado para caber — com folga — na faixa gratuita de
ambas as plataformas, **reduzindo banda, invocações e leituras de banco**.
Este documento mostra limites oficiais, o consumo esperado e o checklist do
§9 do requisito especial.

## 1. Limites oficiais consultados

### Vercel — plano Hobby (grátis)

| Recurso | Incluído | Fonte |
| --- | --- | --- |
| Function Invocations | 1.000.000 / mês | <https://vercel.com/docs/limits> |
| Fast Data Transfer (banda) | 100 GB / mês | <https://vercel.com/docs/limits> |
| Fast Origin Transfer | até 10 GB / mês | <https://vercel.com/docs/limits> |
| Active CPU | 4 CPU-horas / mês | <https://vercel.com/docs/limits> |
| Provisioned Memory | 360 GB-horas / mês | <https://vercel.com/docs/plans/hobby> |
| Deploys por dia | 100 | <https://vercel.com/docs/limits> |
| Projetos | 200 | <https://vercel.com/docs/limits> |
| Duração máxima de função | 300 s (Hobby) | <https://vercel.com/docs/functions/limitations> |
| Memória máxima de função | 2 GB (Hobby) | <https://vercel.com/docs/functions/limitations> |
| Logs de runtime | 1 hora | <https://vercel.com/docs/plans/hobby> |

Observações oficiais: ao exceder um limite no Hobby, em geral é preciso
aguardar o reinício do período de 30 dias para voltar a usar o recurso; o
Hobby é restrito a uso pessoal/não comercial (*fair use*).

### Supabase — plano Free (grátis)

| Recurso | Incluído | Fonte |
| --- | --- | --- |
| Projetos ativos | 2 (na organização; pausados não contam) | <https://supabase.com/docs/guides/platform/billing-on-supabase> |
| Banco de dados | 500 MB por projeto | <https://supabase.com/pricing> |
| Egress (saída de dados) | 5 GB (+ 5 GB cached) por organização/mês | <https://supabase.com/pricing> |
| Armazenamento de arquivos | 1 GB | <https://supabase.com/pricing> |
| Usuários ativos mensais (MAU) | 50.000 | <https://supabase.com/docs/guides/platform/billing-on-supabase> |
| Requisições à API | ilimitadas | <https://supabase.com/pricing> |
| Pausa por inatividade | projeto é pausado após 1 semana sem atividade | <https://supabase.com/pricing> |
| Backups automáticos | **não incluídos no Free** (Pro: 7 dias) | <https://supabase.com/docs/guides/platform/billing-on-supabase> |
| Envio de e-mail (Auth) | limite de taxa por hora (confirmação de cadastro etc.) | <https://supabase.com/pricing> |

## 2. Por que o consumo deste projeto é baixo

| Medida | Como está implementado | Efeito |
| --- | --- | --- |
| Páginas públicas estáticas | `/`, `/rules`, `/register`, `/rankings`, `/rankings/[slug]`, `/results`, `/results/[slug]` são pré-renderizadas e servidas do CDN, sem ler cookies nem banco por request | 0 invocações de função e 0 leituras de banco por visualização normal; só transferência CDN (conta no Fast Data Transfer) |
| Revalidação sob demanda | `revalidatePath()` apenas em escritas administrativas confirmadas e no botão "Publicar" | nenhum cron, polling, ISR periódico ou Realtime |
| Snapshot do ranking | ranking materializado num JSONB numérico; a página pública só lê 1 linha por nível e hidrata nomes em blocos de 100 ids | evita recalcular ranking por request e evita N+1 de nomes |
| Sem Realtime/Sem Edge Functions | tudo em Server Actions e páginas do App Router | 0 mensagens Realtime, 0 invocações Edge Functions do Supabase |
| Consultas explícitas | `select()` sempre com colunas explícitas, paginação e `count` na própria query | payload mínimo por leitura |
| Sem bibliotecas externas de UI/fontes/imagens | CSS global próprio, fonte do sistema, ícones em emoji/SVG | 0 requisições de terceiros no navegador (zero *third-party requests*) |
| Bot do Telegram opcional | webhook acionado apenas quando alguém usa o bot | 0 custo quando desligado; quando ligado, só 1 requisição por mensagem recebida |

## 3. Consumo estimado por uso do clube

Premissas de projeto (estimativa própria, **não** garantia): 60 jogadores,
4 níveis, 150 resultados/mês, 400 visitas/mês ao site público, ~200 ações de
admin/mês.

| Métrica | Estimativa | Limite oficial | Folga |
| --- | --- | --- | --- |
| Invocações Vercel/mês | < 5.000 (páginas privadas + actions; públicas saem do CDN) | 1.000.000 | ~99,5% |
| Banda Vercel/mês | < 3 GB (HTML/JS de ~100 kB por visita) | 100 GB | >97% |
| Leituras do banco/mês | < 50.000 (listagens paginadas + 3 leituras por rebuild de ranking) | sem cota de leituras (egress de 5 GB) | folga enorme |
| Egress Supabase/mês | < 1 GB | 5 GB | >80% |
| Linhas de banco | poucas dezenas de MB (10.000 resultados × ~300 B) | 500 MB | >90% |
| MAU (login/mês) | dezenas | 50.000 | quase total livre |

Cálculo de banda por visita (ordem de grandeza): First Load JS ~106 kB +
HTML ~10 kB ⇒ ~120 kB/visualização ⇒ 400 visitas ≈ 50 MB/mês no CDN.

## 4. Riscos de custo/limite e como mitigá-los

| Risco | Sinal | Mitigação |
| --- | --- | --- |
| Projeto Supabase pausado após 1 semana sem atividade | site público pode exibir *fallback* amigável até reativar | reativar no painel Supabase (grátis); visitar o site mantém atividade |
| Esgotar deploys no dia (100) | deploy recusado | 100/dia é folga ampla para 1 clube |
| Exceder Fast Data Transfer | site degradado até novo período (30 dias) | páginas públicas ~120 kB; tirar thumbnails pesados (não usados aqui) |
| Crescimento de banco (500 MB) | lentidão/erro de gravação | exportar CSV mensal (ver `docs/setup.md` §backup) |
| Uso do Hobby fora do escopo pessoal/não comercial | restrição de *fair use* da Vercel | manter uso de clube/amador; escalar para Pro se necessário |
| Webhook do Telegram ativo sem token/segredo | — | configuração 100% opcional; sem env, a rota responde 404 |

## 5. Checklist §9 — validação antes da entrega

- [x] Limites da Vercel Hobby consultados nas docs oficiais (links na seção 1).
- [x] Limites do Supabase Free consultados nas docs oficiais (links na seção 1).
- [x] Nenhuma rotina periódica (cron, ISR por tempo, polling, Realtime) — apenas `revalidatePath` sob demanda.
- [x] Páginas públicas sem acesso a cookies/headers (ficam estáticas/CDN).
- [x] Toda consulta usa colunas explícitas + paginação + `count` na mesma query.
- [x] Sem bibliotecas externas de UI, fontes ou imagens; zero requisições de terceiros.
- [x] Nenhuma afirmação de "custo zero garantido" — apenas estimativas com limites datados.
- [x] Orçamento de desempenho e medições registrados em `docs/performance.md`.
- [x] Procedimento de pausa/reativação e backup documentado em `docs/setup.md`.
- [ ] Após o primeiro deploy real: conferir as métricas na Vercel (Observability → Functions/Edge) e o painel de uso do Supabase (Organization → Usage) e revisar a estimativa.
