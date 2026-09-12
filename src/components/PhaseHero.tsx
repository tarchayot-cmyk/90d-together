"use client";

const PHASE_META: Record<string, { emoji: string; label: string; range: string; windowEnd: number; gradient: string }> = {
  me: { emoji: "🌱", label: "ME", range: "วันที่ 1 – 30", windowEnd: 30, gradient: "from-[#DCEDC8] to-[#AED581]" },
  we: { emoji: "🌿", label: "WE", range: "วันที่ 31 – 60", windowEnd: 60, gradient: "from-[#C8E6C9] to-[#81C784]" },
  us: { emoji: "🌳", label: "US", range: "วันที่ 61 – 90", windowEnd: 90, gradient: "from-[#A5D6A7] to-[#4CAF50]" },
};

export default function PhaseHero({
  primaryPhase,
  currentDay,
  startDate,
  endDate,
}: {
  primaryPhase: string | null;
  currentDay: number;
  startDate: string;
  endDate: string;
}) {
  if (!primaryPhase || !PHASE_META[primaryPhase]) return null;
  const meta = PHASE_META[primaryPhase];
  const remaining = Math.max(0, meta.windowEnd - currentDay);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  return (
    <div className={`relative overflow-hidden rounded-card bg-gradient-to-br ${meta.gradient} p-5 shadow-soft`}>
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/20" />
      <div className="absolute -right-2 bottom-2 w-16 h-16 rounded-full bg-white/15" />

      <div className="relative flex items-start justify-between gap-2">
        <span className="inline-block rounded-pill bg-white/70 px-3 py-1 text-xs font-semibold text-gray-700">
          Phase ปัจจุบัน
        </span>
        <span className="inline-block rounded-pill bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 text-right shrink-0">
          วันที่โครงการ
          <br />
          {fmt(startDate)} – {fmt(endDate)}
        </span>
      </div>

      <div className="relative flex items-center gap-2 mt-3">
        <span className="text-3xl">{meta.emoji}</span>
        <span className="text-3xl font-bold text-gray-800">{meta.label}</span>
      </div>

      <div className="relative flex items-center justify-between mt-2">
        <p className="text-sm text-gray-600 flex items-center gap-1">
          <span className="opacity-70">🍃</span> {meta.range}
        </p>
        <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-semibold text-gray-700">
          เหลืออีก {remaining} วัน
        </span>
      </div>
    </div>
  );
}
