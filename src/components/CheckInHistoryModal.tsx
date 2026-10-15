"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface HistoryRow {
  id: string;
  created_at: string;
  mission_name: string;
  level: string;
  unit: string | null;
  value: number | null;
  note: string | null;
  proof_status: string | null;
  rejection_reason: string | null;
  buddy_name: string | null;
  campaign_week: number;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอตรวจ", cls: "bg-amber-50 text-amber-600" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-green-50 text-green-600" },
  rejected: { label: "ถูกปฏิเสธ", cls: "bg-red-50 text-red-500" },
  not_required: { label: "บันทึกแล้ว", cls: "bg-gray-50 text-gray-500" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckInHistoryModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "me" | "we" | "us">("all");

  useEffect(() => {
    createClient()
      .rpc("get_my_checkin_history")
      .then(({ data }) => setRows((data as HistoryRow[]) ?? []));
  }, []);

  const shown = (rows ?? []).filter((r) => filter === "all" || r.level === filter);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">ประวัติเช็คอินของฉัน</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1.5">
          {(["all", "me", "we", "us"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 min-h-[32px] ${
                filter === f ? "bg-us text-white" : "bg-bg text-gray-500"
              }`}
            >
              {f === "all" ? "ทั้งหมด" : f.toUpperCase()}
            </button>
          ))}
        </div>

        {rows === null && <p className="text-sm text-gray-400 text-center py-8">กำลังโหลด...</p>}
        {rows !== null && shown.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีรายการ</p>}

        <ul className="space-y-2">
          {shown.map((r) => {
            const st = STATUS[r.proof_status ?? "not_required"] ?? STATUS.not_required;
            return (
              <li key={r.id} className="rounded-xl border border-gray-100 p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-700 min-w-0">{r.mission_name}</p>
                  <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {fmt(r.created_at)} · {r.level.toUpperCase()}
                  {r.value != null && r.unit && r.value > 1 ? ` · ${Number(r.value).toLocaleString()} ${r.unit}` : ""}
                  {r.buddy_name ? ` · กับ ${r.buddy_name}` : ""}
                </p>
                {r.note && <p className="text-xs text-gray-500 break-words">“{r.note}”</p>}
                {r.proof_status === "rejected" && r.rejection_reason && (
                  <p className="text-xs text-red-500">เหตุผล: {r.rejection_reason}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
