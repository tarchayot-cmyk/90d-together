"use client";

import clsx from "clsx";
import { ChevronRight, UserPlus } from "lucide-react";
import type { Mission, CheckIn } from "@/lib/types";
import LinkifiedText from "@/components/LinkifiedText";

// Simple emoji stand-ins for now — see conversation note on custom
// illustrated icons (same constraint as Badge artwork).
const CATEGORY_ICON: Record<string, string> = {
  move_me: "👟",
  sleep_me: "🌙",
  eat_me: "🥗",
  know_me: "🧠",
  buddy_walk: "🚶",
  buddy_lunch: "🍱",
  hydration_buddy: "💧",
  buddy_stretch: "🧘",
  big_step: "🚀",
  zero_sugar_squad: "🧃",
  lunch_walk_talk: "🍽️",
  gratitude: "🙏",
};

const CATEGORY_BG: Record<string, string> = {
  move_me: "bg-pastel-green",
  sleep_me: "bg-pastel-blue",
  eat_me: "bg-pastel-orange",
  know_me: "bg-pastel-purple",
};

export default function MissionCard({
  mission,
  checkIns,
  onCheckIn,
  onInvite,
  compact = false,
}: {
  mission: Mission;
  checkIns: CheckIn[]; // this week's check-ins for this mission (can be more than 1 if max_per_week > 1)
  onCheckIn: (mission: Mission) => void;
  onInvite?: (mission: Mission) => void;
  compact?: boolean; // used for the "today's featured mission" card
}) {
  const completedCount = checkIns.filter((c) => c.proof_status !== "rejected").length;
  const done = completedCount >= mission.max_per_week;
  const showsCount = mission.max_per_week > 1;
  const icon = CATEGORY_ICON[mission.category] ?? "🌱";
  const bg = CATEGORY_BG[mission.category] ?? "bg-pastel-green";

  // Weekly progress fraction: latest submitted value this week (out
  // of target) for numeric missions, or times-done (out of max) for
  // checkbox ones — the two numbers that actually mean something
  // given how check-ins work today.
  const latestValue = checkIns.filter((c) => c.proof_status !== "rejected").slice(-1)[0]?.value ?? 0;
  const numeratorLabel =
    mission.input_type === "checkbox"
      ? `${completedCount}/${mission.max_per_week} ครั้ง`
      : `${latestValue}/${mission.target_value} ${mission.unit}`;
  const pct = mission.input_type === "checkbox"
    ? Math.min(100, Math.round((completedCount / mission.max_per_week) * 100))
    : Math.min(100, Math.round((latestValue / mission.target_value) * 100));

  if (compact) {
    return (
      <div className="rounded-card bg-white shadow-soft p-4 flex items-center gap-3">
        <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0", bg)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 truncate">{mission.name}</p>
          {mission.description && <p className="text-xs text-gray-400 truncate">{mission.description}</p>}
        </div>
        <button
          onClick={() => onCheckIn(mission)}
          disabled={done}
          className={clsx(
            "shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold min-h-[44px]",
            done ? "bg-gray-100 text-gray-400" : "bg-us text-white active:opacity-80"
          )}
        >
          {done ? "✓ สำเร็จแล้ว" : "เริ่มทำ"}
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => onCheckIn(mission)} className="w-full text-left rounded-card bg-white shadow-soft p-4 flex items-center gap-3 min-h-[44px]">
      <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0", bg)}>{icon}</div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="font-semibold text-gray-800 truncate">{mission.name}</p>
          {mission.description && <LinkifiedText text={mission.description} className="text-xs text-gray-400 truncate" />}
        </div>

        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className={clsx("h-full rounded-full", done ? "bg-us" : "bg-we")} style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{numeratorLabel}</span>
          {onInvite && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onInvite(mission);
              }}
              className="text-we p-1 -m-1"
              aria-label="ชวนเพื่อนทำภารกิจนี้"
            >
              <UserPlus size={14} />
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </button>
  );
}
