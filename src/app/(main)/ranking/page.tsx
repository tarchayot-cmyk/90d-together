"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Search, Trophy } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";

type TabType = "all" | "me" | "we" | "us";

interface RankRow {
  id: string;
  name: string;
  employee_code?: string;
  department?: string | null;
  avatar_url?: string | null;
  member_count?: number;
  total_points: number;
}

const TABS: { value: TabType; label: string }[] = [
  { value: "all", label: "🏆 ทั้งหมด" },
  { value: "me", label: "🌱 ME" },
  { value: "we", label: "🌿 WE" },
  { value: "us", label: "🌳 US" },
];

// "ทั้งหมด" reuses the individual (me) ranking — it's already every
// participant's total points regardless of category.
const RPC_TYPE: Record<TabType, "me" | "we" | "us"> = { all: "me", me: "me", we: "we", us: "us" };

const PODIUM_STYLE = [
  { medal: "🥇", ring: "ring-yellow-400", bg: "bg-yellow-50", order: "order-2", size: 76 },
  { medal: "🥈", ring: "ring-gray-300", bg: "bg-gray-50", order: "order-1", size: 64 },
  { medal: "🥉", ring: "ring-orange-300", bg: "bg-orange-50", order: "order-3", size: 64 },
];

async function fetchLeaderboard(_key: string, tab: TabType): Promise<RankRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_leaderboard", { p_type: RPC_TYPE[tab] });
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
    if (tab !== "all" && !visibleLevels.includes(tab)) setTab("all");
  }, [visibleLevels, tab]);

  const visibleTabs = TABS.filter((t) => t.value === "all" || visibleLevels.includes(t.value));

  const { data: rows, isLoading: loading } = useSWR(["leaderboard", tab], ([, t]) => fetchLeaderboard("leaderboard", t), {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  const isIndividual = tab === "all" || tab === "me";

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
            จัดอันดับจากคะแนนรวมของทุกกิจกรรม มาร่วมสร้างสุขภาพดีไปด้วยกัน
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

      {loading && !rows && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีข้อมูลอันดับ</p>}

      {top3.length > 0 && (
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
                  <p className="text-xs font-bold text-us">🌿 {row.total_points.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isIndividual && (
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
        {rest.map((row, i) => {
          const rank = query.trim() ? i + 1 : i + 4;
          return (
            <li key={row.id} className="rounded-card bg-white shadow-soft p-3 flex items-center gap-3">
              <span className="w-6 text-center font-bold text-gray-400 text-sm">{rank}</span>
              {isIndividual && <AvatarCircle avatarUrl={row.avatar_url} name={row.name} size={36} />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{row.name}</p>
                {row.employee_code && <p className="text-xs text-gray-400">{row.employee_code}{row.department ? ` · ${row.department}` : ""}</p>}
                {row.member_count !== undefined && <p className="text-xs text-gray-400">{row.member_count} คน</p>}
              </div>
              <span className="font-bold text-us shrink-0">🌿 {row.total_points.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
