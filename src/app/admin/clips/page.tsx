"use client";

import { useEffect, useState } from "react";
import { Search, Download } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface ClipRow {
  id: string;
  member_id: string;
  proof_status: string;
  proof_urls: string[] | null;
  created_at: string;
  member: { full_name: string } | { full_name: string }[] | null;
  mission: { name: string } | { name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const dateFmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const STATUS: Record<string, string> = { pending: "รอตรวจ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธแล้ว" };

export default function AdminClipsPage() {
  const [rows, setRows] = useState<ClipRow[]>([]);
  const [groupOf, setGroupOf] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: missions } = await supabase.from("missions").select("id").eq("category", "buddy_clip");
      const ids = (missions ?? []).map((m: { id: string }) => m.id);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from("check_ins")
        .select(
          "id, member_id, proof_status, proof_urls, created_at, " +
            "member:members!check_ins_member_id_fkey(full_name), " +
            "mission:missions!check_ins_mission_id_fkey(name)"
        )
        .in("mission_id", ids)
        .not("proof_urls", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (err) setError("โหลดคลิปไม่สำเร็จ");
      const list = (data as unknown as ClipRow[]) ?? [];
      setRows(list);

      // ชื่อกลุ่ม Buddy ของผู้อัปโหลด (ถ้าอ่านไม่ได้ก็ข้าม)
      const memberIds = Array.from(new Set(list.map((r) => r.member_id)));
      if (memberIds.length > 0) {
        const { data: bm } = await supabase
          .from("buddy_members")
          .select("member_id, buddy_group:buddy_groups(name, round_id)")
          .in("member_id", memberIds);
        const map = new Map<string, string>();
        for (const b of (bm ?? []) as unknown as { member_id: string; buddy_group: { name: string } | { name: string }[] | null }[]) {
          const g = one(b.buddy_group);
          if (g) map.set(b.member_id, [map.get(b.member_id), g.name].filter(Boolean).join(" / "));
        }
        setGroupOf(map);
      }
      setLoading(false);
    }
    load();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!q) return true;
    return (one(r.member)?.full_name ?? "").toLowerCase().includes(q) || (groupOf.get(r.member_id) ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🎬 คลิป Buddy ทั้งหมด</h1>
        <p className="text-xs text-gray-400">ดูย้อนหลังได้ทุกวัน ล่าสุดอยู่บนสุด · ทั้งหมด {rows.length} คลิป</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อผู้อัปโหลด หรือชื่อกลุ่ม (เช่น Buddy 5)"
          className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ไม่พบคลิป</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((r) => (
          <div key={r.id} className="rounded-card bg-white shadow-soft p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{one(r.member)?.full_name ?? "-"}</p>
                <p className="text-xs text-gray-400">
                  {groupOf.get(r.member_id) ? `${groupOf.get(r.member_id)} · ` : ""}
                  {dateFmt.format(new Date(r.created_at))}
                </p>
              </div>
              <span className="text-[11px] text-gray-500 bg-gray-50 rounded-full px-2 py-0.5 shrink-0">{STATUS[r.proof_status] ?? r.proof_status}</span>
            </div>
            {r.proof_urls?.map((url) => (
              <div key={url} className="space-y-1">
                <video src={url} controls preload="metadata" className="w-full rounded-lg bg-black max-h-80" />
                <a href={url} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 text-xs text-us font-medium">
                  <Download size={12} /> เปิด/ดาวน์โหลดคลิป
                </a>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
