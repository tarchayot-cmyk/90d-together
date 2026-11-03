"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

// ปุ่ม "พักจากการจับคู่ Buddy" — แสดงเฉพาะบัญชีที่ฐานข้อมูลเปิดฟีเจอร์ให้ (feature_flags: pair_pause)
export default function PairPauseCard() {
  const [available, setAvailable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("get_my_pair_pause")
      .then(({ data }) => {
        if (data?.available) {
          setAvailable(true);
          setPaused(!!data.paused);
        }
      });
  }, []);

  if (!available) return null;

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("set_my_pair_pause", { p_paused: next });
    setBusy(false);
    if (error) {
      setMsg("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setPaused(next);
    setMsg(next ? "บันทึกแล้ว: รอบหน้าจะไม่ถูกจับคู่ ✓" : "บันทึกแล้ว: กลับเข้าร่วมการจับคู่ ✓");
  }

  return (
    <div className="rounded-card bg-white shadow-soft p-4 space-y-2">
      <h2 className="font-semibold text-gray-800 text-sm">😴 พักจากการจับคู่ Buddy</h2>
      <p className="text-xs text-gray-500">
        ถ้าเหนื่อยหรืออยากพัก เลือกพักได้ จะไม่ถูกจับคู่ในรอบถัดไป และจะไม่ได้โบนัสจากกิจกรรม Buddy (กลุ่มปัจจุบันของคุณยังอยู่จนจบรอบ) เปลี่ยนใจกลับเข้าร่วมได้ทุกเมื่อ ก่อนวันจับคู่รอบถัดไป
      </p>
      <label className="flex items-center gap-2 text-sm text-gray-700 min-h-[44px]">
        <input type="checkbox" checked={paused} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        พักจากการจับคู่รอบถัดไป
      </label>
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  );
}
