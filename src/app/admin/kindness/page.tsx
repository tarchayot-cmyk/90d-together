"use client";

import { useEffect, useState } from "react";
import { Megaphone, MegaphoneOff, Search } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { KINDNESS_CATEGORIES } from "@/lib/kindness";

interface KindnessRow {
  id: string;
  created_at: string;
  category: string;
  message: string;
  campaign_week: number;
  is_featured: boolean;
  from_name: string;
  to_name: string;
}

function categoryMeta(value: string) {
  return KINDNESS_CATEGORIES.find((c) => c.value === value);
}

export default function AdminKindnessPage() {
  const [rows, setRows] = useState<KindnessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_list_kindness_messages");
    if (!error) setRows((data as KindnessRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleFeatured(row: KindnessRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_toggle_kindness_featured", {
      p_kindness_id: row.id,
      p_featured: !row.is_featured,
    });
    setBusyId(null);

    if (error) {
      setBanner("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_featured: !r.is_featured } : r)));
  }

  const filtered = rows
    .filter((r) => (featuredOnly ? r.is_featured : true))
    .filter((r) => {
      const q = query.toLowerCase();
      if (!q) return true;
      return (
        r.from_name.toLowerCase().includes(q) ||
        r.to_name.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q)
      );
    });

  const featuredCount = rows.filter((r) => r.is_featured).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        เลือกข้อความ Kindness ที่จะโชว์หมุนเวียนในหน้า Member — โชว์เฉพาะข้อความ ไม่โชว์ชื่อผู้ส่ง/ผู้รับ
      </p>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      <button
        onClick={() => setFeaturedOnly((v) => !v)}
        className={clsx(
          "w-full rounded-card p-3 text-sm font-semibold min-h-[44px] border",
          featuredOnly ? "bg-kindness text-white border-kindness" : "bg-kindness/5 text-kindness border-kindness/20"
        )}
      >
        📢 กำลังโชว์อยู่ {featuredCount} ข้อความ — {featuredOnly ? "แสดงทั้งหมด" : "กรองเฉพาะที่โชว์อยู่"}
      </button>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อผู้ส่ง, ผู้รับ, ข้อความ..."
          className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ไม่พบข้อความ</p>}

      <div className="space-y-2">
        {filtered.map((row) => {
          const meta = categoryMeta(row.category);
          const busy = busyId === row.id;
          return (
            <div key={row.id} className={clsx("rounded-card bg-white shadow-soft p-3 space-y-2", row.is_featured && "ring-2 ring-kindness")}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {meta?.emoji ?? "🌈"} {row.from_name} → {row.to_name}
                </p>
                {row.is_featured && <span className="shrink-0 text-xs font-semibold text-kindness">กำลังโชว์</span>}
              </div>
              <p className="text-sm text-gray-600">{row.message}</p>
              <p className="text-xs text-gray-400">
                {meta?.label ?? row.category} · สัปดาห์ {row.campaign_week} ·{" "}
                {new Date(row.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
              </p>

              <button
                onClick={() => toggleFeatured(row)}
                disabled={busy}
                className={clsx(
                  "w-full rounded-full py-2 text-sm font-semibold min-h-[40px] flex items-center justify-center gap-2 disabled:opacity-50",
                  row.is_featured ? "bg-gray-100 text-gray-500" : "bg-kindness text-white"
                )}
              >
                {row.is_featured ? <MegaphoneOff size={16} /> : <Megaphone size={16} />}
                {row.is_featured ? "เลิกโชว์ข้อความนี้" : "โชว์ข้อความนี้"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
