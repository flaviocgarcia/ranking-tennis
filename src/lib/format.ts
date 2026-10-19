/** Formatação compartilhada (datas e placares). */

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export type Pair = [number, number];

/** Placar compacto: "6-4 5-7 10-6". */
export function scoreText(sets: Pair[] | null | undefined): string {
  if (!Array.isArray(sets) || sets.length === 0) return "—";
  return sets.map(([a, b]) => `${a}-${b}`).join(" ");
}

/** Vencedor de uma partida já confirmada (para exibição). */
export function resultVerdict(
  sets: Pair[] | null | undefined,
): "p1" | "p2" | null {
  if (!Array.isArray(sets) || sets.length === 0) return null;
  let p1 = 0;
  let p2 = 0;
  for (const [a, b] of sets) {
    if (a > b) p1++;
    else if (b > a) p2++;
  }
  if (p1 > p2) return "p1";
  if (p2 > p1) return "p2";
  return null;
}
