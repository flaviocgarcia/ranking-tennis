"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/actions/push";

type Estado = "verificando" | "desligado" | "ligado" | "negado" | "indisponivel";

/** Converte a chave pública VAPID (base64url) para Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** iPhone fora da tela de início não recebe push web (regra da Apple). */
function iosSemApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return isIos() && nav.standalone !== true;
}

/**
 * Botão de ativar/desativar Web Push (padrão W3C — sem Firebase).
 * A inscrição é salva no servidor via action; o envio acontece nas
 * actions que disparam notificações (chat, resultados, avisos).
 */
export function EnablePush() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [busy, setBusy] = useState(false);
  const [dicaIos, setDicaIos] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        typeof Notification === "undefined"
      ) {
        setEstado("indisponivel");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setEstado(sub ? "ligado" : "desligado");
      } catch {
        setEstado("indisponivel");
      }
    })();
  }, []);

  async function ativar() {
    setBusy(true);
    try {
      if (iosSemApp()) {
        // Não pede permissão fora da tela de início: o iOS negaria e
        // bloquearia pedidos futuros.
        setDicaIos(true);
        return;
      }
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado("negado");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setEstado("indisponivel");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        const json = sub.toJSON();
        const res = await savePushSubscriptionAction({
          endpoint: json.endpoint ?? "",
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });
        if (!res.ok) {
          await sub.unsubscribe();
          setEstado("desligado");
          alert(res.error);
          return;
        }
      } catch {
        // Navegadores restringem o Push API em janelas anônimas/headless.
        alert(
          "Não foi possível ativar as notificações neste navegador. " +
            "Abra o site em uma janela normal e tente de novo.",
        );
        setEstado("desligado");
        return;
      }
      setDicaIos(false);
      setEstado("ligado");
    } finally {
      setBusy(false);
    }
  }

  async function desativar() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.toJSON().endpoint;
        await sub.unsubscribe();
        if (endpoint) await removePushSubscriptionAction(endpoint);
      }
      setEstado("desligado");
    } finally {
      setBusy(false);
    }
  }

  if (estado === "verificando") return null;

  return (
    <div className="card">
      <h2>Notificações</h2>
      {estado === "indisponivel" && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Seu navegador não suporta notificações push.
        </p>
      )}
      {estado === "negado" && (
        <p className="muted" style={{ marginBottom: 0 }}>
          As notificações estão bloqueadas. Libere-as nas configurações do
          navegador (ícone de cadeado na barra de endereço) e tente de novo.
        </p>
      )}
      {estado === "desligado" && !dicaIos && (
        <p style={{ marginBottom: 0 }}>
          Receba avisos de novos resultados, mensagens e comunicados do clube
          mesmo com o site fechado.{" "}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void ativar()}>
            Ativar notificações
          </button>
        </p>
      )}
      {dicaIos && (
        <p style={{ marginBottom: 0 }}>
          <strong>No iPhone:</strong> toque em{" "}
          <strong>Compartilhar → Adicionar à Tela de Início</strong> e abra o
          app pela tela de início — só assim o iOS libera as notificações.
          Depois volte aqui e toque em &quot;Ativar notificações&quot;.
        </p>
      )}
      {estado === "ligado" && (
        <p style={{ marginBottom: 0 }}>
          ✅ Notificações ativadas neste aparelho.{" "}
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void desativar()}>
            Desativar
          </button>
        </p>
      )}
    </div>
  );
}
