import Link from "next/link";
import { clubName } from "@/lib/env";

/**
 * Página inicial — 100% estática (nenhuma consulta ao banco,
 * nenhum JavaScript de cliente, nenhum recurso externo).
 */
export default function HomePage() {
  return (
    <>
      <section className="hero">
        <img
          src="/logo-challenge.png"
          width={88}
          height={88}
          alt="Logo F CHALLENGER"
          className="hero-logo"
        />
        <h1>F CHALLENGER — classificação oficial</h1>
        <p>
          {clubName()}: partidas Normais e Grand Slams informadas pelos próprios
          jogadores ou pelo administrador, confirmadas pelo administrador e
          publicadas em um ranking transparente — com pontuação que caduca ao
          completar 1 ano.
        </p>
        <div className="row-actions">
          <Link href="/rankings" className="btn">
            Ver classificação
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Área do jogador
          </Link>
        </div>
      </section>

      <section className="grid mt">
        <Link href="/rankings" className="link-card">
          <div className="title">Classificação</div>
          <div className="desc">
            Posição, pontos, jogos (JGS) e média — só valem os jogos dos
            últimos 12 meses.
          </div>
        </Link>
        <Link href="/results" className="link-card">
          <div className="title">Resultados</div>
          <div className="desc">
            Lista de partidas confirmadas, com placar, formato e vencedor de
            cada jogo.
          </div>
        </Link>
        <Link href="/rules" className="link-card">
          <div className="title">Regulamento</div>
          <div className="desc">
            Formatos, pontuação, limite por semestre e caducidade dos pontos.
          </div>
        </Link>
        <Link href="/ativar" className="link-card">
          <div className="title">Ativar cadastro</div>
          <div className="desc">
            Atleta do torneio? Ative sua conta com o código enviado pelo
            administrador.
          </div>
        </Link>
      </section>

      <section className="card mt">
        <h2>Como funciona</h2>
        <ol>
          <li>
            Qualquer jogador (ou o administrador) informa o resultado de uma
            partida — Normal, Grand Slam ou W.O.
          </li>
          <li>O administrador confirma — ou rejeita — o resultado.</li>
          <li>
            A classificação é atualizada na hora e os pontos caducam após 1
            ano, sem cron nenhum.
          </li>
        </ol>
        <p className="muted small">
          Sem cadastro automático de tudo: o histórico fica paginado e o
          ranking público é servido estaticamente.
        </p>
      </section>
    </>
  );
}
