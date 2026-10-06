"use client";

import { useState } from "react";
import useSWR from "swr";
import { Target, Check } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface GoalStatus {
  active: boolean;
  week?: number;
  target_days?: number | null;
  days_done?: number;
  completed?: boolean;
  can_change?: boolean;
  suggested_days?: number;
  bonus_points?: number;
  completed_weeks?: number;
}

const LEVELS = [
  { days: 2, label: "เบาๆ", emoji: "🌱" },
  { days: 4, label: "กำลังดี", emoji: "🌿" },
  { days: 6, label: "ท้าทาย", emoji: "🌳" },
];

async function fetchStatus(): Promise<GoalStatus | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_weekly_goal_status");
  return data;
}

export default function WeeklyGoalCard() {
  const { data: status, isLoading, mutate } = useSWR("weekly-goal", fetchStatus, {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <div className="rounded-card bg-white shadow-soft p-4 h-24 animate-pulse" />;
  if (!status?.active) return null;

  const bonus = status.bonus_points ?? 30;
  const target = status.target_days ?? null;
  const done = status.days_done ?? 0;
  const showPicker = target === null || choosing;

  async function pick(days: number) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("set_weekly_goal", { p_target_days: days });
    setSaving(false);
    if (err) {
      setError(err.message.includes("goal_locked") ? "เลือกเป้าใหม่ไม่ได้แล้วในสัปดาห์นี้" : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setChoosing(false);
    mutate();
  }

  return (
    <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target size={18} className="text-us" />
        <h3 className="font-semibold text-gray-800">เป้าหมายสัปดาห์นี้</h3>
        {(status.completed_weeks ?? 0) > 0 && (
          <span className="ml-auto text-xs text-gray-400">สำเร็จมาแล้ว {status.completed_weeks} สัปดาห์</span>
        )}
      </div>

      {showPicker ? (
        <>
          <p className="text-xs text-gray-500">
            เลือกจำนวนวันที่จะเช็คอินสัปดาห์นี้ ทำถึงเป้าได้ +{bonus} แต้มเท่ากันทุกระดับ พร้อม Badge ตามระดับที่เลือก
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.days}
                disabled={saving}
                onClick={() => pick(l.days)}
                className={`rounded-2xl border py-3 px-1 text-center min-h-[44px] disabled:opacity-50 ${
                  target === l.days ? "border-us bg-pastel-green" : "border-gray-200 bg-white"
                }`}
              >
                <span className="block text-xl">{l.emoji}</span>
                <span className="block text-sm font-semibold text-gray-800">{l.days} วัน</span>
                <span className="block text-xs text-gray-500">{l.label}</span>
                {status.suggested_days === l.days && <span className="block text-[10px] text-us font-semibold mt-0.5">แนะนำ</span>}
              </button>
            ))}
          </div>
          {target !== null && (
            <button onClick={() => setChoosing(false)} className="text-xs text-gray-400 min-h-[36px]">
              ยกเลิก
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {Array.from({ length: target ?? 0 }).map((_, i) => (
              <span
                key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                  i < done ? "bg-us text-white" : "bg-gray-100 text-gray-300"
                }`}
              >
                {i < done ? <Check size={14} /> : i + 1}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {status.completed
                ? `🎉 ถึงเป้า ${target} วันแล้ว ได้ +${bonus} แต้ม`
                : `เช็คอินแล้ว ${done} จาก ${target} วัน · ถึงเป้าได้ +${bonus} แต้ม`}
            </span>
            {status.can_change && !status.completed && (
              <button onClick={() => setChoosing(true)} className="text-xs text-us min-h-[36px] px-1">
                เปลี่ยนเป้า
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
