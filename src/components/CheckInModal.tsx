"use client";

import { useState } from "react";
import { X, Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import type { Mission } from "@/lib/types";

interface Props {
  mission: Mission;
  onClose: () => void;
  onSuccess: (result: {
    points: number;
    sticker: { color: string; amount: number } | null;
    message: string;
    pending_review?: boolean;
  }) => void;
}

// Human-readable messages for the exceptions raised by complete_mission()
// (see supabase/migrations/0005_sprint5_admin_audit.sql for the current version).
function friendlyError(raw: string): string {
  if (raw.includes("already_checked_in_this_week")) return "คุณทำภารกิจนี้ไปแล้วในสัปดาห์นี้ ✓";
  if (raw.includes("target_not_reached")) return "ยังไม่ถึงเป้าหมาย ลองกรอกค่าที่มากขึ้นอีกนิด";
  if (raw.includes("campaign_not_active")) return "แคมเปญนี้ยังไม่เริ่ม หรือสิ้นสุดแล้ว";
  if (raw.includes("mission_not_found")) return "ไม่พบภารกิจนี้";
  if (raw.includes("not_authenticated")) return "กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function CheckInModal({ mission, onClose, onSuccess }: Props) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericValue = Number(value);
    if (!value || Number.isNaN(numericValue) || numericValue < 0) {
      setError("กรุณากรอกตัวเลขที่ถูกต้อง");
      return;
    }
    if (mission.requires_proof && !proofFile) {
      setError("ภารกิจนี้ต้องแนบรูปหลักฐานก่อน Check-in");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    let proofUrl: string | null = null;
    if (proofFile) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        setLoading(false);
        setError("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
        return;
      }

      const ext = proofFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${mission.id}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("proofs").upload(path, proofFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        setLoading(false);
        setError("แนบรูปไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      proofUrl = supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl;
    }

    const { data, error: rpcError } = await supabase.rpc("complete_mission", {
      p_mission_id: mission.id,
      p_value: numericValue,
      p_note: note || null,
      p_proof_url: proofUrl,
    });
    setLoading(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }

    onSuccess(data);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 animate-bounce-once max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{mission.name}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-500">
          เป้าหมาย {mission.target_value.toLocaleString()} {mission.unit} / สัปดาห์
        </p>

        {mission.requires_proof && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            ภารกิจนี้ต้องแนบรูปหลักฐาน — คะแนน/สติ๊กเกอร์จะได้หลัง Admin ตรวจสอบและอนุมัติ
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">
              ค่าที่ทำได้ ({mission.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`เช่น ${mission.target_value}`}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">โน้ต (ไม่บังคับ)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เดินตอนเช้า"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          {mission.requires_proof && (
            <div>
              <label className="text-xs font-medium text-gray-500">แนบรูปหลักฐาน</label>
              <label className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 cursor-pointer min-h-[44px]">
                <Camera size={18} />
                {proofFile ? proofFile.name : "แตะเพื่อถ่ายรูป/เลือกรูป"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : "CHECK-IN"}
          </button>
        </form>
      </div>
    </div>
  );
}
