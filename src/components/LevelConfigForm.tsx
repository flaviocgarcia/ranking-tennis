"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createLevelAction, updateLevelAction } from "@/actions/levels";
import {
  TIEBREAK_LABELS,
  TIEBREAK_ORDER,
  type LevelConfig,
  type TiebreakKey,
} from "@/lib/domain/config";
import type { ActionResult } from "@/types/db";

interface Initial {
  code: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
  config: LevelConfig;
}

/**
 * Formulário de nível: formato da partida, pontuação, desempate
 * (com reordenção dos critérios) — tudo editável pelo administrador.
 */
export function LevelConfigForm({
  levelId,
  initial,
}: {
  levelId?: string;
  initial?: Initial;
}) {
  const router = useRouter();
  const isEdit = Boolean(levelId);
  const action = isEdit ? updateLevelAction : createLevelAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [active, setActive] = useState(initial?.active ?? true);
  const [setsToWin, setSetsToWin] = useState(String(initial?.config.setsToWin ?? 2));
  const [stEnabled, setStEnabled] = useState(initial?.config.superTiebreak.enabled ?? true);
  const [stPoints, setStPoints] = useState(String(initial?.config.superTiebreak.points ?? 10));
  const [winStraight, setWinStraight] = useState(String(initial?.config.scoring.winStraight ?? 3));
  const [winExtended, setWinExtended] = useState(String(initial?.config.scoring.winExtended ?? 2));
  const [loss, setLoss] = useState(String(initial?.config.scoring.loss ?? 0));
  const [deciderLoserPoint, setDeciderLoserPoint] = useState(
    initial?.config.scoring.deciderLoserPoint ?? true,
  );
  const [tiebreakers, setTiebreakers] = useState<TiebreakKey[]>(
    initial?.config.tiebreakers ?? ["wins", "head_to_head", "set_diff", "game_diff"],
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/admin/levels");
      router.refresh();
    }
  }, [state, router]);

  function toggleTie(key: TiebreakKey) {
    setTiebreakers((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }
  function moveTie(index: number, delta: number) {
    setTiebreakers((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form className="form" action={formAction}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
      {levelId && <input type="hidden" name="id" value={levelId} />}

      <div className="inline-fields">
        <div className="field">
          <label htmlFor="code">Código</label>
          <input
            id="code"
            name="code"
            type="text"
            required
            maxLength={20}
            placeholder="A"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Nome do nível</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder="Nível A"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">
            Slug <span className="hint">URL: /rankings/...</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            maxLength={40}
            placeholder="a"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field" style={{ maxWidth: 120 }}>
          <label htmlFor="sort_order">Ordem</label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
      </div>

      <label className="check">
        <input
          name="active"
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Nível ativo (aparece no site)
      </label>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "4px 0" }} />

      <div className="field">
        <label>Formato da partida</label>
        <div className="inline-fields">
          <div className="field">
            <label htmlFor="setsToWin" className="hint">Sets para vencer</label>
            <select
              id="setsToWin"
              name="setsToWin"
              value={setsToWin}
              onChange={(e) => setSetsToWin(e.target.value)}
            >
              <option value="1">1 (single set)</option>
              <option value="2">2 (melhor de 3)</option>
              <option value="3">3 (melhor de 5)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="stPoints" className="hint">
              Tiebreakão no set decisivo (pontos)
            </label>
            <input
              id="stPoints"
              name="stPoints"
              type="number"
              min={2}
              max={30}
              value={stPoints}
              disabled={!stEnabled}
              onChange={(e) => setStPoints(e.target.value)}
            />
          </div>
        </div>
        <label className="check mt">
          <input
            name="stEnabled"
            type="checkbox"
            checked={stEnabled}
            onChange={(e) => setStEnabled(e.target.checked)}
          />
          Jogar tiebreakão (super tiebreak) quando cada um ganhar um set
        </label>
      </div>

      <div className="field">
        <label>Pontuação</label>
        <div className="inline-fields">
          <div className="field">
            <label htmlFor="winStraight" className="hint">Vitória sem ceder set</label>
            <input
              id="winStraight"
              name="winStraight"
              type="number"
              min={0}
              max={100}
              value={winStraight}
              onChange={(e) => setWinStraight(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="winExtended" className="hint">Vitória cedendo um set</label>
            <input
              id="winExtended"
              name="winExtended"
              type="number"
              min={0}
              max={100}
              value={winExtended}
              onChange={(e) => setWinExtended(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="loss" className="hint">Derrota</label>
            <input
              id="loss"
              name="loss"
              type="number"
              min={0}
              max={100}
              value={loss}
              onChange={(e) => setLoss(e.target.value)}
            />
          </div>
        </div>
        {/* O checkbox não tem `name`: o valor sempre vai no hidden, para que
            "desmarcado" chegue explicitamente como false ao servidor. */}
        <input
          type="hidden"
          name="deciderLoserPoint"
          value={deciderLoserPoint ? "true" : "false"}
        />
        <label className="check mt">
          <input
            type="checkbox"
            checked={deciderLoserPoint}
            onChange={(e) => setDeciderLoserPoint(e.target.checked)}
          />
          Derrotado no tiebreakão ganha 1 ponto{" "}
          <span className="hint">(recomendado)</span>
        </label>
      </div>

      <div className="field">
        <label>
          Critérios de desempate{" "}
          <span className="hint">
            marcados, NA ORDEM aplicada após os pontos
          </span>
        </label>
        <ul className="tie-list">
          {TIEBREAK_ORDER.map((key) => {
            const idx = tiebreakers.indexOf(key);
            const on = idx >= 0;
            return (
              <li key={key} className="tie-item">
                <span className="ord">{on ? idx + 1 : "–"}</span>
                <label className="check" style={{ flex: 1 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleTie(key)} />
                  <span className="name">{TIEBREAK_LABELS[key]}</span>
                </label>
                {on && (
                  <span className="row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label="Subir"
                      onClick={() => moveTie(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label="Descer"
                      onClick={() => moveTie(idx, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {tiebreakers.map((k) => (
          <input key={k} type="hidden" name="tiebreakers" value={k} />
        ))}
      </div>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar nível"}
        </button>
        <span className="muted small">
          Alterações recalculam e republicam apenas este nível.
        </span>
      </div>
    </form>
  );
}
