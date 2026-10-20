"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (/sw.js).
 *
 * Só em produção: em desenvolvimento o cache do worker atrapalha o hot
 * reload do Next. Falha na instalação é silenciosa — o site continua
 * funcionando normalmente como site comum.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        /* instalação é opcional */
      });
  }, []);

  return null;
}
