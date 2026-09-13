"use client";

import { useState } from "react";
import { X, Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

function friendlyError(raw: string): string {
  if (raw.includes("pin_too_short")) return "PIN ต้องมีอย่างน้อย 4 หลัก";
  if (raw.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (raw.includes("member_not_found_or_no_login")) return "ไม่พบบัญชี login ของสมาชิกคนนี้";
  return "รีเซ็ต PIN ไม่สำเร็จ กรุณาลองใหม่";
}

export default function ResetPinModal({
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
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPin.length < 4) {
      setError("PIN ต้องมีอย่างน้อย 4 หลัก");
      return;
    }

    const confirmed = window.confirm(`รีเซ็ต PIN ของ ${memberName} เป็น PIN ใหม่ที่ตั้งไว้?\n\nPIN เดิมจะใช้ไม่ได้อีกทันที`);
    if (!confirmed) return;

    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_reset_pin", {
      p_member_id: memberId,
      p_new_pin: newPin,
    });
    setLoading(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <KeyRound size={18} /> รีเซ็ต PIN — {memberName}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">PIN ใหม่ (4-6 หลัก)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="1234"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : "ยืนยันรีเซ็ต PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
