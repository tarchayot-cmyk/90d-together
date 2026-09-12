// Maps each notification_type (from the DB enum) to a user-facing
// category. Purely a display concern — no schema change needed,
// this file is the only place the grouping is defined so the bell
// dropdown and the "View All" page never drift out of sync.
export interface NotificationCategory {
  label: string;
  icon: string;
}

const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  checkin_approved: { label: "อนุมัติ", icon: "✅" },
  checkin_rejected: { label: "อนุมัติ", icon: "❌" },
  proposal_approved: { label: "อนุมัติ", icon: "✅" },
  proposal_rejected: { label: "อนุมัติ", icon: "❌" },
  kindness_received: { label: "Kindness", icon: "🌈" },
  activity_invited: { label: "คำเชิญกิจกรรม", icon: "🤝" },
  activity_accepted: { label: "คำเชิญกิจกรรม", icon: "🤝" },
  activity_declined: { label: "คำเชิญกิจกรรม", icon: "🤝" },
  activity_counter_proposed: { label: "คำเชิญกิจกรรม", icon: "🤝" },
  voting_opened: { label: "โพลกิจกรรม", icon: "📢" },
};

const DEFAULT_CATEGORY: NotificationCategory = { label: "ระบบ", icon: "🔔" };

export function getNotificationCategory(type: string): NotificationCategory {
  return CATEGORY_BY_TYPE[type] ?? DEFAULT_CATEGORY;
}
