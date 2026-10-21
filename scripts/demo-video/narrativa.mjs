/**
 * Roteiro do vídeo de demonstração do F CHALLENGER (narração em pt-BR).
 *
 * Três atos (cada um também vira um vídeo curto próprio):
 *   1. público  — visitante sem login, páginas estáticas;
 *   2. jogador  — informar resultado, pendência, perfil;
 *   3. admin    — lançar, confirmar, ver o impacto no ranking, reabrir,
 *                 jogadores, convites, consistência.
 *
 * Cada cena tem:
 *  - id/nome: identificação e banner de título exibido no topo do vídeo;
 *  - ato: "geral" | "publico" | "jogador" | "admin" — usado para gerar os
 *    vídeos separados por persona além do completo;
 *  - card: opcional, renderiza uma tela de título (assets/card.html);
 *  - falas: uma lista de passos; CADA passo tem UMA fala e UMA ação.
 *     * a ação executa primeiro;
 *     * a narração da fala começa logo depois que a ação termina;
 *     * a legenda da fala aparece na parte de baixo da tela.
 *
 * Ações dinâmicas (nome do adversário, posições etc.) vêm do CTX, preenchido
 * pelo setup do build.mjs ANTES do TTS — por isso as falas que citam valores
 * são getters.
 *
 * O vídeo final é montado por scripts/demo-video/build.mjs.
 */

export const BASE = process.env.VIDEO_BASE ?? "http://localhost:3000";

/** Contas usadas na demonstração (senha compartilhada só do ambiente demo). */
export const CONTAS = {
  jogador: { email: "demo-player@example.com", senha: "Demo@12345" },
  admin: { email: "demo-admin@example.com", senha: "Demo@12345" },
};

/** Convite criado pelo setup e usado na tela /ativar do ato público. */
export const CONVITE = {
  nome: "Convite Demonstração (vídeo)",
  codigo: "DEMO26X9",
};

/**
 * Preenchido pelo setup do build: valores reais do ranking usados na narração
 * (adversário da demonstração, posições antes/depois, par lançado pelo admin).
 */
export const CTX = {
  levelId: "",
  jogadorId: "",
  adversarioId: "",
  adversario: "",
  advPtsAntes: 0,
  advPosAntes: 0,
  advPtsDepois: 0,
  advPosDepois: 0,
  ultrapassado: "",
  topNome: "",
  lancarP1Id: "",
  lancarP1: "",
  lancarP2Id: "",
  lancarP2: "",
  dataHoje: "", // dd/mm/aaaa
  jogosNoRanking: 0,
};

