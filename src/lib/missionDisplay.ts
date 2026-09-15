export const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

// A mission's target_value is the amount required per submission, not
// a running weekly total — so the natural period to show it against
// is "per day" when the mission is meant to be done daily
// (max_per_day is set), and "per week" only for missions capped at
// once per week with no daily cadence.
export function targetPeriodLabel(maxPerDay: number | null): string {
  return maxPerDay ? "วัน" : "สัปดาห์";
}

export function limitSummary(maxPerWeek: number, maxPerDay: number | null): string | null {
  const parts: string[] = [];
  if (maxPerDay) parts.push(`สูงสุด ${maxPerDay} ครั้ง/วัน`);
  if (maxPerWeek) parts.push(`${maxPerDay ? "" : "สูงสุด "}${maxPerWeek} ครั้ง/สัปดาห์`);
  if (parts.length === 0) return null;
  return parts.join(", ");
}
