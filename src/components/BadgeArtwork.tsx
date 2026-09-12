"use client";

import { useMemo } from "react";

const TIER_COLORS = {
  bulk: { ring: "#CD7F32", light: "#E8C39E", glow: "rgba(205,127,50,0.4)" },
  lean: { ring: "#9E9E9E", light: "#D9D9D9", glow: "rgba(158,158,158,0.4)" },
  smart: { ring: "#F5B700", light: "#FBE29B", glow: "rgba(245,183,0,0.45)" },
} as const;

export type BadgeTier = "bulk" | "lean" | "smart";
export type BadgeState = "locked" | "in_progress" | "earned";

interface Point {
  x: number;
  y: number;
}

// Regular hexagon vertices, pointy-top orientation (point at 12 and 6
// o'clock), matching the reference artwork.
function hexagonPoints(cx: number, cy: number, r: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

// Generic rounded-corner polygon path: at each vertex, pull back
// `radius` units along both adjacent edges and join the corner with
// a quadratic curve (control point = the original sharp vertex).
function roundedPolygonPath(points: Point[], radius: number): string {
  const n = points.length;
  const segments: string[] = [];

  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];

    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const toPrevLen = Math.hypot(toPrev.x, toPrev.y);
    const toNextLen = Math.hypot(toNext.x, toNext.y);
    const r = Math.min(radius, toPrevLen / 2, toNextLen / 2);

    const p1 = { x: curr.x + (toPrev.x / toPrevLen) * r, y: curr.y + (toPrev.y / toPrevLen) * r };
    const p2 = { x: curr.x + (toNext.x / toNextLen) * r, y: curr.y + (toNext.y / toNextLen) * r };

    segments.push(i === 0 ? `M ${p1.x} ${p1.y}` : `L ${p1.x} ${p1.y}`);
    segments.push(`Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`);
  }
  segments.push("Z");
  return segments.join(" ");
}

export default function BadgeArtwork({
  icon,
  iconUrl,
  tier,
  state,
  size = 84,
}: {
  icon: string;
  iconUrl?: string | null;
  tier: BadgeTier;
  state: BadgeState;
  size?: number;
}) {
  const colors = TIER_COLORS[tier];
  const ringColor = state === "earned" ? colors.ring : state === "in_progress" ? colors.light : "#D1D5DB";
  const ribbonOpacity = state === "locked" ? 0.35 : state === "in_progress" ? 0.6 : 0.95;
  const glowId = `badge-glow-${tier}-${state}`;

  const outerPath = useMemo(() => roundedPolygonPath(hexagonPoints(50, 46, 44), 11), []);
  const innerPath = useMemo(() => roundedPolygonPath(hexagonPoints(50, 46, 37), 9), []);

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size * 1.2 }}>
      <svg viewBox="0 0 100 116" width={size} height={size * 1.16} className={state === "locked" ? "grayscale" : undefined}>
        {state === "earned" && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={colors.glow} />
          </filter>
        )}

        {/* ribbon tails, behind the hexagon */}
        <polygon points="34,88 44,88 40,112 30,104" fill={ringColor} opacity={ribbonOpacity} />
        <polygon points="56,88 66,88 70,104 60,112" fill={ringColor} opacity={ribbonOpacity} />

        <g filter={state === "earned" ? `url(#${glowId})` : undefined} opacity={state === "locked" ? 0.55 : 1}>
          {/* outer hexagon = the tier-colored ring/frame */}
          <path d={outerPath} fill={ringColor} />
          {/* inner hexagon = the face, slightly smaller so the ring shows */}
          <path
            d={innerPath}
            fill={
              state === "earned"
                ? `url(#badge-face-${tier})`
                : state === "in_progress"
                ? "#F9FAFB"
                : "#EEF0F2"
            }
          />
          {state === "earned" && (
            <defs>
              <radialGradient id={`badge-face-${tier}`} cx="35%" cy="28%" r="75%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor={colors.light} />
              </radialGradient>
            </defs>
          )}
        </g>

        {iconUrl ? (
          <>
            <clipPath id={`badge-clip-${tier}`}>
              <circle cx="50" cy="46" r="30" />
            </clipPath>
            <image
              href={iconUrl}
              x="20"
              y="16"
              width="60"
              height="60"
              clipPath={`url(#badge-clip-${tier})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ filter: state === "locked" ? "grayscale(1)" : "none" }}
            />
          </>
        ) : (
          <text x="50" y="54" textAnchor="middle" dominantBaseline="central" fontSize="34" style={{ filter: state === "locked" ? "grayscale(1)" : "none" }}>
            {icon}
          </text>
        )}

        {state === "locked" && (
          <>
            <circle cx="80" cy="72" r="13" fill="#9CA3AF" />
            <text x="80" y="73" textAnchor="middle" dominantBaseline="central" fontSize="14">
              🔒
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
