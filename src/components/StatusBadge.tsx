import type { MatchStatus } from "@/types/db";

const LABEL: Record<MatchStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  rejected: "Rejeitado",
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  return <span className={`badge badge-${status}`}>{LABEL[status]}</span>;
}
