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

/**
 * iPhone fora da tela de início não recebe push web (regra da Apple,
 * iOS 16.4+). Checamos `navigator.standalone` (Safari) e também o
 * display-mode do manifesto — cobre aberturas via Chrome iOS/Edge iOS.
 */
function iosSemApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (!isIos()) return false;
  if (nav.standalone === true) return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return false;
  } catch {
    // matchMedia indisponível — segue com o standalone do Safari.
  }
  return true;
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
      // iPhone: o service worker precisa estar INSTALADO E ATIVO antes do
      // subscribe — registrar só no clique deixa o iOS com race condition.
      // Registramos já na primeira renderização do card.
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
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
      // Ordem que o iOS exige: SW instalado e ATIVO → permissão → subscribe.
      // `serviceWorker.ready` só resolve quando há um SW ativo no escopo.
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
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
        const reg = await navigator.serviceWorker.ready;
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
      } catch (e) {
        // Navegadores restringem o Push API em janelas anônimas/headless;
        // no iPhone, falha comum = app aberto fora da tela de início.
        const motivo = e instanceof Error ? e.message : "";
        alert(
          "Não foi possível ativar as notificações neste navegador." +
            (motivo ? ` Detalhe: ${motivo}.` : "") +
            " Confira se o site está aberto pelo ícone da Tela de Início " +
            "(no iPhone) ou em uma janela normal (no computador) e tente de novo.",
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
          As notificações estão bloqueadas.{" "}
          {isIos()
            ? "No iPhone: Ajustes → Notificações → o app do clube → permitir notificações."
            : "Libere-as nas configurações do navegador (ícone de cadeado na barra de endereço)."}{" "}
          Depois toque em &quot;Ativar notificações&quot; de novo.
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
          <strong>No iPhone (iOS 16.4+)</strong> as notificações só funcionam
          no app instalado na Tela de Início. Passo a passo:
          <br />
          1. No Safari, toque em <strong>Compartilhar</strong> (quadrado com
          seta) → <strong>Adicionar à Tela de Início</strong> →{" "}
          <strong>Adicionar</strong>.
          <br />
          2. Abra o app <strong>pelo ícone novo</strong> na Tela de Início
          (faça login de novo se o app pedir).
          <br />
          3. Volte nesta tela e toque em{" "}
          <strong>&quot;Ativar notificações&quot;</strong>.
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
