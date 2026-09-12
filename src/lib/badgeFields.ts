// The fixed vocabulary of measurable things a badge condition can
// reference. Admin picks from these — never writes arbitrary logic —
// which keeps "admin edits badge conditions" safe. Must stay in sync
// with the v_valid_fields array in admin_upsert_badge() (SQL).
export const LEVEL_SPECIFIC_FIELDS: Record<string, { field: string; label: string }[]> = {
  me: [
    { field: "move_me_weeks", label: "Move Me — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "sleep_me_weeks", label: "Sleep Me — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "eat_me_weeks", label: "Eat Me — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "know_me_weeks", label: "Know Me — จำนวนสัปดาห์ที่สำเร็จ" },
  ],
  we: [
    { field: "buddy_walk_weeks", label: "Buddy Walk — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "buddy_lunch_weeks", label: "Buddy Lunch — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "hydration_buddy_weeks", label: "Hydration Buddy — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "buddy_stretch_weeks", label: "Buddy Stretch — จำนวนสัปดาห์ที่สำเร็จ" },
  ],
  us: [
    { field: "big_step_weeks", label: "Big Step Challenge — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "zero_sugar_weeks", label: "Zero Sugar Squad — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "lunch_walk_weeks", label: "Lunch Walk & Talk — จำนวนสัปดาห์ที่สำเร็จ" },
    { field: "gratitude_weeks", label: "Gratitude — จำนวนสัปดาห์ที่สำเร็จ" },
  ],
};

export const GENERIC_FIELDS: { field: string; label: string }[] = [
  { field: "all_complete_weeks", label: "จำนวนสัปดาห์ที่ทำครบทุกภารกิจในระดับนี้" },
  { field: "streak_weeks", label: "จำนวนสัปดาห์ติดต่อกันที่ทำสำเร็จอย่างน้อย 1 ภารกิจ" },
  { field: "total_steps", label: "ยอดสะสม (ก้าว) ของภารกิจหลักในระดับนี้" },
  { field: "total_completions", label: "จำนวนครั้งที่ทำสำเร็จรวมทั้งหมดในระดับนี้" },
  { field: "distinct_types", label: "จำนวนประเภทภารกิจที่ทำสำเร็จอย่างน้อย 1 ครั้ง" },
  { field: "total_points", label: "คะแนนรวมที่ได้ในระดับนี้" },
  { field: "first_week_done", label: "ทำสำเร็จในสัปดาห์แรกของระดับนี้ (1 = ใช่)" },
  { field: "last_week_done", label: "ทำสำเร็จในสัปดาห์สุดท้ายของระดับนี้ (1 = ใช่)" },
];

export function getFieldOptions(level: string) {
  return [...(LEVEL_SPECIFIC_FIELDS[level] ?? []), ...GENERIC_FIELDS];
}
