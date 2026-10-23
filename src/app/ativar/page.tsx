import type { Metadata } from "next";
import Link from "next/link";
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
          <img src="/logo-challenge.png" width={30} height={30} alt="" className="brand-logo" />
          {clubName()}
        </p>
        <h1 className="center" style={{ fontSize: 20 }}>
          Ativar cadastro
        </h1>
        <p className="center muted small" style={{ marginTop: 4 }}>
          Cadastro dos atletas do F CHALLENGER por código de ativação.
        </p>
        <div className="alert alert-warn small" style={{ marginTop: 12 }}>
          <strong>Recebeu e-mail e senha temporária do administrador?</strong>{" "}
          Esta página não é para você. Entre em{" "}
          <Link href="/login">/login</Link> com esses dados; no primeiro acesso
          o sistema pede para criar a sua senha definitiva. O código de
          ativação é só para quem foi pré-cadastrado sem senha.
        </div>
        <ActivationForm />
      </div>
    </div>
  );
}
