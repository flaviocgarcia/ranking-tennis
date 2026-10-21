import type { Metadata } from "next";
import { ActivationForm } from "@/components/ActivationForm";
import { clubName } from "@/lib/env";

export const metadata: Metadata = { title: "Ativar cadastro" };

/**
 * Ativação de conta do F CHALLENGER: os atletas do pré-cadastro entram
 * com o CÓDIGO recebido do administrador, escolhem e-mail e senha e a
 * conta nasce já aprovada (o convite é a aprovação).
 */
export default function ActivatePage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p className="brand center">
          <span className="mark">🎾</span>
          {clubName()}
        </p>
        <h1 className="center" style={{ fontSize: 20 }}>
          Ativar cadastro
        </h1>
        <p className="center muted small" style={{ marginTop: 4 }}>
          Cadastro dos atletas do F CHALLENGER por código de ativação.
        </p>
        <ActivationForm />
      </div>
    </div>
  );
}
