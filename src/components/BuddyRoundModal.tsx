"use client";

import { useCallback, useEffect, useState } from "react";
import { Shuffle, Lock, X } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface PreviewMember {
  id: string;
  full_name: string;
  score: number;
  gender?: "male" | "female" | null;
}
interface PreviewGroup {
  name: string;
  members: PreviewMember[];
}
interface Preview {
  round_no: number;
  repeat_pairs: number;
  trios?: number;
  mixed_gender_groups?: number;
  unknown_gender?: number;
  groups: PreviewGroup[];
}
interface Status {
  has_round: boolean;
  locked: boolean;
  round_no?: number;
  locked_until?: string;
  next_round_no: number;
  groups?: { name: string; members: { id: string; full_name: string }[] }[];
}

function fmt(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function BuddyRoundModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roll = useCallback(async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("admin_preview_buddy_round");
    setBusy(false);
    if (err) {
      setError(err.message.includes("round_locked") ? "รอบนี้ถูกล็อกอยู่ ยังสุ่มใหม่ไม่ได้" : "สุ่มไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setPreview(data as Preview);
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data } = await supabase.rpc("admin_buddy_round_status");
      const s = data as Status;
      setStatus(s);
      if (!s?.locked) roll();
    }
    init();
  }, [roll]);

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("admin_confirm_buddy_round", { p_groups: preview.groups });
    setBusy(false);
    if (err) {
      setError(err.message.includes("round_locked") ? "รอบนี้ถูกล็อกอยู่แล้ว" : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    onDone(`ยืนยัน Buddy รอบที่ ${data.round_no} แล้ว — ล็อกถึง ${fmt(data.locked_until)}`);
    onClose();
  }

  const locked = status?.locked;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg w-full sm:max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">
            🤝 Buddy รอบที่ {locked ? status?.round_no : preview?.round_no ?? status?.next_round_no ?? ""}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {!status && <p className="text-sm text-gray-400 text-center py-8">กำลังโหลด...</p>}

          {locked && (
            <div className="rounded-card bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
              <Lock size={16} className="shrink-0 mt-0.5" />
              <span>ใช้รอบนี้อยู่ ล็อกจนถึง {fmt(status?.locked_until)} จึงจะสุ่มรอบใหม่ได้</span>
            </div>
          )}

          {!locked && preview && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>
                จับคู่คนที่ active ใกล้เคียงกัน (ระดับเดียวกันหรือติดกัน จากแต้ม 14 วันล่าสุด) เพศเดียวกันเป็นหลัก
                และหลีกเลี่ยงคู่ซ้ำเดิม — คนที่เหลือเป็นเศษจะเข้ากลุ่ม 3 คน
              </p>
              <p>
                {preview.repeat_pairs > 0 ? `คู่ซ้ำ ${preview.repeat_pairs} คู่` : "ไม่มีคู่ซ้ำ"}
                {" · "}กลุ่ม 3 คน {preview.trios ?? 0} กลุ่ม
                {(preview.mixed_gender_groups ?? 0) > 0 ? ` · กลุ่มชาย-หญิงผสม ${preview.mixed_gender_groups} กลุ่ม` : ""}
              </p>
              {(preview.unknown_gender ?? 0) > 0 && (
                <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 p-2">
                  ยังไม่ระบุเพศ {preview.unknown_gender} คน — ระบบจะจับคู่คนเหล่านี้ได้ทุกเพศ แนะนำให้ให้สมาชิกกรอกที่หน้าโปรไฟล์ หรือแอดมินกรอกให้ก่อนยืนยัน
                </p>
              )}
              <p>กดสุ่มใหม่ได้ไม่จำกัด กด "ตกลง" แล้วจะล็อก 7 วัน</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          {(locked ? status?.groups : preview?.groups)?.map((g) => (
            <div key={g.name} className="rounded-card bg-white shadow-soft p-3">
              <p className="text-xs font-semibold text-we mb-1">{g.name}</p>
              <ul className="text-sm text-gray-700 space-y-0.5">
                {g.members.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {"gender" in m && (m as PreviewMember).gender ? ((m as PreviewMember).gender === "male" ? "♂ " : "♀ ") : ""}
                      {m.full_name}
                    </span>
                    {"score" in m && <span className="text-xs text-gray-400 shrink-0">{(m as PreviewMember).score} แต้ม</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!locked && (
          <div className="grid grid-cols-2 gap-2 p-4 border-t border-gray-100">
            <button
              onClick={roll}
              disabled={busy}
              className="rounded-full bg-white shadow-soft py-3 text-sm font-semibold text-we flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px]"
            >
              <Shuffle size={16} /> สุ่มใหม่
            </button>
            <button
              onClick={confirm}
              disabled={busy || !preview}
              className="rounded-full bg-us text-white py-3 text-sm font-semibold disabled:opacity-50 min-h-[44px]"
            >
              ตกลง (ล็อก 7 วัน)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
