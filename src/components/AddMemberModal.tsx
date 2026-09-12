"use client";

import { useState } from "react";
import { X, Loader2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export const UNITS = ["Chemo", "TPN", "IV admixture", "ผลิตยาทั่วไป", "Extem"] as const;

function friendlyError(raw: string): string {
  if (raw.includes("employee_code_already_exists")) return "รหัสบุคลากรนี้มีอยู่แล้ว";
  if (raw.includes("pin_too_short")) return "PIN ต้องมีอย่างน้อย 4 หลัก";
  if (raw.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function AddMemberModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [unit, setUnit] = useState("");
  const [department, setDepartment] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"participant" | "admin">("participant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!employeeCode.trim() || !fullName.trim() || pin.length < 4) {
      setError("กรอกรหัสบุคลากร, ชื่อ, และ PIN อย่างน้อย 4 หลัก");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("admin_create_member", {
      p_employee_code: employeeCode.trim(),
      p_full_name: fullName.trim(),
      p_pin: pin,
      p_department: department.trim() || null,
      p_role: role,
    });

    if (rpcError) {
      setLoading(false);
      setError(friendlyError(rpcError.message));
      return;
    }

    // Nickname/unit go through the same edit RPC Task 6 added for
    // existing members — one extra call right after creation, only
    // if the admin actually filled either field in.
    if ((nickname.trim() || unit) && data?.member_id) {
      await supabase.rpc("admin_update_member_details", {
        p_member_id: data.member_id,
        p_full_name: fullName.trim(),
        p_nickname: nickname.trim() || null,
        p_unit: unit || null,
      });
    }

    setLoading(false);
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus size={18} /> เพิ่มสมาชิกใหม่
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="รหัสบุคลากร" value={employeeCode} onChange={setEmployeeCode} placeholder="เช่น EMP002" />
          <Field label="ชื่อ-นามสกุล" value={fullName} onChange={setFullName} placeholder="ชื่อที่แสดงในแอป" />
          <Field label="ชื่อเล่น (ไม่บังคับ)" value={nickname} onChange={setNickname} placeholder="เช่น เอ" />

          <div>
            <label className="text-xs font-medium text-gray-500">หน่วย (ไม่บังคับ)</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base">
              <option value="">-- ไม่ระบุ --</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <Field label="แผนก (ไม่บังคับ)" value={department} onChange={setDepartment} placeholder="เช่น เภสัชกรรม" />
          <Field label="PIN เริ่มต้น (4-6 หลัก)" value={pin} onChange={(v) => setPin(v.replace(/[^0-9]/g, ""))} placeholder="1234" type="password" inputMode="numeric" maxLength={6} />

          <div>
            <label className="text-xs font-medium text-gray-500">บทบาท</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "participant" | "admin")}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
            >
              <option value="participant">Participant</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังสร้าง..." : "สร้างสมาชิก"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric";
  maxLength?: number;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
      />
    </div>
  );
}
