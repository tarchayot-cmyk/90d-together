"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import ScoreDetailModal from "@/components/ScoreDetailModal";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "🩷",
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
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [detailMember, setDetailMember] = useState<MemberSummary | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [{ data: members }, { data: points }, { data: stickers }, { data: badges }] = await Promise.all([
        supabase
          .from("members")
          .select("id, full_name, employee_code, department")
          .eq("role", "participant")
          .order("full_name"),
        supabase.from("points_transactions").select("member_id, points"),
        supabase.from("stickers").select("member_id, color, amount"),
        supabase.from("member_badges").select("member_id"),
      ]);

      const pointsByMember = new Map<string, number>();
      for (const p of points ?? []) {
        pointsByMember.set(p.member_id, (pointsByMember.get(p.member_id) ?? 0) + p.points);
      }

      const stickersByMember = new Map<string, Record<string, number>>();
      for (const s of stickers ?? []) {
        const existing = stickersByMember.get(s.member_id) ?? {};
        existing[s.color] = (existing[s.color] ?? 0) + s.amount;
        stickersByMember.set(s.member_id, existing);
      }

      const badgesByMember = new Map<string, number>();
      for (const b of badges ?? []) {
        badgesByMember.set(b.member_id, (badgesByMember.get(b.member_id) ?? 0) + 1);
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
        };
      });

      summary.sort((a, b) => b.points - a.points);
      setRows(summary);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = rows.filter((r) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return r.full_name.toLowerCase().includes(q) || r.employee_code.toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q);
  });

  const totals = rows.reduce(
    (acc, r) => ({ points: acc.points + r.points, stickers: acc.stickers + r.stickerTotal }),
    { points: 0, stickers: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card bg-white shadow-sm p-3 text-center">
          <p className="text-xl font-bold text-us">{totals.points.toLocaleString()}</p>
          <p className="text-xs text-gray-400">⭐ Growth Points รวม</p>
        </div>
        <div className="rounded-card bg-white shadow-sm p-3 text-center">
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
            className="w-full text-left rounded-card bg-white shadow-sm p-3 active:opacity-80"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{r.full_name}</p>
                <p className="text-xs text-gray-400">
                  {r.employee_code} · {r.department ?? "-"}
                </p>
              </div>
              <div className="text-right shrink-0 pl-2">
                <p className="font-bold text-us">{r.points.toLocaleString()} pts</p>
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
