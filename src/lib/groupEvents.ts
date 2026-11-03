export const THEME_LABEL: Record<string, { icon: string; label: string }> = {
  move: { icon: "🏃", label: "Move" },
  mind: { icon: "🧘", label: "Mind" },
  connect: { icon: "🤝", label: "Connect" },
  fuel: { icon: "🥗", label: "Fuel" },
  rest: { icon: "😴", label: "Rest" },
};

const dtFmt = new Intl.DateTimeFormat("th-TH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});
export const fmtEventTime = (iso: string) => dtFmt.format(new Date(iso));

// แต้มต่อคน = 50 × จำนวนผู้เข้าร่วม สูงสุด 500 (ค่าตั้งต้นของระบบ)
export const eventPointsEach = (n: number, per = 50, cap = 500) => Math.min(per * n, cap);

export interface GroupEvent {
  id: string;
  title: string;
  theme: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: "open" | "completed" | "cancelled";
  series_id: string | null;
  session_no: number;
  series_rsvp_count: number;
  points_per_person: number;
  points_cap: number;
  rsvp_count: number;
  attended_count: number;
  i_rsvped: boolean;
  i_attended: boolean;
  my_points: number;
}
