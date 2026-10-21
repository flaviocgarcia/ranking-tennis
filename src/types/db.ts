import type { LevelConfig, ScoreSet } from "@/lib/domain/config";
import type { ChallengerSnapshotData, MatchFormat } from "@/lib/domain/challenger";

export type Role = "admin" | "player";
export type MatchStatus = "pending" | "confirmed" | "rejected";
export type MatchSource = "web" | "telegram" | "admin";

export interface LevelRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  sort_order: number;
  active: boolean;
  config: LevelConfig;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  name: string;
  initials: string;
  role: Role;
  level_id: string | null;
  /** Nível do atleta segundo a planilha (A–D; admite A+, B/C...). Informativo. */
  ref_level: string | null;
  /** Nível do escopo administrativo (admin de um nível); null = geral. */
  admin_level_id: string | null;
  /** true = auto-cadastro aguardando aprovação do administrador. */
  pending_approval: boolean;
  active: boolean;
  must_change_password: boolean;
  telegram_id: number | null;
  telegram_link_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchRow {
  id: string;
  level_id: string;
  player1_id: string;
  player2_id: string;
  sets: ScoreSet[];
  /** Formato: normal (melhor de 3), grand_slam (melhor de 5) ou walkover. */
  format: MatchFormat;
  /** Vencedor do W.O. (1 = player1, 2 = player2); null nos demais formatos. */
  walkover_winner: 1 | 2 | null;
  status: MatchStatus;
  reported_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  played_on: string;
  source: MatchSource;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnapshotRow {
  level_id: string;
  data: ChallengerSnapshotData;
  computed_at: string;
}

export type AvailabilitySlot = "morning" | "afternoon" | "evening" | "any";

export interface AvailabilityRow {
  id: string;
  player_id: string;
  level_id: string;
  /** Data futura em que a pessoa quer jogar (YYYY-MM-DD). */
  play_date: string;
  slot: AvailabilitySlot;
  created_at: string;
  updated_at: string;
}

/** Resultado padrão de uma server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Relatório de verificação de consistência de um nível (§5 do requisito). */
export interface ConsistencyReport {
  levelId: string;
  levelName: string;
  slug: string;
  snapshotAt: string | null;
  matchesUsed: number;
  invalidCount: number;
  consistent: boolean;
  diffs: string[];
}
