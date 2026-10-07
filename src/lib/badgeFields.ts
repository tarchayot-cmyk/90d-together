// The fixed vocabulary of measurable things a badge condition can
// reference — now theme-based (5 wellness themes cutting across all
// levels) instead of the old per-level/per-mission vocabulary.
// Admin picks from these — never writes arbitrary logic — which
// keeps "admin edits badge conditions" safe. Must stay in sync with
// get_badge_measurements() (SQL) and the v_valid_fields concept in
// admin_upsert_badge().
export const THEMES = [
  { value: "move", label: "🏃 กาย (Move)" },
  { value: "fuel", label: "🍽️ กิน (Fuel)" },
  { value: "rest", label: "😴 พัก (Rest)" },
  { value: "mind", label: "🧠 ใจ (Mind)" },
  { value: "connect", label: "🤝 สังคม (Connect)" },
  { value: "goal", label: "🎯 เป้ารายสัปดาห์ (Goal)" },
] as const;

const COMMON_FIELDS = [
  { field: "streak_weeks", label: "จำนวนสัปดาห์ติดต่อกันที่ทำสำเร็จอย่างน้อย 1 ครั้ง" },
  { field: "total_completions", label: "จำนวนครั้งที่ทำสำเร็จรวมทั้งหมดในธีมนี้" },
  { field: "total_points", label: "คะแนนรวมที่ได้จากภารกิจในธีมนี้" },
];

const VARIETY_FIELD = { field: "distinct_missions", label: "จำนวนภารกิจที่ต่างกันที่ทำสำเร็จอย่างน้อย 1 ครั้ง" };

// Every theme now has enough missions for a "variety" badge
// (rest grew from 1 mission to 7), so no exclusions remain.
// "goal" badges count completed weekly goals (weekly_goals table), not missions.
const GOAL_FIELDS = [
  { field: "weeks_2", label: "จำนวนสัปดาห์ที่ทำเป้า 2 วันขึ้นไปสำเร็จ" },
  { field: "weeks_4", label: "จำนวนสัปดาห์ที่ทำเป้า 4 วันขึ้นไปสำเร็จ" },
  { field: "weeks_6", label: "จำนวนสัปดาห์ที่ทำเป้า 6 วันสำเร็จ" },
];

export function getFieldOptions(theme: string) {
  if (theme === "goal") return GOAL_FIELDS;
  return [...COMMON_FIELDS, VARIETY_FIELD];
}
