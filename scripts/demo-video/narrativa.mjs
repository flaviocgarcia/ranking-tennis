/**
 * Roteiro do vídeo de demonstração (narração em pt-BR).
 *
 * Cada cena tem:
 *  - id/nome: identificação e banner de título exibido no topo do vídeo;
 *  - card: opcional, renderiza uma tela de título (assets/card.html);
 *  - falas: uma lista de passos; CADA passo tem UMA fala e UMA ação.
 *     * a ação executa primeiro;
 *     * a narração da fala começa logo depois que a ação termina;
 *     * a legenda da fala aparece na parte de baixo da tela.
 *
 * O vídeo final é montado por scripts/demo-video/build.mjs.
 */

export const BASE = process.env.VIDEO_BASE ?? "http://localhost:3000";

/** Contas usadas na demonstração (senha compartilhada só do ambiente demo). */
export const CONTAS = {
  jogador: { email: "demo-rafael.almeida@example.com", senha: "Demo@12345" },
  adminB: { email: "demo-admin-b@example.com", senha: "Demo@12345" },
  admin: { email: "demo-admin@example.com", senha: "Demo@12345" },
  pendente: { email: "demo-video.cadastro@example.com", senha: "Demo@12345" },
};

/**
 * Preenchido pelo setup do build: ids dos níveis (filtros de URL) e a data
 * (dd/mm/aaaa) das pendências demo — usada para localizar a linha exata nas
 * listas do painel, que podem conter outras partidas dos mesmos jogadores.
 */
export const CTX = { levelA: "", levelB: "", dataA: "", dataB: "" };

/** Conta criada na preparação: demonstra auto-cadastro + aprovação. */
export const CONTA_VIDEO = {
  email: "demo-video.cadastro@example.com",
  senha: "Demo@12345",
  nome: "Cadastro Video (demo)",
};

