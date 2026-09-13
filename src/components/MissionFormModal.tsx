"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { MISSION_CATEGORIES, STICKER_COLORS, LEVELS } from "@/lib/missionOptions";
import type { Mission } from "@/lib/types";

function friendlyError(raw: string): string {
  if (raw.includes("target_value_must_be_positive")) return "เป้าหมายต้องมากกว่า 0";
  if (raw.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (raw.includes("mission_not_found")) return "ไม่พบภารกิจนี้ อาจถูกลบไปแล้ว";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function MissionFormModal({
  campaignId,
  mission,
  onClose,
  onSuccess,
}: {
  campaignId: string;
  mission: Mission | null; // null = creating a new mission
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [level, setLevel] = useState(mission?.level ?? "me");
  const [category, setCategory] = useState(mission?.category ?? "other");
  const [name, setName] = useState(mission?.name ?? "");
  const [description, setDescription] = useState(mission?.description ?? "");
  const [targetValue, setTargetValue] = useState(String(mission?.target_value ?? ""));
  const [unit, setUnit] = useState(mission?.unit ?? "");
  const [inputType, setInputType] = useState<"numeric" | "checkbox">(mission?.input_type ?? "numeric");
  const [points, setPoints] = useState(String(mission?.points ?? 10));
  const [stickerColor, setStickerColor] = useState(mission?.sticker_color ?? "");
  const [stickerAmount, setStickerAmount] = useState(String(mission?.sticker_amount ?? 1));
  const [requiresProof, setRequiresProof] = useState(mission?.requires_proof ?? false);
  const [isActive, setIsActive] = useState(mission?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalTargetValue = inputType === "checkbox" ? "1" : targetValue;
    const finalUnit = inputType === "checkbox" ? "ครั้ง" : unit;

    if (!name.trim() || !finalUnit.trim() || !finalTargetValue) {
      setError("กรอกชื่อ, หน่วย, และเป้าหมายให้ครบ");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_upsert_mission", {
      p_mission_id: mission?.id ?? null,
      p_campaign_id: campaignId,
      p_level: level,
      p_category: category,
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_target_value: Number(finalTargetValue),
      p_unit: finalUnit.trim(),
      p_points: Number(points) || 0,
      p_sticker_color: stickerColor || null,
      p_sticker_amount: Number(stickerAmount) || 0,
      p_requires_proof: requiresProof,
      p_is_active: isActive,
      p_input_type: inputType,
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
          <h2 className="font-semibold text-gray-800">{mission ? "แก้ไขภารกิจ" : "สร้างภารกิจใหม่"}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <SelectField label="Level" value={level} onChange={setLevel} options={LEVELS} />
          <SelectField label="Category" value={category} onChange={setCategory} options={MISSION_CATEGORIES} />

          <TextField label="ชื่อภารกิจ" value={name} onChange={setName} placeholder="เช่น Move Me" />
          <TextField label="รายละเอียด (ไม่บังคับ)" value={description} onChange={setDescription} placeholder="เช่น สะสม 50,000 steps/สัปดาห์ หรือใส่ลิงก์ให้กดประเมิน" />

          <div>
            <label className="text-xs font-medium text-gray-500">รูปแบบการบันทึก</label>
            <div className="mt-1 flex rounded-full bg-bg p-1">
              <button
                type="button"
                onClick={() => setInputType("numeric")}
                className={`flex-1 rounded-full py-2 text-xs font-semibold min-h-[36px] ${
                  inputType === "numeric" ? "bg-us text-white" : "text-gray-500"
                }`}
              >
                กรอกตัวเลข (เช่น จำนวนก้าว)
              </button>
              <button
                type="button"
                onClick={() => setInputType("checkbox")}
                className={`flex-1 rounded-full py-2 text-xs font-semibold min-h-[36px] ${
                  inputType === "checkbox" ? "bg-us text-white" : "text-gray-500"
                }`}
              >
                ติ๊กว่าทำแล้ว
              </button>
            </div>
          </div>

          {inputType === "numeric" && (
            <div className="grid grid-cols-2 gap-2">
              <TextField label="เป้าหมาย" value={targetValue} onChange={setTargetValue} type="number" placeholder="50000" />
              <TextField label="หน่วย" value={unit} onChange={setUnit} placeholder="steps" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <TextField label="คะแนน" value={points} onChange={setPoints} type="number" />
            <TextField label="จำนวนสติ๊กเกอร์" value={stickerAmount} onChange={setStickerAmount} type="number" />
          </div>

          <SelectField label="สีสติ๊กเกอร์" value={stickerColor} onChange={setStickerColor} options={STICKER_COLORS} />

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={requiresProof} onChange={(e) => setRequiresProof(e.target.checked)} className="h-4 w-4" />
            ต้องแนบหลักฐาน (รอ Admin อนุมัติก่อนได้รางวัล)
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            เปิดใช้งาน (Active)
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : mission ? "บันทึกการแก้ไข" : "สร้างภารกิจ"}
          </button>
        </form>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
