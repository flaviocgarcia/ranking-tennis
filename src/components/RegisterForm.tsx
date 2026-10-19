"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { initialsFromName } from "@/lib/domain/initials";

export function RegisterForm({
  levels,
}: {
  levels: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [levelId, setLevelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
    });
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa de ao menos 8 caracteres.");
      return;
    }
    if (!levelId) {
      setError("Escolha o nível em que você joga.");
      return;
    }
    setPending(true);
    const supabase = createSupabaseBrowser();
    const trimmedName = name.trim();
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // `level_id` é validado no banco (trigger): precisa existir e estar
        // ativo. `role` NUNCA é lido das metadata (escalação de privilégio).
        data: {
          name: trimmedName,
          initials: initialsFromName(trimmedName),
          level_id: levelId,
        },
      },
    });
    if (err) {
      const msg = err.message.toLowerCase();
      setError(
        msg.includes("rate") || msg.includes("security purposes")
          ? "Muitas tentativas neste momento. Aguarde alguns minutos."
          : msg.includes("already")
            ? "Este e-mail já está cadastrado. Faça login."
            : "Não foi possível concluir o cadastro agora.",
      );
      setPending(false);
      return;
    }
    if (data.session) {
      router.replace("/app");
      router.refresh();
      return;
    }
    setDone(true);
    setPending(false);
  }

  if (done) {
    return (
      <div className="alert alert-ok">
        Cadastro iniciado! Confirme seu e-mail (se solicitado) e entre com seus
        dados. Seu cadastro será analisado pelo administrador antes de entrar no
        ranking. <Link href="/login">Ir para o login</Link>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input
          id="name"
          type="text"
          required
          maxLength={120}
          placeholder="Como deve aparecer no ranking"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="level_id">Nível em que você joga</label>
        <select
          id="level_id"
          name="level_id"
          required
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
          disabled={levels.length === 0}
        >
          <option value="" disabled>
            {levels.length === 0 ? "Nenhum nível disponível" : "Selecione..."}
          </option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {levels.length === 0 && (
          <p className="hint">
            Nenhum nível ativo no momento. Fale com o administrador do clube.
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="password">
          Senha <span className="hint">mínimo 8 caracteres</span>
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" disabled={pending || levels.length === 0}>
        {pending ? "Cadastrando..." : "Criar conta"}
      </button>
      <p className="small muted">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
      <p className="small muted">
        O cadastro escolhe o nível, mas só é aceito após a aprovação do
        administrador. Até lá você entra no sistema, porém não aparece no
        ranking nem informa resultados.
      </p>
    </form>
  );
}
