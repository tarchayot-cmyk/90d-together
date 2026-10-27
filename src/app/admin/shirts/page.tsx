"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Row {
  member_id: string;
  full_name: string;
  employee_code: string;
  department: string | null;
  points: number;
  size: string | null;
  chosen_at: string | null;
}

const ORDER = ["SS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];

export default function AdminShirtsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("admin_shirt_orders")
      .then(({ data, error: err }) => {
        if (err) setError("โหลดข้อมูลไม่สำเร็จ");
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, []);

  const counts = ORDER.map((s) => ({ size: s, n: rows.filter((r) => r.size === s).length })).filter((c) => c.n > 0);
  const chosen = rows.filter((r) => r.size).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">👕 ไซซ์เสื้อ (คะแนนครบ 3,000)</h1>
        <p className="text-xs text-gray-400">
          ถึงเกณฑ์ {rows.length} คน · เลือกไซซ์แล้ว {chosen} คน · ยังไม่เลือก {rows.length - chosen} คน
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      {counts.length > 0 && (
        <div className="rounded-card bg-white shadow-soft p-3">
          <p className="text-xs text-gray-400 mb-2">สรุปจำนวนตามไซซ์</p>
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <span key={c.size} className="rounded-full bg-pastel-green text-us text-sm font-semibold px-3 py-1">
                {c.size} × {c.n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.member_id} className="rounded-card bg-white shadow-soft p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate">{r.full_name}</p>
              <p className="text-xs text-gray-400">
                {r.employee_code} · {r.department ?? "-"} · {Number(r.points).toLocaleString()} pts
              </p>
            </div>
            <span className={r.size ? "font-bold text-us shrink-0" : "text-xs text-gray-400 shrink-0"}>{r.size ?? "ยังไม่เลือก"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
