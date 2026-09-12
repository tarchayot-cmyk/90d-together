"use client";

import clsx from "clsx";

export interface BadgeRow {
  code: string;
  family_code: string;
  tier: "bulk" | "lean" | "smart";
  level: "me" | "we" | "us";
  name: string;
  description: string | null;
  icon: string | null;
  unlocked: boolean;
  unlocked_at: string | null;
  current_value: number;
  target_value: number;
}

const TIER_ORDER = { bulk: 0, lean: 1, smart: 2 } as const;
const TIER_MEDAL = { bulk: "🥉", lean: "🥈", smart: "🥇" } as const;
const LEVEL_LABEL: Record<string, string> = { me: "🌱 ME", we: "🌿 WE", us: "🌳 US" };

function stripMedal(name: string) {
  return name.replace(/[🥉🥈🥇]/g, "").trim();
}

function groupByFamily(rows: BadgeRow[]) {
  const families = new Map<string, BadgeRow[]>();
  for (const row of rows) {
    if (!families.has(row.family_code)) families.set(row.family_code, []);
    families.get(row.family_code)!.push(row);
  }
  return Array.from(families.entries()).map(([familyCode, tiers]) => ({
    familyCode,
    level: tiers[0].level,
    familyName: stripMedal(tiers[0].name),
    tiers: tiers.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]),
  }));
}

export default function BadgeFamilyList({ badges, groupByLevel = true }: { badges: BadgeRow[]; groupByLevel?: boolean }) {
  const families = groupByFamily(badges);

  if (!groupByLevel) {
    return <FamilyGrid families={families} />;
  }

  const levels: ("me" | "we" | "us")[] = ["me", "we", "us"];
  return (
    <div className="space-y-5">
      {levels.map((lvl) => {
        const levelFamilies = families.filter((f) => f.level === lvl);
        if (levelFamilies.length === 0) return null;
        return (
          <div key={lvl}>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">{LEVEL_LABEL[lvl]}</h3>
            <FamilyGrid families={levelFamilies} />
          </div>
        );
      })}
    </div>
  );
}

function FamilyGrid({ families }: { families: ReturnType<typeof groupByFamily> }) {
  return (
    <div className="space-y-2">
      {families.map((family) => {
        // The tier currently being worked toward: first not-yet-unlocked
        // tier, or the last (smart) one if all are unlocked.
        const activeTier = family.tiers.find((t) => !t.unlocked) ?? family.tiers[family.tiers.length - 1];
        const pct = Math.min(100, Math.round((activeTier.current_value / Math.max(activeTier.target_value, 1)) * 100));

        return (
          <div key={family.familyCode} className="rounded-xl bg-white border border-gray-100 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">{family.familyName}</p>
              <div className="flex gap-1 text-base">
                {family.tiers.map((t) => (
                  <span key={t.code} className={clsx(!t.unlocked && "grayscale opacity-30")} title={t.description ?? ""}>
                    {TIER_MEDAL[t.tier]}
                  </span>
                ))}
              </div>
            </div>

            {activeTier.unlocked ? (
              <p className="text-xs text-us font-medium">ปลดล็อกครบทุกระดับแล้ว 🎉</p>
            ) : (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-we rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400">
                  {TIER_MEDAL[activeTier.tier]} {activeTier.description} — {activeTier.current_value}/{activeTier.target_value}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
