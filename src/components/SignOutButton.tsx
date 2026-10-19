"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/actions/auth";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOutAction();
        router.replace("/login");
        router.refresh();
      }}
    >
      {pending ? "Saindo..." : "Sair"}
    </button>
  );
}
