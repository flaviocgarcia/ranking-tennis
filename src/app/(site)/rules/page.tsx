import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Regulamento — F CHALLENGER",
  description:
    "Formatos, pontuação, limite por semestre e caducidade dos pontos do F CHALLENGER.",
};

/**
 * Regulamento do F CHALLENGER — página 100% estática (nenhuma consulta).
 * As regras abaixo são exatamente as implementadas em
 * `src/lib/domain/challenger.ts` (única fonte de cálculo do ranking).
 */
export default function RulesPage() {
  return (
    <>
      <h1 className="page-title">Regulamento do F CHALLENGER</h1>
      <p className="page-sub">
        Jogos livres entre os atletas do torneio, partidas Normais ou Grand
        Slams, pontuação que caduca ao completar 1 ano.
      </p>

      <section className="card">
        <h2>1. Partidas</h2>
        <ul>
          <li>
            <strong>Normal:</strong> melhor de 3 sets. Em caso de empate 1-1 o
            3º set é o <em>tiebreakão</em> (1º a 10 pontos, vantagem de 2 —
            ex.: 10-8 ou 12-10). Jogos registrados com 3º set{" "}
            <strong>comum</strong> (ex.: 6-4) também são aceitos e pontuam da
            mesma forma.
          </li>
          <li>
            <strong>Grand Slam:</strong> melhor de 5 sets, <em>sem</em>{" "}
            tiebreakão — a partida só termina quando um atleta fecha 3 sets.
          </li>
          <li>
            <strong>W.O.:</strong> um dos atletas não apareceu sem avisar. Não
            há placar: quem compareceu vence por 300 x 0.
          </li>
          <li>
            O resultado deve ser informado no <strong>mesmo dia</strong> da
            partida e entra como pendente até a confirmação do administrador.
          </li>
          <li>
            <strong>Limite por semestre:</strong> no máximo{" "}
            <strong>2 partidas</strong> por semestre contra o MESMO adversário
            (em 2025, ano de estreia, vale 1). Um novo semestre zera a
            contagem.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>2. Pontuação</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Formato</th>
                <th className="num">Vencedor</th>
                <th className="num">Perdedor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Normal — vitória por 2 x 0</td>
                <td className="num">
                  <strong>300</strong>
                </td>
                <td className="num">50</td>
              </tr>
              <tr>
                <td>Normal — vitória por 2 x 1</td>
                <td className="num">
                  <strong>200</strong>
                </td>
                <td className="num">100</td>
              </tr>
              <tr>
                <td>Grand Slam — perdedor sem set (3 x 0)</td>
                <td className="num">
                  <strong>450</strong>
                </td>
                <td className="num">75</td>
              </tr>
              <tr>
                <td>Grand Slam — perdedor com 1 set (3 x 1)</td>
                <td className="num">
                  <strong>450</strong>
                </td>
                <td className="num">150</td>
              </tr>
              <tr>
                <td>Grand Slam — perdedor com 2 sets (3 x 2)</td>
                <td className="num">
                  <strong>450</strong>
                </td>
                <td className="num">300</td>
              </tr>
              <tr>
                <td>W.O. (incomparecimento)</td>
                <td className="num">
                  <strong>300</strong>
                </td>
                <td className="num">0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>3. Validade dos pontos</h2>
        <ul>
          <li>
            Os pontos de uma partida <strong>caducam ao completar 1 ano</strong>{" "}
            da data do jogo — a classificação considera apenas as partidas dos
            últimos 12 meses.
          </li>
          <li>
            Quem tem 0 jogos na janela não aparece na classificação; a média é
            a divisão entre pontos e jogos (JGS) da janela.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>4. Classificação</h2>
        <ul>
          <li>
            Ordenação por <strong>pontos</strong> (maior primeiro). A coluna
            <em> #</em> é a posição competitiva.
          </li>
          <li>
            <strong>Empate de pontos:</strong> os empatados compartilham a
            mesma posição (ex.: 1, 2, <strong>2</strong>, 4) e são exibidos em
            ordem alfabética — não existe critério de desempate.
          </li>
          <li>
            Colunas: posição, atleta, pontos, jogos (JGS) e média de pontos por
            jogo.
          </li>
          <li>
            Apenas partidas <strong>confirmadas</strong> pelo administrador
            pontuam.
          </li>
        </ul>
        <p className="small">
          <Link href="/rankings">Ver a classificação →</Link>
        </p>
      </section>
    </>
  );
}
