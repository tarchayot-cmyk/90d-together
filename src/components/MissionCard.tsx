"use client";

import clsx from "clsx";
import type { Mission, CheckIn } from "@/lib/types";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "🩷",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

export default function MissionCard({
  mission,
  checkIn,
  onCheckIn,
}: {
  mission: Mission;
  checkIn: CheckIn | null; // this week's check-in for this mission, if any
  onCheckIn: (mission: Mission) => void; // opens the CheckInModal
}) {
  const done = !!checkIn?.completed_at;
  const pct = done ? 100 : 0;

  return (
    <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{STICKER_EMOJI[mission.sticker_color ?? ""] ?? "⭐"}</span>
        <h3 className="font-semibold text-gray-800">{mission.name}</h3>
      </div>

      {mission.description && <p className="text-sm text-gray-500">{mission.description}</p>}

      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={clsx("h-full rounded-full", done ? "bg-us" : "bg-we")} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          เป้าหมาย {mission.target_value.toLocaleString()} {mission.unit}/สัปดาห์
        </span>
        <span>
          ⭐ +{mission.points} {mission.sticker_color && `${STICKER_EMOJI[mission.sticker_color]} +${mission.sticker_amount}`}
        </span>
      </div>

      <button
        onClick={() => onCheckIn(mission)}
        disabled={done}
        className={clsx(
          "w-full rounded-full py-2.5 text-sm font-semibold min-h-[44px]",
          done ? "bg-gray-100 text-gray-400" : "bg-us text-white active:opacity-80"
        )}
      >
        {done ? "✓ สำเร็จแล้วสัปดาห์นี้" : "CHECK-IN"}
      </button>
    </div>
  );
}
