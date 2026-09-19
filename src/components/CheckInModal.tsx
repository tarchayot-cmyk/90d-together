"use client";

import { useState } from "react";
import { X, Loader2, Camera, Check, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import type { Mission } from "@/lib/types";
import LinkifiedText from "@/components/LinkifiedText";
import { STICKER_EMOJI, targetPeriodLabel, limitSummary } from "@/lib/missionDisplay";

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

const MAX_PROOF_IMAGES = 3;

// Human-readable messages for the exceptions raised by complete_mission()
// (see supabase/migrations/0068_multi_proof_images.sql for the current version).
function friendlyError(raw: string): string {
  if (raw.includes("already_checked_in_this_week")) return "คุณทำภารกิจนี้ไปแล้วในสัปดาห์นี้ ✓";
  if (raw.includes("weekly_limit_reached")) return "ทำภารกิจนี้ครบจำนวนครั้งสูงสุดของสัปดาห์นี้แล้ว";
  if (raw.includes("daily_limit_reached")) return "ทำภารกิจนี้ครบจำนวนครั้งสูงสุดของวันนี้แล้ว ลองใหม่พรุ่งนี้นะ";
  if (raw.includes("target_not_reached")) return "ยังไม่ถึงเป้าหมาย ลองกรอกค่าที่มากขึ้นอีกนิด";
  if (raw.includes("campaign_not_active")) return "แคมเปญนี้ยังไม่เริ่ม หรือสิ้นสุดแล้ว";
  if (raw.includes("mission_not_in_current_phase")) return "ภารกิจนี้ยังไม่เปิดหรือปิดไปแล้ว (พ้นช่วงของภารกิจนี้)";
  if (raw.includes("mission_not_found")) return "ไม่พบภารกิจนี้";
  if (raw.includes("too_many_proof_images")) return `แนบรูปได้สูงสุด ${MAX_PROOF_IMAGES} รูปเท่านั้น`;
  if (raw.includes("not_authenticated")) return "กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function CheckInModal({ mission, onClose, onSuccess }: Props) {
  const isCheckbox = mission.input_type === "checkbox";
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);

    setProofFiles((prev) => {
      const availableSlots = MAX_PROOF_IMAGES - prev.length;

      if (incoming.length > availableSlots) {
        setError(
          availableSlots === 0
            ? `แนบครบ ${MAX_PROOF_IMAGES} รูปแล้ว ลบรูปเดิมออกก่อนถึงจะเพิ่มได้`
            : `เลือกได้อีกแค่ ${availableSlots} รูป (สูงสุดรวม ${MAX_PROOF_IMAGES} รูป) — เพิ่มให้ ${availableSlots} รูปแรกเท่านั้น`
        );
      } else {
        setError(null);
      }

      return [...prev, ...incoming.slice(0, availableSlots)];
    });
  }

  function removeFile(index: number) {
    setProofFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let numericValue: number;
    if (isCheckbox) {
      if (!checked) {
        setError("ติ๊กยืนยันว่าทำแล้วก่อนนะ");
        return;
      }
      numericValue = mission.target_value; // checkbox missions always submit their own target as-is
    } else {
      numericValue = Number(value);
      if (!value || Number.isNaN(numericValue) || numericValue < 0) {
        setError("กรุณากรอกตัวเลขที่ถูกต้อง");
        return;
      }
    }

    if (mission.requires_proof && proofFiles.length === 0) {
      setError("ภารกิจนี้ต้องแนบรูปหลักฐานก่อน Check-in");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    let proofUrls: string[] | null = null;
    if (proofFiles.length > 0) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        setLoading(false);
        setError("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
        return;
      }

      const uploadedUrls: string[] = [];
      for (let i = 0; i < proofFiles.length; i++) {
        const file = proofFiles[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${mission.id}-${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("proofs").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

        if (uploadError) {
          setLoading(false);
          setError("แนบรูปไม่สำเร็จ กรุณาลองใหม่");
          return;
        }

        uploadedUrls.push(supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl);
      }
      proofUrls = uploadedUrls;
    }

    const { data, error: rpcError } = await supabase.rpc("complete_mission", {
      p_mission_id: mission.id,
      p_value: numericValue,
      p_note: note || null,
      p_proof_urls: proofUrls,
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
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 animate-bounce-once max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{mission.name}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {mission.description && <LinkifiedText text={mission.description} className="text-sm text-gray-500" />}

        {!isCheckbox && (
          <p className="text-sm text-gray-400">
            เป้าหมาย {mission.target_value.toLocaleString()} {mission.unit} / {targetPeriodLabel(mission.max_per_day)}
          </p>
        )}

        <div className="flex items-center gap-3 text-sm">
          <span className="text-us font-semibold">
            ⭐ +{mission.points} คะแนน
          </span>
          {mission.sticker_color && mission.sticker_amount > 0 && (
            <span className="text-gray-500">
              {STICKER_EMOJI[mission.sticker_color]} +{mission.sticker_amount}
            </span>
          )}
        </div>

        {limitSummary(mission.max_per_week, mission.max_per_day) && (
          <p className="text-xs text-gray-400">{limitSummary(mission.max_per_week, mission.max_per_day)}</p>
        )}

        {mission.requires_proof && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            ภารกิจนี้ต้องแนบรูปหลักฐาน (สูงสุด {MAX_PROOF_IMAGES} รูป) — คะแนน/สติ๊กเกอร์จะได้หลัง Admin ตรวจสอบและอนุมัติ
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isCheckbox ? (
            <button
              type="button"
              onClick={() => setChecked((v) => !v)}
              className={`w-full flex items-center gap-3 rounded-xl border p-4 min-h-[44px] text-left ${
                checked ? "border-us bg-us/5" : "border-gray-200"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  checked ? "bg-us border-us" : "border-gray-300"
                }`}
              >
                {checked && <Check size={16} className="text-white" />}
              </span>
              <span className={`text-sm font-medium ${checked ? "text-us" : "text-gray-600"}`}>ทำแล้ว</span>
            </button>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500">ค่าที่ทำได้ ({mission.unit})</label>
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`เช่น ${mission.target_value}`}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
              />
            </div>
          )}

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
              <label className="text-xs font-medium text-gray-500">
                แนบรูปหลักฐาน ({proofFiles.length}/{MAX_PROOF_IMAGES})
              </label>

              {proofFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {proofFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      <Camera size={14} className="shrink-0 text-gray-400" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label="ลบรูปนี้"
                        className="shrink-0 text-red-400 p-1 min-h-[28px] min-w-[28px] flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {proofFiles.length < MAX_PROOF_IMAGES && (
                <label className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 cursor-pointer min-h-[44px]">
                  <Camera size={18} />
                  {proofFiles.length === 0 ? "แตะเพื่อถ่ายรูป/เลือกรูป" : "เพิ่มรูปอีก"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
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
