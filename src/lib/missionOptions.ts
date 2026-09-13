export const MISSION_CATEGORIES = [
  { value: "know_me", label: "🟢 Know Me", level: "me" },
  { value: "sleep_me", label: "💗 Sleep Me", level: "me" },
  { value: "move_me", label: "🟡 Move Me", level: "me" },
  { value: "eat_me", label: "🔴 Eat Me", level: "me" },
  { value: "buddy_walk", label: "🚶 Buddy Walk", level: "we" },
  { value: "buddy_lunch", label: "🥗 Buddy Lunch", level: "we" },
  { value: "hydration_buddy", label: "💧 Hydration Buddy", level: "we" },
  { value: "buddy_stretch", label: "🧘 Buddy Stretch", level: "we" },
  { value: "big_step", label: "🚀 Big Step Challenge", level: "us" },
  { value: "zero_sugar_squad", label: "🧃 Zero Sugar Squad", level: "us" },
  { value: "lunch_walk_talk", label: "🍽️ Lunch Walk & Talk", level: "us" },
  { value: "gratitude", label: "🌈 Gratitude", level: "us" },
  { value: "other", label: "✨ อื่นๆ (ภารกิจที่สร้างเอง)", level: "any" },
] as const;

export const STICKER_COLORS = [
  { value: "", label: "— ไม่มีสติ๊กเกอร์ —" },
  { value: "green", label: "🟢 Green" },
  { value: "pink", label: "💗 Pink" },
  { value: "yellow", label: "🟡 Yellow" },
  { value: "red", label: "🔴 Red" },
  { value: "purple", label: "🟣 Purple" },
  { value: "orange", label: "🟠 Orange" },
  { value: "rainbow", label: "🌈 Rainbow" },
] as const;

export const LEVELS = [
  { value: "me", label: "🌱 ME" },
  { value: "we", label: "🌿 WE" },
  { value: "us", label: "🌳 US" },
] as const;
