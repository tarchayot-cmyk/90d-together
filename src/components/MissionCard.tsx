"use client";

import clsx from "clsx";
import { UserPlus } from "lucide-react";
import type { Mission, CheckIn } from "@/lib/types";
import LinkifiedText from "@/components/LinkifiedText";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

export default function MissionCard({
  mission,
  checkIns,
  onCheckIn,
  onInvite,
}: {
  mission: Mission;
  checkIns: CheckIn[]; // this week's check-ins for this mission (can be more than 1 if max_per_week > 1)
  onCheckIn: (mission: Mission) => void; // opens the CheckInModal
  onInvite?: (mission: Mission) => void; // opens the InviteModal — omit to hide the button
}) {
  // Rejected submissions never count toward the weekly limit — same
  // rule complete_mission() itself enforces server-side.
  const completedCount = checkIns.filter((c) => c.proof_status !== "rejected").length;
  const done = completedCount >= mission.max_per_week;
  const pct = Math.min(100, Math.round((completedCount / mission.max_per_week) * 100));
  const showsCount = mission.max_per_week > 1;

  return (
    <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{STICKER_EMOJI[mission.sticker_color ?? ""] ?? "⭐"}</span>
        <h3 className="font-semibold text-gray-800">{mission.name}</h3>
      </div>

      {mission.description && <LinkifiedText text={mission.description} className="text-sm text-gray-500" />}

      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={clsx("h-full rounded-full", done ? "bg-us" : "bg-we")} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          เป้าหมาย {mission.target_value.toLocaleString()} {mission.unit}/สัปดาห์
          {showsCount && ` · สูงสุด ${mission.max_per_week} ครั้ง/สัปดาห์`}
        </span>
        <span>
          ⭐ +{mission.points} {mission.sticker_color && `${STICKER_EMOJI[mission.sticker_color]} +${mission.sticker_amount}`}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onCheckIn(mission)}
          disabled={done}
          className={clsx(
            "flex-1 rounded-full py-2.5 text-sm font-semibold min-h-[44px]",
            done ? "bg-gray-100 text-gray-400" : "bg-us text-white active:opacity-80"
          )}
        >
          {done
            ? showsCount
              ? `✓ ครบ ${mission.max_per_week} ครั้งแล้วสัปดาห์นี้`
              : "✓ สำเร็จแล้วสัปดาห์นี้"
            : showsCount
            ? `CHECK-IN (${completedCount}/${mission.max_per_week})`
            : "CHECK-IN"}
        </button>

        {onInvite && (
          <button
            onClick={() => onInvite(mission)}
            aria-label="ชวนเพื่อนทำภารกิจนี้"
            className="shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold min-h-[44px] border border-we/30 text-we flex items-center gap-1.5"
          >
            <UserPlus size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
