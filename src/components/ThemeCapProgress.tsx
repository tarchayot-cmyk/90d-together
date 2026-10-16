"use client";

import useSWR from "swr";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { THEMES } from "@/lib/badgeFields";

interface CapData {
  month?: number;
  month_start?: string;
  month_end?: string;
  themes: { theme: string; points: number; cap: number }[];
}

async function fetchCaps(): Promise<CapData> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_theme_cap_progress");
  return (data as CapData) ?? { themes: [] };
}

function fmt(d?: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function ThemeCapProgress({ refreshKey }: { refreshKey?: unknown }) {
  const { data } = useSWR(["theme-cap-progress", refreshKey], fetchCaps, {
    revalidateOnFocus: false,
    dedupingInterval: 5_000,
  });

  if (!data || data.themes.length === 0) return null;

  return (
    <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
      <div>
        <p className="text-sm font-semibold text-gray-700">📊 คะแนนแต่ละธีมของรอบนี้</p>
        <p className="text-[11px] text-gray-400">
          {fmt(data.month_start)} – {fmt(data.month_end)} · แต่ละธีมได้คะแนนสูงสุดตามเพดาน เต็มแล้วทำต่อได้แต่ไม่ได้คะแนนเพิ่ม
        </p>
      </div>
      <ul className="space-y-1.5">
        {THEMES.map((t) => {
          const row = data.themes.find((x) => x.theme === t.value);
          if (!row) return null;
          const pct = Math.min(100, Math.round((row.points / row.cap) * 100));
          const full = row.points >= row.cap;
          const near = !full && pct >= 80;
          return (
            <li key={t.value} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{t.label}</span>
                <span className={clsx("font-semibold", full ? "text-us" : near ? "text-amber-600" : "text-gray-500")}>
                  {Math.min(row.points, row.cap).toLocaleString()} / {row.cap.toLocaleString()}
                  {full ? " ✅ เต็มแล้ว" : near ? ` · เหลืออีก ${(row.cap - row.points).toLocaleString()}` : ""}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={clsx("h-full rounded-full", full ? "bg-us" : near ? "bg-amber-400" : "bg-we")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
