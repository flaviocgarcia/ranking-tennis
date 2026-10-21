"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitMatchAction, saveMatchAdminAction } from "@/actions/matches";
import {
  MATCH_FORMAT_LABELS,
  maxSetsFor,
  type MatchFormat,
} from "@/lib/domain/challenger";
import type { ActionResult } from "@/types/db";

/**
 * Formulário de resultado (usado por jogadores e pelo administrador).
 *
 * Todos os dados (níveis e jogadores) chegam PRONTOS do servidor —
 * nenhuma chamada de rede por tecla, por linha ou por consulta em tempo
 * real. O placar é validado de novo no servidor.
 *
 * F CHALLENGER: a partida tem formato — Normal (melhor de 3, 3º set =
 * tiebreakão), Grand Slam (melhor de 5, sem tiebreakão) ou W.O.
 * (incomparecimento, com vencedor declarado).
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
  format?: MatchFormat;
  walkoverWinner?: 1 | 2 | null;
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

const FORMAT_HINTS: Record<MatchFormat, string> = {
  normal:
    "Normal: melhor de 3 — 2 sets para vencer; o 3º set (empate 1-1) é o tiebreakão (1º a 10, vantagem de 2 — ex.: 10-12) e set comum (ex.: 6-4) também vale. Digite no formato 6-4.",
  grand_slam:
    "Grand Slam: melhor de 5, sem tiebreakão — a partida só termina quando um jogador fecha 3 sets. Digite no formato 6-4.",
  walkover:
    "W.O.: use apenas quando um jogador NÃO apareceu sem avisar (300 pts para quem venceu, 50 para o faltoso). Não há placar.",
};

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
  const [format, setFormat] = useState<MatchFormat>(initial?.format ?? "normal");
  const [walkoverWinner, setWalkoverWinner] = useState<string>(
    initial?.walkoverWinner ? String(initial.walkoverWinner) : "",
  );
  const [sets, setSets] = useState<string[]>(
    initial?.sets && initial.sets.length > 0 ? initial.sets : ["", ""],
  );

  const maxSets = maxSetsFor(format);

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

  const bothSelected =
    mode === "player"
      ? opponent !== ""
      : player1 !== "" && player2 !== "" && player1 !== player2;
  const filledSets = sets.filter((s) => s.trim() !== "");
  const canSubmit =
    bothSelected &&
    !pending &&
    (format === "walkover" ? walkoverWinner !== "" : filledSets.length > 0);

  function changeFormat(next: MatchFormat) {
    setFormat(next);
    // Corta sets acima do limite do novo formato (ex.: 5 → 3 ao trocar
    // de Grand Slam para Normal).
    setSets((prev) => {
      const cap = maxSetsFor(next);
      return cap > 0 ? (prev.length > cap ? prev.slice(0, cap) : prev) : prev;
    });
  }

  function updateSet(index: number, value: string) {
    // Só dígitos e um hífen, até 2 dígitos por lado — o bastante para
    // tiebreakões como 10-12 e 12-10. O formato e a validação do placar
    // acontecem no servidor (`parseSetStrings` + `validateChallengerScore`).
    const sides = value.replace(/[^\d-]/g, "").split("-");
    const clean =
      sides.length > 1
        ? `${(sides[0] ?? "").slice(0, 2)}-${(sides[1] ?? "").slice(0, 2)}`
        : (sides[0] ?? "").slice(0, 2);
    setSets((prev) => prev.map((s, i) => (i === index ? clean : s)));
  }

  const p1Name =
    mode === "admin"
      ? players.find((p) => p.id === player1)?.name ?? "Jogador 1"
      : "Você";
  const p2Name =
    mode === "admin"
      ? players.find((p) => p.id === player2)?.name ?? "Jogador 2"
      : players.find((p) => p.id === opponent)?.name ?? "Adversário";

  return (
    <form className="form" action={formAction}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}

      {initial?.id && <input type="hidden" name="match_id" value={initial.id} />}
      <input type="hidden" name="format" value={format} />

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
          <label htmlFor="played_on">
            Data da partida{" "}
            <span className="hint">O regulamento pede informar no mesmo dia.</span>
          </label>
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
          Formato{" "}
          <span className="hint">
            Normal e Grand Slam valem 300-200/50-100 e 450-75/150-300; W.O. vale
            300/50.
          </span>
        </label>
        <div className="inline-fields" role="radiogroup" aria-label="Formato">
          {(Object.keys(MATCH_FORMAT_LABELS) as MatchFormat[]).map((f) => (
            <label key={f} className="hint" style={{ display: "flex", gap: 6 }}>
              <input
                type="radio"
                name="format_radio"
                value={f}
                checked={format === f}
                onChange={() => changeFormat(f)}
              />
              {MATCH_FORMAT_LABELS[f]}
            </label>
          ))}
        </div>
      </div>

      {format === "walkover" ? (
        <div className="field">
          <label>
            Quem venceu o W.O.?{" "}
            <span className="hint">Só registre W.O. se realmente não houve jogo.</span>
          </label>
          <div className="inline-fields" role="radiogroup" aria-label="Vencedor do W.O.">
            <label style={{ display: "flex", gap: 6 }}>
              <input
                type="radio"
                name="walkover_winner"
                value="1"
                checked={walkoverWinner === "1"}
                onChange={() => setWalkoverWinner("1")}
                required
              />
              {p1Name}
            </label>
            <label style={{ display: "flex", gap: 6 }}>
              <input
                type="radio"
                name="walkover_winner"
                value="2"
                checked={walkoverWinner === "2"}
                onChange={() => setWalkoverWinner("2")}
                required
              />
              {p2Name}
            </label>
          </div>
        </div>
      ) : (
        <div className="field">
          <label>
            Placar <span className="hint">{FORMAT_HINTS[format]}</span>
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
      )}

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
              ? "A classificação será atualizada na hora."
              : "Ficará pendente até confirmação."}
        </span>
      </div>
    </form>
  );
}
