"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

const SIZES: { size: string; chest: number; length: number }[] = [
  { size: "SS", chest: 34, length: 24 },
  { size: "S", chest: 36, length: 25.5 },
  { size: "M", chest: 40, length: 27 },
  { size: "L", chest: 43, length: 28.5 },
  { size: "XL", chest: 46, length: 30 },
  { size: "XXL", chest: 50, length: 32 },
  { size: "3XL", chest: 54, length: 33 },
  { size: "4XL", chest: 58, length: 34 },
  { size: "5XL", chest: 62, length: 35 },
];

export default function ShirtRewardCard() {
  const [reached, setReached] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("get_my_shirt_status")
      .then(({ data }) => {
        if (data?.reached) {
          setReached(true);
          setSaved(data.size ?? null);
          setPicked(data.size ?? null);
        }
      });
  }, []);

  if (!reached) return null;

  const info = SIZES.find((s) => s.size === picked);

  async function save() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().rpc("set_my_shirt_size", { p_size: picked });
    setBusy(false);
    if (err) {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setSaved(picked);
    setEditing(false);
  }

  const showForm = !saved || editing;

  return (
    <section className="rounded-card bg-gradient-to-br from-yellow-50 to-pastel-green shadow-soft p-4 space-y-3">
      <div>
        <p className="font-bold text-gray-800">🎉 ยินดีด้วย! คะแนนครบ 3,000 แล้ว</p>
        <p className="text-sm text-gray-600">คุณได้รับเสื้อที่ระลึกจากกิจกรรม เลือกไซซ์เสื้อได้เลย</p>
      </div>

      {showForm ? (
        <>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button
                key={s.size}
                onClick={() => setPicked(s.size)}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] min-w-[52px]",
                  picked === s.size ? "bg-us text-white" : "bg-white text-gray-600 shadow-soft"
                )}
              >
                {s.size}
              </button>
            ))}
          </div>
          {info ? (
            <p className="text-xs text-gray-600">
              ไซซ์ {info.size}: รอบอก {info.chest} นิ้ว · ความยาว {info.length} นิ้ว
            </p>
          ) : (
            <p className="text-xs text-gray-400">แตะไซซ์เพื่อดูรอบอกและความยาว</p>
          )}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">ดูตารางไซซ์ทั้งหมด</summary>
            <p className="mt-1">รอบอกวัดจากใต้รักแร้ ซ้าย-ขวา แล้วคูณสอง · ความยาววัดจากไหล่บริเวณฐานคอถึงชายเสื้อ (หน่วยนิ้ว)</p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-center">
                <thead>
                  <tr>
                    <th className="p-1"></th>
                    {SIZES.map((s) => (
                      <th key={s.size} className="p-1">{s.size}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 text-left whitespace-nowrap">รอบอก</td>
                    {SIZES.map((s) => (
                      <td key={s.size} className="p-1">{s.chest}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-1 text-left whitespace-nowrap">ยาว</td>
                    {SIZES.map((s) => (
                      <td key={s.size} className="p-1">{s.length}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!picked || busy}
              className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก..." : "ยืนยันไซซ์"}
            </button>
            {saved && (
              <button onClick={() => { setPicked(saved); setEditing(false); }} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft">
                ยกเลิก
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-700">
            ไซซ์ที่เลือก: <span className="font-bold text-us">{saved}</span>
          </p>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-us border border-us/30 rounded-full px-3 py-1.5 min-h-[36px]">
            เปลี่ยนไซซ์
          </button>
        </div>
      )}
    </section>
  );
}
