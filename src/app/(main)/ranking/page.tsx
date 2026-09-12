"use client";

import { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";

type TabType = "me" | "we" | "us";

interface RankRow {
  id: string;
  name: string;
  department?: string | null;
  avatar_url?: string | null;
  member_count?: number;
  total_points: number;
}

const TABS: { value: TabType; label: string }[] = [
  { value: "me", label: "🌱 ME" },
  { value: "we", label: "🌿 WE" },
  { value: "us", label: "🌳 US" },
];

const MEDAL = ["🥇", "🥈", "🥉"];

async function fetchLeaderboard(_key: string, tab: TabType): Promise<RankRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_leaderboard", { p_type: tab });
  return data?.rankings ?? [];
}

export default function RankingPage() {
  const [tab, setTab] = useState<TabType>("me");

  // Keyed by tab, so switching ME/WE/US and back shows each tab's
  // last-known ranking instantly instead of a fresh spinner every time.
  const { data: rows, isLoading: loading } = useSWR(["leaderboard", tab], ([, t]) => fetchLeaderboard("leaderboard", t), {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  return (
    <div className="space-y-4 pt-2">
      <header>
        <p className="text-sm text-gray-400">🏆 Ranking</p>
        <h1 className="text-xl font-bold text-gray-800">กระดานอันดับ</h1>
        <p className="text-xs text-gray-400 mt-1">
          จัดอันดับจาก Participation + Mission + Teamwork เท่านั้น — ไม่ใช้ข้อมูลน้ำหนักหรือสุขภาพส่วนตัว
        </p>
      </header>

      <div className="flex rounded-full bg-white shadow-sm p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={clsx(
              "flex-1 rounded-full py-2 text-sm font-semibold min-h-[40px]",
              tab === t.value ? "bg-us text-white" : "text-gray-400"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !rows && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && rows?.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีข้อมูลอันดับ</p>
      )}

      <ol className="space-y-2">
        {(rows ?? []).map((row, i) => (
          <li key={row.id} className="rounded-card bg-white shadow-sm p-3 flex items-center gap-3">
            <span className="w-8 text-center font-bold text-gray-500">{MEDAL[i] ?? i + 1}</span>
            {row.avatar_url !== undefined && <AvatarCircle avatarUrl={row.avatar_url} name={row.name} size={32} />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{row.name}</p>
              {row.department && <p className="text-xs text-gray-400">{row.department}</p>}
              {row.member_count !== undefined && (
                <p className="text-xs text-gray-400">{row.member_count} คน</p>
              )}
            </div>
            <span className="font-bold text-us">{row.total_points.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
