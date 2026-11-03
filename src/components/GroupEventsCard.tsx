"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabaseClient";
import { THEME_LABEL, fmtEventTime, eventPointsEach, type GroupEvent } from "@/lib/groupEvents";

async function fetchEvents(): Promise<GroupEvent[]> {
  const { data } = await createClient().rpc("get_group_events");
  return (data as GroupEvent[]) ?? [];
}

export default function GroupEventsCard() {
  const { data, mutate } = useSWR("group-events", fetchEvents, { revalidateOnFocus: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  const now = Date.now();
  const upcoming = data.filter((e) => e.status === "open" && new Date(e.ends_at ?? new Date(e.starts_at).getTime() + 3 * 3600_000).getTime() >= now);
  const mine = data.filter((e) => e.i_attended && e.status === "completed" && e.my_points > 0);
  const groups: GroupEvent[][] = [];
  const seen = new Map<string, GroupEvent[]>();
  for (const e of upcoming) {
    const k = e.series_id ?? e.id;
    let g = seen.get(k);
    if (!g) {
      g = [];
      seen.set(k, g);
      groups.push(g);
    }
    g.push(e);
  }
  if (upcoming.length === 0 && mine.length === 0) return null;

  async function toggle(e: GroupEvent) {
    if (busyId) return;
    setBusyId(e.id);
    setError(null);
    const { error: err } = await createClient().rpc("rsvp_group_event", { p_event: e.id, p_going: !e.i_rsvped });
    setBusyId(null);
    if (err) {
      setError(err.message.includes("event_full") ? "กิจกรรมนี้เต็มแล้ว" : "ลงชื่อไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    mutate();
  }

  return (
    <section className="rounded-card bg-white shadow-soft p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-gray-800 text-sm">🎉 กิจกรรมร่วม</h2>
        <p className="text-xs text-gray-500">
          ทุกคนที่เข้าร่วมได้คะแนนเท่ากัน = 50 × จำนวนผู้เข้าร่วม (สูงสุด 500 คะแนน) ยิ่งมามาก ยิ่งได้มาก · ไม่ได้ลงชื่อไว้ก็มาได้
        </p>
      </div>

      {groups.map((g) => {
        const first = g[0];
        const t = THEME_LABEL[first.theme];
        const total = Math.max(first.series_rsvp_count, 1);
        const multi = g.length > 1;
        return (
          <div key={first.series_id ?? first.id} className="rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              {t?.icon} {first.title}
            </p>
            {first.description && <p className="text-xs text-gray-500">{first.description}</p>}
            {multi && <p className="text-xs text-us">มี {g.length} รอบ — เลือกลงชื่อได้ 1 รอบ (ไม่ได้ลงชื่อก็มาได้)</p>}
            <p className="text-xs text-gray-600">
              ลงชื่อแล้วรวม {first.series_rsvp_count} คน · ถ้ามา {total} คน ได้คนละ <b>{eventPointsEach(total, first.points_per_person, first.points_cap)}</b> คะแนน
            </p>
            {g.map((e) => (
              <div key={e.id} className="rounded-lg bg-gray-50 p-2 space-y-1.5">
                <p className="text-xs text-gray-600">
                  {multi ? `รอบที่ ${e.session_no} · ` : ""}🗓 {fmtEventTime(e.starts_at)}
                  {e.location ? ` · 📍 ${e.location}` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  ลงชื่อ {e.rsvp_count}
                  {e.capacity ? `/${e.capacity}` : ""} คน
                </p>
                <button
                  onClick={() => toggle(e)}
                  disabled={busyId === e.id || (!e.i_rsvped && !!e.capacity && e.rsvp_count >= e.capacity)}
                  className={
                    e.i_rsvped
                      ? "rounded-full border border-us/40 text-us text-sm font-semibold px-4 min-h-[40px] disabled:opacity-50"
                      : "rounded-full bg-us text-white text-sm font-semibold px-4 min-h-[40px] disabled:opacity-50"
                  }
                >
                  {e.i_rsvped ? "✓ ลงชื่อแล้ว (กดเพื่อยกเลิก)" : multi && g.some((x) => x.i_rsvped) ? "ย้ายมารอบนี้" : "ลงชื่อเข้าร่วม"}
                </button>
              </div>
            ))}
          </div>
        );
      })}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {mine.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400">กิจกรรมที่คุณเข้าร่วมแล้ว</p>
          {mine.map((e) => (
            <p key={e.id} className="text-xs text-gray-600">
              {THEME_LABEL[e.theme]?.icon} {e.title} · <span className="font-semibold text-us">+{e.my_points} คะแนน</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
