"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, Trophy } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";
import BuddyGroupRanking from "@/components/BuddyGroupRanking";

type TabType = "all" | "me" | "we" | "us" | "buddy";

interface RankRow {
  id: string;
  name: string;
  employee_code?: string;
  department?: string | null;
  avatar_url?: string | null;
  me_points: number;
  we_points: number;
  us_points: number;
  total_points: number;
}

const TABS: { value: TabType; label: string }[] = [
  { value: "all", label: "🏆 รวมทั้งหมด" },
  { value: "me", label: "🌱 ME" },
  { value: "we", label: "🌿 WE" },
  { value: "us", label: "🌳 US" },
  { value: "buddy", label: "🤝 กลุ่ม Buddy" },
];

// Individual ranking for every tab; each tab ranks by the points earned in that phase
// (ME = campaign days 1-30, WE = 31-60, US = 61-90) and "all" ranks by the grand total.
const POINTS_KEY: Record<Exclude<TabType, "buddy">, "total_points" | "me_points" | "we_points" | "us_points"> = {
  all: "total_points",
  me: "me_points",
  we: "we_points",
  us: "us_points",
};

const PODIUM_STYLE = [
  { medal: "🥇", ring: "ring-yellow-400", bg: "bg-yellow-50", order: "order-2", size: 76 },
  { medal: "🥈", ring: "ring-gray-300", bg: "bg-gray-50", order: "order-1", size: 64 },
  { medal: "🥉", ring: "ring-orange-300", bg: "bg-orange-50", order: "order-3", size: 64 },
];

async function fetchLeaderboard(): Promise<RankRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_leaderboard_phases");
  return data?.rankings ?? [];
}

export default function RankingPage() {
  const [tab, setTab] = useState<TabType>("all");
  const [visibleLevels, setVisibleLevels] = useState<string[]>(["me"]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function loadVisibility() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_campaign_phase_info");
      if (data?.has_campaign && data.visible_levels?.length) {
        setVisibleLevels(data.visible_levels);
      }
    }
    loadVisibility();
  }, []);

  useEffect(() => {
    if (tab !== "all" && !visibleLevels.includes(tab === "buddy" ? "we" : tab)) setTab("all");
  }, [visibleLevels, tab]);

  const visibleTabs = TABS.filter((t) => t.value === "all" || visibleLevels.includes(t.value === "buddy" ? "we" : t.value));

  const { data: allRows, isLoading: loading } = useSWR("leaderboard-phases", fetchLeaderboard, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  const pointsOf = (r: RankRow) => r[POINTS_KEY[tab === "buddy" ? "all" : tab]] ?? 0;
  const rows = allRows
    ? [...allRows].sort((a, b) => pointsOf(b) - pointsOf(a) || a.name.localeCompare(b.name, "th"))
    : undefined;
  // Tied scores share the same rank (1, 2, 2, 4 ...).
  const rankOf = (r: RankRow) => 1 + (rows ?? []).filter((x) => pointsOf(x) > pointsOf(r)).length;
  const phaseLabels: { key: "me_points" | "we_points" | "us_points"; label: string; level: string }[] = [
    { key: "me_points", label: "ME", level: "me" },
    { key: "we_points", label: "WE", level: "we" },
    { key: "us_points", label: "US", level: "us" },
  ];
  const shownPhases = phaseLabels.filter((p) => visibleLevels.includes(p.level));

  const isIndividual = true;

  const filtered = (rows ?? []).filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.employee_code ?? "").toLowerCase().includes(q) ||
      (r.department ?? "").toLowerCase().includes(q)
    );
  });

  const top3 = !query.trim() ? filtered.slice(0, 3) : [];
  const rest = query.trim() ? filtered : filtered.slice(3);

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-us font-bold text-lg">
            <Trophy size={20} /> กระดานอันดับ
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            จัดอันดับรายบุคคลแยกตามช่วง ME / WE / US และคะแนนรวม มาร่วมสร้างสุขภาพดีไปด้วยกัน
          </p>
        </div>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {visibleTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={clsx(
              "rounded-full px-4 py-2.5 text-sm font-semibold min-h-[44px] shrink-0",
              tab === t.value ? "bg-us text-white" : "bg-white text-gray-500 shadow-soft"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "buddy" && <BuddyGroupRanking />}

      {tab !== "buddy" && loading && !rows && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {tab !== "buddy" && !loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีข้อมูลอันดับ</p>}

      {tab !== "buddy" && top3.length > 0 && (
        <div className="rounded-card bg-white shadow-soft p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">🏆 Top 3</p>
          <div className="flex items-end justify-center gap-3">
            {top3.map((row, i) => {
              const style = PODIUM_STYLE[i];
              return (
                <div key={row.id} className={clsx("flex flex-col items-center gap-1 flex-1", style.order)}>
                  <span className="text-lg">{style.medal}</span>
                  {isIndividual ? (
                    <div className={clsx("rounded-full ring-4 p-0.5", style.ring, style.bg)}>
                      <AvatarCircle avatarUrl={row.avatar_url} name={row.name} size={style.size} />
                    </div>
                  ) : (
                    <div className={clsx("rounded-full ring-4 flex items-center justify-center text-2xl", style.ring, style.bg)} style={{ width: style.size, height: style.size }}>
                      🌳
                    </div>
                  )}
                  <p className="text-xs font-semibold text-gray-800 text-center truncate w-full">{row.name}</p>
                  {row.department && <p className="text-[10px] text-gray-400 truncate w-full text-center">{row.department}</p>}
                  <p className="text-xs font-bold text-us">🌿 {pointsOf(row).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab !== "buddy" && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัสบุคลากร, หน่วยงาน..."
            className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
          />
        </div>
      )}

      <ol className="space-y-2">
        {(tab === "buddy" ? [] : rest).map((row, i) => {
          const rank = rankOf(row);
          return (
            <li key={row.id} className="rounded-card bg-white shadow-soft p-3 flex items-center gap-3">
              <span className="w-6 text-center font-bold text-gray-400 text-sm">{rank}</span>
              {isIndividual && <AvatarCircle avatarUrl={row.avatar_url} name={row.name} size={36} />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{row.name}</p>
                {row.employee_code && <p className="text-xs text-gray-400">{row.employee_code}{row.department ? ` · ${row.department}` : ""}</p>}
                {tab === "all" && shownPhases.length > 1 && (
                  <p className="text-[11px] text-gray-400">
                    {shownPhases.map((p) => `${p.label} ${(row[p.key] ?? 0).toLocaleString()}`).join(" · ")}
                  </p>
                )}
              </div>
              <span className="font-bold text-us shrink-0">🌿 {pointsOf(row).toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
