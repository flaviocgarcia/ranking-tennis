import { redirect } from "next/navigation";

/**
 * O auto-cadastro aberto não existe mais: o F CHALLENGER é fechado, por
 * convite. O caminho antigo redireciona para a ativação por código.
 */
export default function RegisterPage() {
  redirect("/ativar");
}
