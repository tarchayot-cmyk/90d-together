"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export default function AdjustPointsModal({
  memberId,
  memberName,
  onClose,
  onSuccess,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(points);
    if (!points || Number.isNaN(delta) || delta === 0) {
      setError("กรอกจำนวนคะแนน (ติดลบได้ถ้าต้องการหัก)");
      return;
    }
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผล — จะถูกบันทึกลง Audit Log");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_adjust_points", {
      p_member_id: memberId,
      p_points: delta,
      p_reason: reason,
    });
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message.includes("not_authorized") ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">ปรับคะแนน — {memberName}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">จำนวนคะแนน (+/-)</label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="เช่น 10 หรือ -5"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">เหตุผล (บันทึกลง Audit Log)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น แก้ไข check-in ที่บันทึกผิด"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : "ยืนยันปรับคะแนน"}
          </button>
        </form>
      </div>
    </div>
  );
}
