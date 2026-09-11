export const KINDNESS_CATEGORIES = [
  { value: "help", emoji: "❤️", label: "ช่วยงาน" },
  { value: "walk_invite", emoji: "🚶", label: "ชวนเดิน" },
  { value: "compliment", emoji: "💬", label: "ชื่นชม" },
  { value: "encourage", emoji: "🤝", label: "ให้กำลังใจ" },
  { value: "healthy_food_invite", emoji: "🥗", label: "ชวนกินดี" },
  { value: "rest_stretch_invite", emoji: "🧘", label: "ชวนพัก/ยืดเหยียด" },
] as const;

export type KindnessCategoryValue = (typeof KINDNESS_CATEGORIES)[number]["value"];
