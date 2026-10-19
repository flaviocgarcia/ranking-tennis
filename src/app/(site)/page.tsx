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
        <h1>Classificação oficial de tênis</h1>
        <p>
          {clubName()}: resultados informados pelos próprios jogadores ou pelo
          administrador, confirmados pelo administrador e publicados em um
          ranking transparente, calculado a partir das regras de cada nível.
        </p>
        <div className="row-actions">
          <Link href="/rankings" className="btn">
            Ver classificações
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Área do jogador
          </Link>
        </div>
      </section>

      <section className="grid mt">
        <Link href="/rankings" className="link-card">
          <div className="title">Classificações</div>
          <div className="desc">
            Ranking publicado por nível (A, B, C, D ou os que o clube criar).
          </div>
        </Link>
        <Link href="/results" className="link-card">
          <div className="title">Resultados</div>
          <div className="desc">
            Lista de partidas confirmadas, com placar e vencedor de cada jogo.
          </div>
        </Link>
        <Link href="/rules" className="link-card">
          <div className="title">Regras</div>
          <div className="desc">
            Formatos de partida, pontuação e critérios de desempate de cada
            nível.
          </div>
        </Link>
        <Link href="/register" className="link-card">
          <div className="title">Criar conta</div>
          <div className="desc">
            Cadastro pelo próprio jogador — ou peça ao administrador para
            cadastrar você.
          </div>
        </Link>
      </section>

      <section className="card mt">
        <h2>Como funciona</h2>
        <ol>
          <li>
            Qualquer jogador (ou o administrador) informa o resultado de uma
            partida.
          </li>
          <li>O administrador confirma — ou rejeita — o resultado.</li>
          <li>
            Somente o ranking afetado é recalculado e republicado
            imediatamente.
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
