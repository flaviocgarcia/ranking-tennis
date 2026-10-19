import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { clubName } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p className="brand center">
          <span className="mark">🎾</span>
          {clubName()}
        </p>
        <h1 className="center" style={{ fontSize: 20 }}>
          Área do jogador
        </h1>
        <LoginForm />
      </div>
    </div>
  );
}
