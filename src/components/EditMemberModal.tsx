"use client";

import { useState } from "react";
import { X, Loader2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { UNITS } from "@/components/AddMemberModal";

function friendlyError(raw: string): string {
  if (raw.includes("full_name_required")) return "กรุณากรอกชื่อ-นามสกุล";
  if (raw.includes("invalid_unit")) return "หน่วยไม่ถูกต้อง";
  if (raw.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (raw.includes("member_not_found")) return "ไม่พบสมาชิกนี้";
  return "แก้ไขไม่สำเร็จ กรุณาลองใหม่";
}

interface EditableMember {
  id: string;
  full_name: string;
  nickname: string | null;
  unit: string | null;
}

export default function EditMemberModal({
  member,
  onClose,
  onSuccess,
}: {
  member: EditableMember;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState(member.full_name);
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [unit, setUnit] = useState(member.unit ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_update_member_details", {
      p_member_id: member.id,
      p_full_name: fullName.trim(),
      p_nickname: nickname.trim() || null,
      p_unit: unit || null,
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
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Pencil size={18} /> แก้ไขข้อมูลสมาชิก
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">ชื่อ-นามสกุล</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">ชื่อเล่น (ไม่บังคับ)</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">หน่วย (ไม่บังคับ)</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base">
              <option value="">-- ไม่ระบุ --</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </form>
      </div>
    </div>
  );
}
