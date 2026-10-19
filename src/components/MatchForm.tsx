"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitMatchAction, saveMatchAdminAction } from "@/actions/matches";
import type { ActionResult } from "@/types/db";

/**
 * Formulário de resultado (usado por jogadores e pelo administrador).
 *
 * Todos os dados (níveis e jogadores) chegam PRONTOS do servidor —
 * nenhuma chamada de rede por tecla, por linha ou por consulta em tempo
 * real. O placar é validado de novo no servidor.
 */

export interface LevelOpt {
  id: string;
  name: string;
  setsToWin: number;
  superTiebreakEnabled: boolean;
  superPoints: number;
}

export interface PlayerOpt {
  id: string;
  name: string;
  /** Presente nas listas administrativas; usado para filtrar por nível. */
  level_id?: string | null;
}

export interface MatchFormInitial {
  id?: string;
  levelId: string;
  player1Id?: string;
  player2Id?: string;
  playedOn?: string;
  sets?: string[];
  status?: "pending" | "confirmed";
}

interface Props {
  mode: "player" | "admin";
  levels: LevelOpt[];
  players: PlayerOpt[];
  initial?: MatchFormInitial;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MatchForm({ mode, levels, players, initial }: Props) {
  const router = useRouter();
  const action = mode === "player" ? submitMatchAction : saveMatchAdminAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  const [levelId, setLevelId] = useState(initial?.levelId ?? levels[0]?.id ?? "");
  const [player1, setPlayer1] = useState(initial?.player1Id ?? "");
  const [player2, setPlayer2] = useState(initial?.player2Id ?? "");
  const [opponent, setOpponent] = useState(initial?.player2Id ?? initial?.player1Id ?? "");
  const [playedOn, setPlayedOn] = useState(initial?.playedOn ?? todayISO());
  const [status, setStatus] = useState<"pending" | "confirmed">(
    initial?.status ?? "confirmed",
  );
  const [sets, setSets] = useState<string[]>(
    initial?.sets && initial.sets.length > 0 ? initial.sets : ["", ""],
  );

  const level = levels.find((l) => l.id === levelId);
  const maxSets = level ? level.setsToWin * 2 - 1 : 3;

  const playersOfLevel =
    mode === "admin"
      ? players.filter((p) => p.level_id === levelId)
      : players;

  useEffect(() => {
    if (state?.ok) {
      router.push(mode === "admin" ? "/admin/results" : "/app/results");
      router.refresh();
    }
  }, [state, router, mode]);

  const bothSelected = mode === "player" ? opponent !== "" : player1 !== "" && player2 !== "" && player1 !== player2;
  const filledSets = sets.filter((s) => s.trim() !== "");
  const canSubmit = bothSelected && filledSets.length > 0 && !pending;

  function updateSet(index: number, value: string) {
    // Só dígitos e um hífen, até 2 dígitos por lado — o bastante para
    // tiebreakões como 10-12 e 12-10. O formato e a validação do placar
    // acontecem no servidor (`parseSetStrings` + `validateMatchScore`).
    const sides = value.replace(/[^\d-]/g, "").split("-");
    const clean =
      sides.length > 1
        ? `${(sides[0] ?? "").slice(0, 2)}-${(sides[1] ?? "").slice(0, 2)}`
        : (sides[0] ?? "").slice(0, 2);
    setSets((prev) => prev.map((s, i) => (i === index ? clean : s)));
  }

  return (
    <form className="form" action={formAction}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}

      {initial?.id && <input type="hidden" name="match_id" value={initial.id} />}

      {mode === "admin" && (
        <div className="inline-fields">
          <div className="field">
            <label htmlFor="level_id">Nível</label>
            <select
              id="level_id"
              name="level_id"
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setPlayer1("");
                setPlayer2("");
              }}
              required
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Situação</label>
            <select
              id="status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "confirmed")}
            >
              <option value="confirmed">Confirmado (entra no ranking)</option>
              <option value="pending">Pendente (aguarda confirmação)</option>
            </select>
          </div>
        </div>
      )}

      <div className="inline-fields">
        {mode === "player" ? (
          <div className="field">
            <label htmlFor="opponent_id">Adversário</label>
            <select
              id="opponent_id"
              name="opponent_id"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {playersOfLevel.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="player1_id">Jogador 1 (lado do placar)</label>
              <select
                id="player1_id"
                name="player1_id"
                value={player1}
                onChange={(e) => setPlayer1(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {playersOfLevel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="player2_id">Jogador 2</label>
              <select
                id="player2_id"
                name="player2_id"
                value={player2}
                onChange={(e) => setPlayer2(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {playersOfLevel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="played_on">Data da partida</label>
          <input
            id="played_on"
            type="date"
            name="played_on"
            value={playedOn}
            max={todayISO()}
            onChange={(e) => setPlayedOn(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label>
          Placar{" "}
          <span className="hint">
            {level
              ? `${level.name}: ${level.setsToWin} sets para vencer${
                  level.superTiebreakEnabled
                    ? `; set decisivo é tiebreakão (1º a ${level.superPoints}, vantagem de 2 — ex.: 10-12)`
                    : ""
                }. Digite no formato 6-4.`
              : "Digite no formato 6-4."}
          </span>
        </label>
        <div className="set-sets">
          {sets.map((value, i) => (
            <div className="set-row" key={i}>
              <span className="muted small" style={{ width: 46 }}>
                Set {i + 1}
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-4"
                value={value}
                aria-label={`Placar do set ${i + 1}`}
                onChange={(e) => updateSet(i, e.target.value)}
              />
              {sets.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSets((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
        {sets.length < maxSets && (
          <button
            type="button"
            className="btn btn-secondary btn-sm mt"
            onClick={() => setSets((prev) => [...prev, ""])}
          >
            + Adicionar set
          </button>
        )}
        {/* Valores do placar enviados ao servidor (linhas não vazias). */}
        {filledSets.map((s, i) => (
          <input key={`h${i}`} type="hidden" name="set" value={s} />
        ))}
      </div>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={!canSubmit}>
          {pending
            ? "Salvando..."
            : mode === "admin"
              ? "Salvar resultado"
              : "Informar resultado"}
        </button>
        <span className="muted small">
          {mode === "player"
            ? "Fica pendente até a confirmação do administrador."
            : status === "confirmed"
              ? "O ranking do nível será recalculado na hora."
              : "Ficará pendente até confirmação."}
        </span>
      </div>
    </form>
  );
}
