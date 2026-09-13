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
] as const;

const COMMON_FIELDS = [
  { field: "streak_weeks", label: "จำนวนสัปดาห์ติดต่อกันที่ทำสำเร็จอย่างน้อย 1 ครั้ง" },
  { field: "total_completions", label: "จำนวนครั้งที่ทำสำเร็จรวมทั้งหมดในธีมนี้" },
  { field: "total_points", label: "คะแนนรวมที่ได้จากภารกิจในธีมนี้" },
];

const VARIETY_FIELD = { field: "distinct_missions", label: "จำนวนภารกิจที่ต่างกันที่ทำสำเร็จอย่างน้อย 1 ครั้ง" };

// "rest" (พัก) currently has only 1 real mission (Sleep Me), so a
// "tried N different missions" badge doesn't make sense there.
export function getFieldOptions(theme: string) {
  if (theme === "rest") return COMMON_FIELDS;
  return [...COMMON_FIELDS, VARIETY_FIELD];
}