export const CENARIOS = [
  // ─────────────────────────────────────────────── abertura
  {
    id: "abertura",
    ato: "geral",
    nome: "Abertura",
    card: {
      kicker: "F CHALLENGER · Demonstração",
      titulo: "Tudo o que o sistema faz",
      subtitulo: "Três personas: visitante, jogador e administrador",
      itens: [
        "Ato 1 — Visitante (sem login)",
        "Ato 2 — Jogador (informar resultado)",
        "Ato 3 — Administrador (confirmar e publicar)",
      ],
    },
    falas: [
      {
        texto:
          "Bem-vindo à demonstração completa do F CHALLENGER, o ranking oficial do clube.",
        acao: async (p, h) => {
          await h.card();
        },
      },
      {
        texto:
          "Vamos ver tudo o que o sistema faz, em três personas: o visitante, o jogador e o administrador.",
      },
      {
        texto:
          "A demonstração usa dados de exemplo e restaura tudo ao estado original ao final da gravação.",
      },
    ],
  },

  // ─────────────────────────────────────────────── ato 1 · público
  {
    id: "card-publico",
    ato: "publico",
    nome: "Transição · visitante",
    card: {
      kicker: "Ato 1 de 3",
      titulo: "Visitante",
      subtitulo: "Sem login — páginas públicas",
      itens: [
        "Home e regulamento",
        "Classificação com ordenação e busca",
        "Resultados, atletas e agenda",
        "Ativação por código",
      ],
    },
    falas: [
      {
        texto:
          "Primeiro ato: o visitante. Todas as páginas públicas funcionam sem login nenhum.",
        acao: async (p, h) => {
          await h.card();
        },
      },
    ],
  },

  {
    id: "pub-home",
    ato: "publico",
    nome: "Home e regulamento",
    falas: [
      {
        texto:
          "Este é o site público: classificação oficial, com partidas informadas pelos próprios jogadores e confirmadas pelo administrador.",
        acao: async (p, h) => {
          await h.goto("/");
        },
      },
      {
        texto:
          "O fluxo é simples: alguém informa o resultado, o administrador confirma, e a classificação é atualizada na hora.",
        acao: async (p) => {
          await p.getByText("Como funciona").first().scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "pub-regras",
    ato: "publico",
    nome: "Regulamento",
    falas: [
      {
        texto:
          "No regulamento: partidas Normais são melhor de três, com tiebreakão no set decisivo; Grand Slams são melhor de cinco.",
        acao: async (p, h) => {
          await h.goto("/rules");
        },
      },
      {
        texto:
          "A pontuação é aberta a todos — de trezentos e cinquenta no Normal até quatrocentos e cinquenta no Grand Slam, e o W.O. vale trezentos e cinquenta.",
        acao: async (p) => {
          await p
            .getByRole("heading", { name: "2. Pontuação" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "Os pontos caducam ao completar um ano, e o limite é de duas partidas por semestre contra o mesmo adversário.",
        acao: async (p) => {
          await p
            .getByRole("heading", { name: "3. Validade dos pontos" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "pub-classificacao",
    ato: "publico",
    nome: "Classificação · ordenação e busca",
    falas: [
      {
        texto:
          "Esta é a classificação: posição, atleta, pontos, jogos e média — só valem as partidas dos últimos doze meses.",
        acao: async (p, h) => {
          await h.goto("/rankings");
        },
      },
      {
        texto:
          "Qualquer coluna ordena a tabela: um clique em Atleta troca para a ordem alfabética.",
        acao: async (p, h) => {
          await h.click(p.getByRole("columnheader", { name: "Atleta" }));
        },
      },
      {
        texto: "E a busca filtra na hora — veja, restam apenas as linhas de um atleta.",
        acao: async (p) => {
          await p.getByPlaceholder("Buscar atleta...").fill(CTX.topNome);
          await p.getByRole("status").first().waitFor({ timeout: 30000 });
        },
      },
      {
        texto:
          "Dois cliques no cabeçalho e a tabela volta à ordem oficial de pontos.",
        acao: async (p, h) => {
          await p.getByPlaceholder("Buscar atleta...").fill("");
          const th = p.getByRole("columnheader", { name: "Atleta" });
          await h.click(th);
          await p.waitForTimeout(400);
          await h.click(th);
        },
      },
    ],
  },

  {
    id: "pub-resultados",
    ato: "publico",
    nome: "Resultados públicos",
    falas: [
      {
        texto:
          "Em Resultados, o histórico público das partidas confirmadas: data, formato e placar de cada jogo.",
        acao: async (p, h) => {
          await h.goto("/results");
        },
      },
      {
        texto:
          "Repare nos formatos: Normal, Grand Slam e o W.O. registrado com o nome de quem venceu por W.O.",
        acao: async (p) => {
          await p.locator("tbody tr").first().scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "A mesma busca por atleta funciona aqui: filtrando pelo adversário da nossa demonstração, restam só as partidas dele.",
        acao: async (p) => {
          await p.getByPlaceholder("Buscar por atleta...").fill(CTX.adversario);
          await p.getByRole("status").first().waitFor({ timeout: 30000 });
        },
      },
    ],
  },

  {
    id: "pub-atletas",
    ato: "publico",
    nome: "Atletas",
    falas: [
      {
        texto:
          "A relação de atletas mostra quem participa do torneio, com a etiqueta A a D da planilha original.",
        acao: async (p, h) => {
          await h.goto("/atletas");
        },
      },
      {
        texto:
          "Cada atleta tem seu cartão com iniciais e o nível de referência — informativo, sem efeito na pontuação.",
        acao: async (p) => {
          await p.locator(".card").nth(4).scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "pub-agenda",
    ato: "publico",
    nome: "Agenda",
    falas: [
      {
        texto:
          "A agenda mostra quem marcou disponibilidade para jogar nas próximas semanas.",
        acao: async (p, h) => {
          await h.goto("/agenda");
        },
      },
      {
        texto:
          "O atleta marca a sua na área do jogador, e o nome aparece aqui na hora, para todo o clube combinar os jogos.",
        acao: async (p) => {
          await p
            .getByRole("link", { name: "Marcar minha disponibilidade" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "pub-ativar",
    ato: "publico",
    nome: "Ativação por código",
    falas: [
      {
        texto:
          "Quem ainda não tem conta usa o código de ativação enviado pelo administrador — não existe cadastro aberto.",
        acao: async (p, h) => {
          await h.goto("/ativar");
        },
      },
      {
        texto:
          "Digitado o código, o sistema mostra o nome do atleta para conferência — aqui, com um convite de demonstração.",
        acao: async (p, h) => {
          await h.hyd(p.locator("form"));
          await p.getByLabel("Código de ativação").fill(CONVITE.codigo);
          await h.click(p.getByRole("button", { name: "Continuar" }));
          await p.getByText(/Atleta:/).first().waitFor({ timeout: 60000 });
        },
      },
      {
        texto:
          "Na sequência, o atleta escolhe e-mail e senha próprios — o código é de uso único e a conta nasce aprovada.",
        acao: async (p) => {
          await p
            .getByLabel("E-mail")
            .fill("atleta.exemplo@email.com");
          await p.getByLabel("Senha", { exact: true }).fill("Demo@12345");
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── ato 2 · jogador
  {
    id: "card-jogador",
    ato: "jogador",
    nome: "Transição · jogador",
    card: {
      kicker: "Ato 2 de 3",
      titulo: "Jogador",
      subtitulo: "Informe um resultado do seu jogo",
      itens: [
        "Painel com posição e pontos",
        "Novo resultado com validação",
        "Meus resultados e retirada",
        "Perfil e Telegram",
      ],
    },
    falas: [
      {
        texto:
          "Segundo ato: o jogador aprovado. Ele entra com e-mail e senha próprios.",
        acao: async (p, h) => {
          await h.card();
        },
      },
    ],
  },

  {
    id: "jog-login",
    ato: "jogador",
    nome: "Login do jogador",
    falas: [
      {
        texto:
          "Entramos com a conta de um atleta aprovado do torneio — aprovado pelo administrador com um código de ativação.",
        acao: async (p, h) => {
          await h.login(CONTAS.jogador.email, CONTAS.jogador.senha);
        },
      },
      {
        texto:
          "O painel mostra a própria posição, os pontos e os jogos considerados na janela de doze meses.",
        acao: async (p) => {
          await p.locator(".stat-row").first().scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "jog-painel",
    ato: "jogador",
    nome: "Painel do jogador",
    falas: [
      {
        texto:
          "Abaixo, o top 5 do ranking e os próprios resultados mais recentes, com a situação de cada um.",
        acao: async (p, h) => {
          await h.goto("/app");
          await p
            .getByRole("heading", { name: "Top 5 do ranking" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "E o botão Área geral leva de volta ao site público a qualquer momento, sem sair da conta.",
        acao: async (p) => {
          await p
            .getByRole("link", { name: "Área geral" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "jog-novo",
    ato: "jogador",
    nome: "Informar resultado",
    falas: [
      {
        texto:
          "Para informar um resultado, ele escolhe o adversário — a data já vem preenchida com o dia de hoje, como o regulamento pede.",
        acao: async (p, h) => {
          await h.goto("/app/results/new");
          await h.hyd(p.locator("form"));
          await p
            .getByLabel("Adversário", { exact: true })
            .selectOption({ label: CTX.adversario });
        },
      },
      {
        texto:
          "O placar usa um campo para cada lado — bem mais fácil de digitar no celular, sem hífen nenhum.",
        acao: async (p) => {
          await p.getByLabel(`Games de Você no set 1`).fill("11");
          await p.getByLabel(`Games de ${CTX.adversario} no set 1`).fill("7");
        },
      },
      {
        texto:
          "Um placar impossível é recusado na hora: um set não termina em onze a sete.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Informar resultado" }));
          await p.getByText(/Set 1 inválido/).first().waitFor({ timeout: 60000 });
        },
      },
      {
        texto:
          "Corrigido: três a seis e quatro a seis — uma derrota por dois sets a zero para o adversário.",
        acao: async (p) => {
          await p.getByLabel(`Games de Você no set 1`).fill("3");
          await p.getByLabel(`Games de ${CTX.adversario} no set 1`).fill("6");
          await p.getByLabel(`Games de Você no set 2`).fill("4");
          await p.getByLabel(`Games de ${CTX.adversario} no set 2`).fill("6");
        },
      },
      {
        texto:
          "Enviado. O resultado fica pendente até a confirmação do administrador — nada entra no ranking antes disso.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Informar resultado" }));
          await p.waitForURL("**/app/results", { timeout: 60000 });
        },
      },
    ],
  },

  {
    id: "jog-meus",
    ato: "jogador",
    nome: "Meus resultados",
    falas: [
      {
        texto:
          "Aqui em Meus resultados, ele acompanha a situação de cada partida informada.",
        acao: async (p, h) => {
          await h.goto("/app/results");
          await p
            .locator("tr", { hasText: CTX.adversario })
            .filter({ hasText: "Pendente" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "O marcador mostra vitória em verde e derrota em vermelho, e o selo Pendente avisa que a partida ainda não pontua.",
      },
      {
        texto:
          "Pendências são suas: ele pode retirar enquanto o administrador não tiver confirmado.",
        acao: async (p) => {
          await p
            .getByRole("button", { name: "Retirar" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "jog-perfil",
    ato: "jogador",
    nome: "Perfil do jogador",
    falas: [
      {
        texto:
          "No perfil, ele ajusta o nome exibido no ranking e troca a senha quando quiser.",
        acao: async (p, h) => {
          await h.goto("/profile");
        },
      },
      {
        texto:
          "Abaixo, gera o código para vincular a conta ao bot do Telegram — para consultar o ranking e informar resultados pelo celular.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Gerar novo código" }));
          await p.getByRole("status").first().waitFor({ timeout: 60000 });
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── ato 3 · administrador
  {
    id: "card-admin",
    ato: "admin",
    nome: "Transição · administrador",
    card: {
      kicker: "Ato 3 de 3",
      titulo: "Administrador",
      subtitulo: "Confirma resultados e publica o ranking",
      itens: [
        "Painel com pendências",
        "Lançar resultado no lugar de um atleta",
        "Confirmar e ver o impacto no ranking",
        "Jogadores, convites e consistência",
      ],
    },
    falas: [
      {
        texto:
          "Terceiro ato: o administrador do clube. Ele confirma os resultados e mantém o ranking consistente.",
        acao: async (p, h) => {
          await h.card();
        },
      },
    ],
  },

  {
    id: "adm-login",
    ato: "admin",
    nome: "Login do administrador",
    falas: [
      {
        texto:
          "Entramos com a conta do administrador — que também é atleta do clube.",
        acao: async (p, h) => {
          await h.login(CONTAS.admin.email, CONTAS.admin.senha);
        },
      },
      {
        texto:
          "O painel do jogador vem primeiro; a área administrativa fica no menu Admin, no topo.",
      },
    ],
  },

  {
    id: "adm-painel",
    ato: "admin",
    nome: "Painel administrativo",
    falas: [
      {
        texto:
          "No painel administrativo, os números gerais: pendentes, confirmados, jogadores ativos e cadastros aguardando aprovação.",
        acao: async (p, h) => {
          await h.goto("/admin");
        },
      },
      {
        texto:
          "E os atalhos do dia a dia: revisar pendências, lançar um resultado no lugar de um atleta e cadastrar jogadores.",
      },
    ],
  },

  {
    id: "adm-lancar",
    ato: "admin",
    nome: "Lançar resultado como admin",
    falas: [
      {
        texto:
          "Às vezes o placar chega no grupo de WhatsApp. O administrador lança o resultado direto — veja como.",
        acao: async (p, h) => {
          await h.goto("/admin/results/new");
          await h.hyd(p.locator("form"));
        },
      },
      {
        texto:
          "Ele escolhe os dois atletas, confere a data e o formato — e pode salvar já confirmado ou pendente.",
        acao: async (p) => {
          await p.locator("#player1_id").selectOption({ label: CTX.lancarP1 });
          await p.locator("#player2_id").selectOption({ label: CTX.lancarP2 });
          await p
            .getByLabel("Situação")
            .selectOption({ label: "Pendente (aguarda confirmação)" });
          await p.getByLabel(`Games de ${CTX.lancarP1} no set 1`).fill("6");
          await p.getByLabel(`Games de ${CTX.lancarP2} no set 1`).fill("4");
          await p.getByLabel(`Games de ${CTX.lancarP1} no set 2`).fill("6");
          await p.getByLabel(`Games de ${CTX.lancarP2} no set 2`).fill("3");
        },
      },
      {
        texto:
          "Salvo como pendente: ele aparece na lista dos administradores, mas ainda não vale ponto nenhum.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Salvar resultado" }));
          await p.waitForURL("**/admin/results", { timeout: 60000 });
        },
      },
    ],
  },

  {
    id: "adm-pendentes",
    ato: "admin",
    nome: "Pendências e confirmação",
    falas: [
      {
        texto:
          "Em Resultados, o filtro Situação traz só as pendências — estas duas aguardam confirmação.",
        acao: async (p, h) => {
          await h.goto("/admin/results");
          await h.hyd(p.getByLabel("Situação"));
          await p.getByLabel("Situação").selectOption({ label: "Pendentes" });
          await h.click(p.getByRole("button", { name: "Filtrar" }));
          await p.waitForURL("**status=pending**", { timeout: 60000 });
        },
      },
      {
        texto:
          "A primeira veio do site: o Jogador Demo informou a derrota para o adversário da demonstração, hoje.",
        acao: async (p) => {
          await p
            .locator("tr", { hasText: CTX.adversario })
            .filter({ hasText: CTX.dataHoje })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "Confirmar é um clique — e o ranking do clube é recalculado e republicado na hora.",
        acao: async (p, h) => {
          const linha = p
            .locator("tr", { hasText: CTX.adversario })
            .filter({ hasText: CTX.dataHoje })
            .first();
          await h.click(linha.getByRole("button", { name: "Confirmar" }));
          // A lista revalida com o filtro "pendentes": a partida confirmada
          // sai da lista — é o sinal visual de que a ação funcionou.
          await linha.waitFor({ state: "detached", timeout: 90000 });
        },
      },
    ],
  },

  {
    id: "adm-impacto",
    ato: "admin",
    nome: "Impacto no ranking",
    falas: [
      {
        texto: "Este é o efeito no ranking: o adversário da demonstração somou trezentos pontos com a vitória por dois sets a zero.",
        acao: async (p, h) => {
          await h.goto("/rankings");
          await p
            .locator("tr", { hasText: CTX.adversario })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto: () =>
          `De ${CTX.advPtsAntes} pontos na posição ${CTX.advPosAntes}, ele foi para ${CTX.advPtsDepois} pontos${
            CTX.advPosDepois !== CTX.advPosAntes
              ? `, alcançando a posição ${CTX.advPosDepois}`
              : " — mesma posição, mais perto de quem está acima"
          }.`,
      },
      {
        texto: () =>
          CTX.ultrapassado
            ? `Na escada, ele ultrapassou ${CTX.ultrapassado}, que permanece com a mesma pontuação de antes.`
            : "Os pontos entram na hora, e a janela de doze meses garante a atualização automática, sem cron nenhum.",
      },
      {
        texto:
          "E o Jogador Demo, que informou a derrota, estreou na classificação com cinquenta pontos de consolação.",
        acao: async (p) => {
          await p
            .locator("tr", { hasText: "Jogador Demo" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "adm-reabrir",
    ato: "admin",
    nome: "Reabrir resultado",
    falas: [
      {
        texto:
          "Tudo é auditável: qualquer confirmação pode ser desfeita. Vamos reabrir o resultado da demonstração.",
        acao: async (p, h) => {
          await h.goto("/admin/results?status=confirmed");
          const linha = p
            .locator("tr", { hasText: CTX.adversario })
            .filter({ hasText: CTX.dataHoje })
            .first();
          await h.click(linha.getByRole("button", { name: "Reabrir" }));
          // Reaberta, a partida sai do filtro "confirmadas" (mesma dinâmica
          // da confirmação): a lista revalida sem ela.
          await linha.waitFor({ state: "detached", timeout: 90000 });
        },
      },
      {
        texto:
          "Reaberto, ele volta a ser pendente — e o ranking retorna exatamente ao estado anterior, na mesma operação.",
      },
    ],
  },

  {
    id: "adm-jogadores",
    ato: "admin",
    nome: "Jogadores e etiqueta A–D",
    falas: [
      {
        texto:
          "A relação de jogadores mostra contas, e-mail, nível, perfil e situação de cada atleta.",
        acao: async (p, h) => {
          await h.goto("/admin/players");
        },
      },
      {
        texto:
          "A busca por nome encontra qualquer atleta — e aqui o administrador aprova cadastros e redefine senhas.",
        acao: async (p, h) => {
          await h.hyd(p.getByLabel("Buscar por nome"));
          await p.getByLabel("Buscar por nome").fill("Jogador Demo");
          await h.click(p.getByRole("button", { name: "Filtrar" }));
          await p.waitForURL("**q=**", { timeout: 60000 });
        },
      },
      {
        texto:
          "Cada atleta ainda tem a etiqueta A a D da planilha original — informativa, sem efeito no ranking.",
        acao: async (p, h) => {
          await h.goto(`/admin/players/${CTX.jogadorId}`);
          await h.hyd(p.locator("#ref_level"));
        },
      },
      {
        texto:
          "Vamos marcá-lo como C: salvo na hora, o selo aparece já na lista de jogadores.",
        acao: async (p, h) => {
          await p.locator("#ref_level").selectOption({ label: "C" });
          await h.click(p.getByRole("button", { name: "Salvar alterações" }));
          await p.getByText("Jogador atualizado.").first().waitFor({ timeout: 60000 });
          await h.goto("/admin/players?q=Jogador%20Demo");
          await p
            .locator("tr", { hasText: "Jogador Demo" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "adm-convites",
    ato: "admin",
    nome: "Convites e ativação",
    falas: [
      {
        texto:
          "Os atletas entram por código de ativação — sem cadastro aberto. O administrador cria o convite aqui.",
        acao: async (p, h) => {
          await h.goto("/admin/convites");
        },
      },
      {
        texto:
          "Preenche o nome do atleta e o sistema gera um código de uso único — é só enviar por WhatsApp.",
        acao: async (p, h) => {
          await h.hyd(p.getByLabel("Nome do atleta"));
          await p.getByLabel("Nome do atleta").fill(CONVITE.nome);
          await h.click(p.getByRole("button", { name: "Criar convite" }));
          await p
            .getByText(/Convite criado/)
            .first()
            .waitFor({ timeout: 60000 });
        },
      },
      {
        texto:
          "Na lista, dá para copiar o código, gerar outro ou remover um convite ainda não usado.",
        acao: async (p) => {
          await p
            .locator("tr", { hasText: CONVITE.nome })
            .last()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  {
    id: "adm-excluir",
    ato: "admin",
    nome: "Excluir resultado",
    falas: [
      {
        texto:
          "De volta às pendências: o resultado lançado pelo administrador segue esperando — e pode ser excluído.",
        acao: async (p, h) => {
          await h.goto("/admin/results?status=pending");
          const linha = p
            .locator("tr", { hasText: CTX.lancarP1 })
            .filter({ hasText: CTX.dataHoje })
            .first();
          await h.clickUntilDetached(linha.getByRole("button", { name: "Excluir" }));
        },
      },
      {
        texto:
          "Excluído, com confirmação de segurança — a lista volta ao normal na hora.",
      },
    ],
  },

  {
    id: "adm-verify",
    ato: "admin",
    nome: "Verificar consistência",
    falas: [
      {
        texto:
          "Por fim, o administrador confere a consistência: o sistema recalcula tudo a partir dos resultados confirmados e compara com o ranking publicado.",
        acao: async (p, h) => {
          await h.goto("/admin/verify");
          await h.click(p.getByRole("button", { name: "Verificar consistência agora" }));
          await p.getByText("Consistente").first().waitFor({ timeout: 90000 });
        },
      },
      {
        texto:
          "Consistente: o que está publicado bate exatamente com o recálculo — é a conferência automática do dia a dia.",
      },
    ],
  },

  // ─────────────────────────────────────────────── encerramento
  {
    id: "encerramento",
    ato: "geral",
    nome: "Encerramento",
    card: {
      kicker: "F CHALLENGER · Demonstração",
      titulo: "Sistema completo",
      subtitulo: "Obrigado pela atenção!",
      itens: [
        "Site público com busca e ordenação",
        "Jogador informa resultados pelo celular",
        "Administrador confirma e publica",
        "Dados de exemplo restaurados ao final",
      ],
    },
    falas: [
      {
        texto:
          "Esta foi a demonstração completa do F CHALLENGER — do site público ao painel do administrador.",
        acao: async (p, h) => {
          await h.card();
        },
      },
      {
        texto:
          "Os dados usados aqui são de exemplo: ao final da gravação, tudo volta ao estado original do torneio.",
      },
      {
        texto: "Qualquer dúvida, fale com a organização. Até a próxima!",
      },
    ],
  },
];

/** Ato de cada cena, na ordem em que os vídeos separados são gerados. */
export const ATOS = ["publico", "jogador", "admin"];
