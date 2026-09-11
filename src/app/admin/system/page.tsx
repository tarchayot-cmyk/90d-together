"use client";

import { useState } from "react";
import { AlertTriangle, Trash2, Users, Target, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";

type ActionKey = "results" | "missions" | "members" | "all";

const ACTIONS: {
  key: ActionKey;
  title: string;
  icon: React.ReactNode;
  description: string;
  confirmText: string;
  rpc: string;
  needsStorageCleanup: boolean;
}[] = [
  {
    key: "results",
    title: "Reset Results",
    icon: <RotateCcw size={18} />,
    description:
      "ล้างคะแนน, สติ๊กเกอร์, check-in, Kindness, กลุ่ม Buddy/Squad, Badge ที่ปลดล็อก, แจ้งเตือน, คำเชิญ, โพลกิจกรรม, และ Audit Log ทั้งหมด — ไม่แตะสมาชิก/ภารกิจ/แคมเปญเลย เหมาะกับเริ่มรอบใหม่โดยใช้คนกลุ่มเดิม",
    confirmText: "ล้างผลลัพธ์ทั้งหมด (คะแนน/check-in/badge/ฯลฯ) แต่เก็บสมาชิกและภารกิจไว้?",
    rpc: "admin_reset_results",
    needsStorageCleanup: false,
  },
  {
    key: "missions",
    title: "Reset Missions",
    icon: <Target size={18} />,
    description:
      "ลบนิยามภารกิจทั้งหมด (และ check-in/คะแนน/สติ๊กเกอร์ที่ผูกกับภารกิจเหล่านั้นจะถูกล้างไปด้วยเพื่อไม่ให้ข้อมูลค้าง) — ไม่แตะสมาชิก/แคมเปญ/Kindness/กลุ่ม",
    confirmText: "ลบภารกิจทั้งหมด พร้อม check-in/คะแนนที่ผูกกับภารกิจเหล่านั้น?",
    rpc: "admin_reset_missions",
    needsStorageCleanup: false,
  },
  {
    key: "members",
    title: "Reset Members",
    icon: <Users size={18} />,
    description:
      "ลบสมาชิกทุกคนยกเว้นตัวคุณเอง (รวมบัญชี login) — ผลงาน/คะแนน/กิจกรรมทั้งหมดของพวกเขาจะหายไปพร้อมกันโดยอัตโนมัติ (เลี่ยงไม่ได้ทางเทคนิค) ไม่แตะภารกิจ/แคมเปญ",
    confirmText: "ลบสมาชิกทุกคนยกเว้นคุณ ถาวร แก้คืนไม่ได้?",
    rpc: "admin_reset_members",
    needsStorageCleanup: true,
  },
  {
    key: "all",
    title: "Reset All",
    icon: <Trash2 size={18} />,
    description:
      "รวม Reset Results + Reset Members เข้าด้วยกัน — เหลือแค่บัญชีคุณกับนิยามภารกิจ/แคมเปญเดิม เหมาะกับเริ่มโครงการใหม่ทั้งหมด",
    confirmText: "รีเซ็ตระบบทั้งหมด เหลือแค่บัญชีคุณคนเดียว ถาวร แก้คืนไม่ได้?",
    rpc: "admin_reset_all",
    needsStorageCleanup: true,
  },
];

export default function AdminSystemPage() {
  const { member, loading: memberLoading } = useMember();
  const [typedConfirm, setTypedConfirm] = useState<Record<ActionKey, string>>({
    results: "",
    missions: "",
    members: "",
    all: "",
  });
  const [runningKey, setRunningKey] = useState<ActionKey | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (memberLoading) {
    return <p className="text-sm text-gray-400 text-center py-10">กำลังตรวจสอบสิทธิ์...</p>;
  }

  if (member?.role !== "super_admin") {
    return (
      <div className="px-4 py-10 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="text-sm text-gray-500">หน้านี้สำหรับ Super Admin เท่านั้น</p>
      </div>
    );
  }

  async function cleanupStorage(authIds: string[]) {
    if (authIds.length === 0) return;
    const supabase = createClient();

    for (const bucket of ["proofs", "avatars"] as const) {
      for (const authId of authIds) {
        const { data: files } = await supabase.storage.from(bucket).list(authId);
        if (files && files.length > 0) {
          const paths = files.map((f) => `${authId}/${f.name}`);
          await supabase.storage.from(bucket).remove(paths);
        }
      }
    }
  }

  async function handleRun(action: (typeof ACTIONS)[number]) {
    const confirmed = window.confirm(action.confirmText + "\n\nกด OK เพื่อยืนยันครั้งสุดท้าย");
    if (!confirmed) return;

    setRunningKey(action.key);
    setStatusMessage(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc(action.rpc);

    if (error) {
      setRunningKey(null);
      setStatusMessage(
        error.message.includes("not_authorized") ? "คุณไม่มีสิทธิ์ทำรายการนี้ (ต้องเป็น Super Admin)" : "ทำรายการไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }

    if (action.needsStorageCleanup) {
      setStatusMessage("ลบข้อมูลสำเร็จ กำลังล้างไฟล์รูปที่เหลือ...");
      const removedIds: string[] = data?.removed_auth_ids ?? data?.members?.removed_auth_ids ?? [];
      try {
        await cleanupStorage(removedIds);
      } catch {
        // best-effort — DB reset already succeeded regardless
      }
    }

    setRunningKey(null);
    setTypedConfirm((prev) => ({ ...prev, [action.key]: "" }));
    setStatusMessage(`${action.title} เสร็จสมบูรณ์`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-red-50 border border-red-200 p-4 flex gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          การกระทำในหน้านี้ <strong>ลบข้อมูลจริงถาวร แก้คืนไม่ได้</strong> แนะนำให้สำรองข้อมูลไว้ก่อนกดใช้งานจริงครั้งแรก
        </p>
      </div>

      {statusMessage && <p className="text-sm text-center text-gray-600 bg-white rounded-card p-2 shadow-sm">{statusMessage}</p>}

      {ACTIONS.map((action) => {
        const isMatch = typedConfirm[action.key].trim().toUpperCase() === "RESET";
        const isRunning = runningKey === action.key;
        return (
          <div key={action.key} className="rounded-card bg-white shadow-sm p-4 space-y-3 border border-red-100">
            <div className="flex items-center gap-2 text-red-600">
              {action.icon}
              <h3 className="font-semibold">{action.title}</h3>
            </div>
            <p className="text-xs text-gray-500">{action.description}</p>

            <div>
              <label className="text-xs font-medium text-gray-500">
                พิมพ์ <span className="font-mono font-bold text-red-500">RESET</span> เพื่อปลดล็อกปุ่ม
              </label>
              <input
                type="text"
                value={typedConfirm[action.key]}
                onChange={(e) => setTypedConfirm((prev) => ({ ...prev, [action.key]: e.target.value }))}
                placeholder="RESET"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base font-mono focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>

            <button
              onClick={() => handleRun(action)}
              disabled={!isMatch || runningKey !== null}
              className="w-full rounded-full bg-red-500 text-white text-sm font-semibold py-3 min-h-[44px] disabled:opacity-40"
            >
              {isRunning ? "กำลังดำเนินการ..." : `ยืนยัน ${action.title}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
