"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import clsx from "clsx";
import ScoreDetailModal from "@/components/ScoreDetailModal";
import BuddyGroupRanking from "@/components/BuddyGroupRanking";

type TabType = "all" | "me" | "we" | "us" | "buddy";

const TABS: { value: TabType; label: string }[] = [
  { value: "all", label: "🏆 รวมทั้งหมด" },
  { value: "me", label: "🌱 ME" },
  { value: "we", label: "🌿 WE" },
  { value: "us", label: "🌳 US" },
  { value: "buddy", label: "🤝 กลุ่ม Buddy" },
];

interface PhasePoints {
  me: number;
  we: number;
  us: number;
  total: number;
}

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

interface MemberSummary {
  id: string;
  full_name: string;
  employee_code: string;
  department: string | null;
  points: number;
  stickers: Record<string, number>;
  stickerTotal: number;
  badges: number;
  phase: PhasePoints;
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [detailMember, setDetailMember] = useState<MemberSummary | null>(null);
  const [tab, setTab] = useState<TabType>("all");
  const [visibleLevels, setVisibleLevels] = useState<string[]>(["me", "we", "us"]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // รวมคะแนน/สติ๊กเกอร์/เหรียญที่ฝั่งฐานข้อมูล (ดึงทีละแถวจะโดนจำกัด 1,000 แถว ทำให้ยอดขาด)
      const [{ data: members }, { data: totals }, { data: lb }, { data: phaseInfo }] = await Promise.all([
        supabase
          .from("members")
          .select("id, full_name, employee_code, department")
          .eq("role", "participant")
          .order("full_name"),
        supabase.rpc("admin_member_totals"),
        supabase.rpc("get_leaderboard_phases"),
        supabase.rpc("get_campaign_phase_info"),
      ]);

      if (phaseInfo?.has_campaign && phaseInfo.visible_levels?.length) setVisibleLevels(phaseInfo.visible_levels);

      // คะแนนแยกช่วง ME/WE/US (นับตามวันที่ได้คะแนน เหมือนหน้า Ranking ของสมาชิก)
      const phaseById = new Map<string, PhasePoints>();
      for (const r of ((lb?.rankings ?? []) as { id: string; me_points: number; we_points: number; us_points: number; total_points: number }[])) {
        phaseById.set(r.id, { me: Number(r.me_points), we: Number(r.we_points), us: Number(r.us_points), total: Number(r.total_points) });
      }

      const pointsByMember = new Map<string, number>();
      const stickersByMember = new Map<string, Record<string, number>>();
      const badgesByMember = new Map<string, number>();
      for (const t of (totals ?? []) as { member_id: string; points: number; stickers: Record<string, number>; badge_count: number }[]) {
        pointsByMember.set(t.member_id, Number(t.points));
        stickersByMember.set(t.member_id, t.stickers ?? {});
        badgesByMember.set(t.member_id, Number(t.badge_count));
      }

      const summary: MemberSummary[] = (members ?? []).map((m) => {
        const stickerMap = stickersByMember.get(m.id) ?? {};
        return {
          id: m.id,
          full_name: m.full_name,
          employee_code: m.employee_code,
          department: m.department,
          points: pointsByMember.get(m.id) ?? 0,
          stickers: stickerMap,
          stickerTotal: Object.values(stickerMap).reduce((a, b) => a + b, 0),
          badges: badgesByMember.get(m.id) ?? 0,
          phase: phaseById.get(m.id) ?? { me: 0, we: 0, us: 0, total: pointsByMember.get(m.id) ?? 0 },
        };
      });

      setRows(summary);
      setLoading(false);
    }
    load();
  }, []);

  const visibleTabs = TABS.filter((t) => t.value === "all" || t.value === "buddy" || visibleLevels.includes(t.value));
  const pointsOf = (r: MemberSummary) => (tab === "all" || tab === "buddy" ? r.points : r.phase[tab]);
  const sorted = [...rows].sort((a, b) => pointsOf(b) - pointsOf(a) || a.full_name.localeCompare(b.full_name, "th"));
  // คะแนนเท่ากันได้อันดับเดียวกัน (1, 2, 2, 4 ...)
  const rankOf = (r: MemberSummary) => 1 + sorted.filter((x) => pointsOf(x) > pointsOf(r)).length;

  const filtered = sorted.filter((r) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return r.full_name.toLowerCase().includes(q) || r.employee_code.toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q);
  });

  const totals = rows.reduce(
    (acc, r) => ({ points: acc.points + pointsOf(r), stickers: acc.stickers + r.stickerTotal }),
    { points: 0, stickers: 0 }
  );

  const tabBar = (
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
  );

  if (tab === "buddy") {
    return (
      <div className="space-y-4">
        {tabBar}
        <BuddyGroupRanking all />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabBar}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card bg-white shadow-soft p-3 text-center">
          <p className="text-xl font-bold text-us">{totals.points.toLocaleString()}</p>
          <p className="text-xs text-gray-400">⭐ Growth Points {tab === "all" || tab === "buddy" ? "รวม" : `ช่วง ${tab.toUpperCase()}`}</p>
        </div>
        <div className="rounded-card bg-white shadow-soft p-3 text-center">
          <p className="text-xl font-bold text-us">{totals.stickers.toLocaleString()}</p>
          <p className="text-xs text-gray-400">🎗️ สติ๊กเกอร์รวม</p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ, รหัสบุคลากร, แผนก..."
          className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && rows.length > 0 && <p className="text-xs text-gray-400 text-center">แตะที่ชื่อเพื่อดูรายละเอียดที่มาของคะแนน</p>}

      <div className="space-y-2">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setDetailMember(r)}
            className="w-full text-left rounded-card bg-white shadow-soft p-3 active:opacity-80 min-h-[44px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="w-6 text-center font-bold text-gray-400 text-sm shrink-0">{rankOf(r)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate">{r.full_name}</p>
                <p className="text-xs text-gray-400">
                  {r.employee_code} · {r.department ?? "-"}
                </p>
                {tab === "all" && (
                  <p className="text-[11px] text-gray-400">
                    {visibleLevels.map((l) => `${l.toUpperCase()} ${r.phase[l as "me" | "we" | "us"].toLocaleString()}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 pl-2">
                <p className="font-bold text-us">{pointsOf(r).toLocaleString()} pts</p>
                <p className="text-xs text-gray-400">🏅 {r.badges} badge{r.badges !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {r.stickerTotal > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-50">
                {Object.entries(r.stickers).map(([color, count]) => (
                  <span key={color} className="text-xs text-gray-500">
                    {STICKER_EMOJI[color] ?? "⭐"} ×{count}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
        {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ไม่พบข้อมูล</p>}
      </div>

      {detailMember && (
        <ScoreDetailModal
          memberId={detailMember.id}
          memberName={detailMember.full_name}
          onClose={() => setDetailMember(null)}
        />
      )}
    </div>
  );
}