export const CENARIOS = [
  // ─────────────────────────────────────────────── abertura
  {
    id: "abertura",
    nome: "Abertura",
    card: {
      kicker: "Ranking de Tênis · Demonstração",
      titulo: "Todas as funcionalidades",
      subtitulo: "Apresentação completa nos cinco perfis de acesso",
      itens: [
        "Visitante (sem login)",
        "Jogador aprovado",
        "Jogador aguardando aprovação",
        "Administrador de nível",
        "Administrador geral",
      ],
    },
    falas: [
      {
        texto:
          "Bem-vindo à demonstração do Ranking de Tênis, o sistema de classificação do clube.",
        acao: async (p, h) => {
          await h.card();
        },
      },
      {
        texto:
          "Vamos percorrer todas as funcionalidades do sistema, em cinco perfis de acesso diferentes.",
      },
      {
        texto:
          "O visitante, o jogador aprovado, o jogador aguardando aprovação, o administrador de nível e o administrador geral.",
      },
    ],
  },

  // ─────────────────────────────────────────────── visitante
  {
    id: "visitante",
    nome: "Visitante (sem login)",
    falas: [
      {
        texto:
          "Começamos como visitante, sem entrar na conta. A página inicial apresenta o clube e os atalhos principais.",
        acao: async (p, h) => {
          await h.goto("/");
        },
      },
      {
        texto:
          "Mais abaixo, um resumo de como funciona o ranking, em páginas públicas, estáticas e rápidas.",
        acao: async (p) => {
          await p.getByText("Como funciona").first().scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "Nas regras, cada nível define seu formato: dois sets vencedores e super tiebreak no set decisivo.",
        acao: async (p, h) => {
          await h.goto("/rules");
        },
      },
      {
        texto:
          "Cada nível define também sua pontuação, inclusive o ponto de quem perde o tiebreakão, e a ordem dos critérios de desempate.",
        acao: async (p) => {
          await p.locator("section.card").first().scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "As classificações são separadas por nível e só mudam quando um resultado oficial é alterado.",
        acao: async (p, h) => {
          await h.goto("/rankings");
        },
      },
      {
        texto:
          "No Nível A, a tabela mostra posição, pontos, jogos, vitórias e derrotas. O desempate vale apenas entre pontuações iguais.",
        acao: async (p, h) => {
          await h.goto("/rankings/a");
        },
      },
      {
        texto:
          "E em resultados, o histórico das partidas confirmadas de todos os níveis, com o placar de cada jogo.",
        acao: async (p, h) => {
          await h.goto("/results");
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── auto-cadastro
  {
    id: "cadastro",
    nome: "Visitante · auto-cadastro",
    falas: [
      {
        texto:
          "Quem ainda não tem conta se cadastra sozinho, informando nome, e-mail, senha e o nível em que joga.",
        acao: async (p, h) => {
          await h.goto("/register");
          await h.hyd(p.locator("form"));
          await p.getByLabel("Nome").fill("Novo Jogador");
        },
      },
      {
        texto:
          "Escolhido o nível, o cadastro é enviado para a análise do administrador do clube.",
        acao: async (p) => {
          await p.getByLabel("E-mail").fill("novo.jogador@gmail.com");
          await p.getByLabel(/Senha/).fill("Demo@12345");
          await p.getByLabel("Nível em que você joga").selectOption({
            label: "Nível A",
          });
        },
      },
      {
        texto:
          "Até ser aprovado, o jogador entra no sistema, mas não aparece no ranking nem informa resultados. Veja na prática.",
        acao: async (p) => {
          await p
            .getByText("O cadastro escolhe o nível, mas só é aceito")
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── cadastro pendente
  {
    id: "pendente",
    nome: "Jogador · aguardando aprovação",
    falas: [
      {
        texto:
          "Esta é uma conta recém cadastrada. Repare no aviso: o cadastro está em análise, aguardando aprovação.",
        acao: async (p, h) => {
          await h.login(CONTAS.pendente.email, CONTAS.pendente.senha);
        },
      },
      {
        texto:
          "Ao tentar informar um resultado, o acesso fica bloqueado até que o administrador aprove o cadastro.",
        acao: async (p, h) => {
          await h.goto("/app/results/new");
        },
      },
      {
        texto:
          "Enquanto isso, ele acompanha as classificações públicas normalmente, como qualquer visitante.",
        acao: async (p, h) => {
          await h.goto("/rankings");
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── jogador aprovado
  {
    id: "jogador",
    nome: "Jogador aprovado · informar resultado",
    falas: [
      {
        texto:
          "Agora, o perfil de um jogador aprovado: Rafael Almeida, do Nível A.",
        acao: async (p, h) => {
          await h.login(CONTAS.jogador.email, CONTAS.jogador.senha);
        },
      },
      {
        texto:
          "No painel ele vê a própria posição, os pontos, o aproveitamento e os cinco primeiros do nível.",
      },
      {
        texto:
          "Para informar um resultado, basta escolher o adversário, a data e digitar o placar no formato seis a quatro.",
        acao: async (p, h) => {
          await h.goto("/app/results/new");
          await h.hyd(p.locator("form"));
          await p.getByLabel("Adversário").selectOption({ label: "Bruno Carvalho" });
          await p.getByLabel(/no set 1$/).first().fill("11");
          await p.getByLabel(/no set 1$/).nth(1).fill("7");
        },
      },
      {
        texto:
          "Repare na validação: um placar impossível é recusado, porque o set termina no primeiro momento com dois pontos de vantagem.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Informar resultado" }));
          await p.getByText("Set 1 inválido").first().waitFor({ timeout: 60000 });
        },
      },
      {
        texto:
          "Corrigindo o placar: seis a quatro, três a seis, e o super tiebreak decisivo, terminado em dez a oito.",
        acao: async (p, h) => {
          await p.getByLabel(/no set 1$/).first().fill("6");
          await p.getByLabel(/no set 1$/).nth(1).fill("4");
          await p.getByLabel(/no set 2$/).first().fill("3");
          await p.getByLabel(/no set 2$/).nth(1).fill("6");
          await h.click(p.getByRole("button", { name: "+ Adicionar set" }));
          await p.getByLabel(/no set 3$/).first().fill("10");
          await p.getByLabel(/no set 3$/).nth(1).fill("8");
        },      },
      {
        texto:
          "O resultado foi enviado e fica pendente até a confirmação do administrador. Nada entra no ranking antes disso.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Informar resultado" }));
          await p.waitForURL("**/app/results", { timeout: 60000 });
        },
      },
      {
        texto:
          "Em Meus resultados, ele acompanha a situação de cada partida. Pendências do próprio autor podem ser retiradas.",
        acao: async (p) => {
          await p
            .locator("tr", { hasText: "Bruno Carvalho" })
            .filter({ hasText: "Pendente" })
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "Retirado! Como nada havia sido confirmado, o ranking permanece exatamente o mesmo.",
        acao: async (p, h) => {
          const linha = p
            .locator("tr", { hasText: "Bruno Carvalho" })
            .filter({ hasText: "Pendente" })
            .first();
          await h.clickUntilDetached(linha.getByRole("button", { name: "Retirar" }));
        },
      },
      {
        texto:
          "No perfil, o jogador ajusta o nome, troca a senha e gera o código para vincular a conta ao bot do Telegram.",
        acao: async (p, h) => {
          await h.goto("/profile");
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── administrador de nível
  {
    id: "admin-nivel",
    nome: "Administrador de nível",
    falas: [
      {
        texto:
          "Este é o administrador de nível. Ele cuida apenas do Nível B, e também é jogador do clube.",
        acao: async (p, h) => {
          await h.login(CONTAS.adminB.email, CONTAS.adminB.senha);
        },
      },
      {
        texto:
          "No painel ele vê somente os números do próprio nível, e o menu nem oferece a área de níveis.",
        acao: async (p, h) => {
          await h.goto("/admin");
        },
      },
      {
        texto:
          "Nos resultados pendentes, aparecem apenas as partidas do Nível B.",
        acao: async (p, h) => {
          await h.goto("/admin/results?status=pending");
        },
      },
      {
        texto:
          "Ao confirmar, o ranking do nível é recalculado e republicado na hora.",
        acao: async (p, h) => {
          const linha = p
            .locator("tr", { hasText: "Administrador Nível B (demo)" })
            .filter({ hasText: CTX.dataB })
            .first();
          const btn = linha.getByRole("button", { name: "Confirmar" });
          if ((await btn.count()) === 0) return; // já confirmado em execução anterior
          await h.clickUntilDetached(btn);
        },
      },
      {
        texto:
          "A lista de jogadores também é restrita: apenas quem joga no Nível B.",
        acao: async (p, h) => {
          await h.goto("/admin/players");
        },
      },
      {
        texto:
          "Ele ainda cadastra jogadores do próprio nível, com senha temporária para o primeiro acesso.",
        acao: async (p, h) => {
          await h.goto("/admin/players/new");
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── admin geral · resultados
  {
    id: "admin-aprovacao",
    nome: "Administrador geral · resultados e aprovações",
    falas: [
      {
        texto:
          "E este é o administrador geral, com acesso a todos os níveis do clube.",
        acao: async (p, h) => {
          await h.login(CONTAS.admin.email, CONTAS.admin.senha);
        },
      },
      {
        texto:
          "O painel geral reúne os resultados, os jogadores ativos e os cadastros aguardando aprovação.",
        acao: async (p, h) => {
          await h.goto("/admin");
        },
      },
      {
        texto:
          "Aqui estão os resultados pendentes de todos os níveis. Vamos confirmar o do Nível A.",
        acao: async (p, h) => {
          await h.goto("/admin/results?status=pending");
        },
      },
      {
        texto:
          "Confirmado. O ranking desse nível é recalculado e republicado imediatamente.",
        acao: async (p, h) => {
          const linha = p
            .locator("tr", { hasText: "Rafael Almeida" })
            .filter({ hasText: "Gustavo Rocha" })
            .filter({ hasText: CTX.dataA })
            .first();
          const btn = linha.getByRole("button", { name: "Confirmar" });
          if ((await btn.count()) === 0) return;
          await h.clickUntilDetached(btn);
        },
      },
      {
        texto:
          "Se houver dúvida, o administrador reabre o resultado e o ranking volta ao estado anterior.",
        acao: async (p, h) => {
          await h.goto(
            `/admin/results?status=confirmed&level=${CTX.levelA}`,
          );
          const btn = p
            .locator("tr", { hasText: "Rafael Almeida" })
            .filter({ hasText: "Gustavo Rocha" })
            .filter({ hasText: CTX.dataA })
            .first()
            .getByRole("button", { name: "Reabrir" });
          if ((await btn.count()) === 0) return;
          await h.clickUntilDetached(btn);
        },
      },
      {
        texto:
          "O mesmo acontece com o resultado que o administrador do Nível B acabou de confirmar.",
        acao: async (p, h) => {
          await h.goto(
            `/admin/results?status=confirmed&level=${CTX.levelB}`,
          );
          const btn = p
            .locator("tr", { hasText: "Administrador Nível B (demo)" })
            .filter({ hasText: CTX.dataB })
            .first()
            .getByRole("button", { name: "Reabrir" });
          if ((await btn.count()) === 0) return;
          await h.clickUntilDetached(btn);
        },
      },
      {
        texto:
          "Agora, a aprovação de cadastros: o administrador libera o jogador que se cadastrou sozinho. A partir daí ele entra no ranking e pode informar resultados.",
        acao: async (p, h) => {
          await h.goto("/admin/players?pending=1");
          const btn = p
            .locator("tr", { hasText: CONTA_VIDEO.email })
            .first()
            .getByRole("button", { name: "Aprovar" });
          if ((await btn.count()) === 0) return;
          await h.clickUntilDetached(btn);
        },
      },
    ],
  },

  // ─────────────────────────────────────────────── admin geral · regras
  {
    id: "admin-regras",
    nome: "Administrador geral · níveis e verificação",
    falas: [
      {
        texto:
          "Somente o administrador geral gerencia os níveis do clube.",
        acao: async (p, h) => {
          await h.login(CONTAS.admin.email, CONTAS.admin.senha);
          await h.goto("/admin/levels");
        },
      },
      {
        texto:
          "Aqui está o Nível A: dois sets vencedores, super tiebreak de dez pontos e a pontuação de cada desfecho.",
        acao: async (p, h) => {
          await h.click(
            p
              .locator("section.card", { hasText: "Nível A" })
              .first()
              .getByRole("link", { name: "Editar" }),
          );
        },
      },
      {
        texto:
          "Também se define aqui o ponto de quem perde o tiebreakão e a ordem dos critérios de desempate.",
        acao: async (p) => {
          await p
            .getByText("Critérios de desempate")
            .first()
            .scrollIntoViewIfNeeded();
        },
      },
      {
        texto:
          "Salvar recalcula e republica apenas este nível, sem tocar nos demais.",
        acao: async (p, h) => {
          await h.click(p.getByRole("button", { name: "Salvar alterações" }));
          await p.waitForURL("**/admin/levels", { timeout: 90000 });
        },
      },
      {
        texto:
          "Por fim, a verificação de consistência: recalcula cada ranking a partir dos resultados oficiais e compara com o que está publicado.",
        acao: async (p, h) => {
          await h.goto("/admin/verify");
          await h.click(
            p.getByRole("button", { name: "Verificar consistência agora" }),
          );
          await p.waitForFunction(
            (alvos) =>
              (document.body.innerText.match(/Consistente/g) || []).length >=
              alvos,
            4,
            { timeout: 90000 },
          );
        },
      },
      {
        texto:
          "Tudo consistente. Os quatro rankings públicos conferem com o recálculo.",
      },
    ],
  },

  // ─────────────────────────────────────────────── encerramento
  {
    id: "encerramento",
    nome: "Encerramento",
    card: {
      kicker: "Ranking de Tênis · Demonstração",
      titulo: "Demonstração concluída",
      subtitulo: "Obrigado por assistir. Bons jogos!",
      itens: [
        "Páginas públicas rápidas e estáticas",
        "Auto-cadastro com aprovação de administrador",
        "Resultados com validação e dupla confirmação",
        "Escopo por nível e administrador geral",
        "Rankings sempre consistentes",
      ],
    },
    falas: [
      {
        texto:
          "Nesta demonstração vimos as páginas públicas, o auto-cadastro com aprovação, o informe de resultados, os administradores de nível e o administrador geral.",
        acao: async (p, h) => {
          await h.card();
        },
      },
      {
        texto: "Obrigado por assistir. Este foi o Ranking de Tênis. Bons jogos!",
      },
    ],
  },
];
