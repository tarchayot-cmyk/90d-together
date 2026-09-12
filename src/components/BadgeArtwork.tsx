"use client";

import clsx from "clsx";

const TIER_COLORS = {
  bulk: { ring: "#CD7F32", light: "#E8C39E", glow: "rgba(205,127,50,0.35)" },
  lean: { ring: "#9E9E9E", light: "#D9D9D9", glow: "rgba(158,158,158,0.35)" },
  smart: { ring: "#F5B700", light: "#FBE29B", glow: "rgba(245,183,0,0.4)" },
} as const;

export type BadgeTier = "bulk" | "lean" | "smart";
export type BadgeState = "locked" | "in_progress" | "earned";

export default function BadgeArtwork({
  icon,
  tier,
  state,
  size = 84,
}: {
  icon: string;
  tier: BadgeTier;
  state: BadgeState;
  size?: number;
}) {
  const colors = TIER_COLORS[tier];
  const ringColor = state === "earned" ? colors.ring : state === "in_progress" ? colors.light : "#D1D5DB";
  const ribbonOpacity = state === "locked" ? 0.35 : state === "in_progress" ? 0.6 : 0.95;

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size * 1.18 }}>
      {/* ribbon tails, sit behind the medallion */}
      <div className="absolute left-1/2 -translate-x-1/2 flex justify-center gap-[6%]" style={{ top: size * 0.6, width: size }}>
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size * 0.09}px solid transparent`,
            borderRight: `${size * 0.09}px solid transparent`,
            borderTop: `${size * 0.3}px solid ${ringColor}`,
            opacity: ribbonOpacity,
            transform: "rotate(-6deg)",
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size * 0.09}px solid transparent`,
            borderRight: `${size * 0.09}px solid transparent`,
            borderTop: `${size * 0.3}px solid ${ringColor}`,
            opacity: ribbonOpacity,
            transform: "rotate(6deg)",
          }}
        />
      </div>

      {/* medallion */}
      <div
        className={clsx("absolute top-0 left-0 rounded-full flex items-center justify-center", state === "locked" && "grayscale")}
        style={{
          width: size,
          height: size,
          background:
            state === "earned"
              ? `radial-gradient(circle at 35% 28%, #ffffff, ${colors.light})`
              : state === "in_progress"
              ? "linear-gradient(#F9FAFB, #F3F4F6)"
              : "#EEF0F2",
          border: `${Math.max(2, size * 0.06)}px solid ${ringColor}`,
          boxShadow: state === "earned" ? `0 0 0 3px white, 0 4px 14px ${colors.glow}` : "none",
          opacity: state === "locked" ? 0.55 : 1,
        }}
      >
        <span style={{ fontSize: size * 0.42, filter: state === "locked" ? "grayscale(1)" : "none" }}>{icon}</span>

        {state === "locked" && (
          <span
            className="absolute bg-gray-400 text-white rounded-full flex items-center justify-center"
            style={{ bottom: -size * 0.02, right: -size * 0.02, width: size * 0.32, height: size * 0.32, fontSize: size * 0.16 }}
          >
            🔒
          </span>
        )}
      </div>
    </div>
  );
}
