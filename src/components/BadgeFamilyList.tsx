"use client";

import { useState } from "react";
import clsx from "clsx";
import BadgeArtwork, { type BadgeState } from "@/components/BadgeArtwork";
import BadgeDetailModal from "@/components/BadgeDetailModal";

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
  const [detailBadge, setDetailBadge] = useState<BadgeRow | null>(null);
  const families = groupByFamily(badges);

  const content = groupByLevel ? (
    <div className="space-y-5">
      {(["me", "we", "us"] as const).map((lvl) => {
        const levelFamilies = families.filter((f) => f.level === lvl);
        if (levelFamilies.length === 0) return null;
        return (
          <div key={lvl}>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">{LEVEL_LABEL[lvl]}</h3>
            <FamilyGrid families={levelFamilies} onSelect={setDetailBadge} />
          </div>
        );
      })}
    </div>
  ) : (
    <FamilyGrid families={families} onSelect={setDetailBadge} />
  );

  return (
    <>
      {content}
      {detailBadge && (
        <BadgeDetailModal
          badge={{
            code: detailBadge.code,
            name: detailBadge.name,
            description: detailBadge.description,
            icon: detailBadge.icon,
            tier: detailBadge.tier,
            unlocked: detailBadge.unlocked,
            unlocked_at: detailBadge.unlocked_at,
            current_value: detailBadge.current_value,
            target_value: detailBadge.target_value,
          }}
          onClose={() => setDetailBadge(null)}
        />
      )}
    </>
  );
}

function FamilyGrid({
  families,
  onSelect,
}: {
  families: ReturnType<typeof groupByFamily>;
  onSelect: (b: BadgeRow) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {families.map((family) => {
        // The tier currently being worked toward: first not-yet-unlocked
        // tier, or the last (smart, or the only tier for 1-tier badges) if all unlocked.
        const activeTier = family.tiers.find((t) => !t.unlocked) ?? family.tiers[family.tiers.length - 1];
        const state: BadgeState = activeTier.unlocked ? "earned" : activeTier.current_value > 0 ? "in_progress" : "locked";
        const pct = Math.min(100, Math.round((activeTier.current_value / Math.max(activeTier.target_value, 1)) * 100));

        return (
          <button
            key={family.familyCode}
            onClick={() => onSelect(activeTier)}
            className="rounded-xl bg-white border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center min-h-[44px]"
          >
            <BadgeArtwork icon={activeTier.icon ?? "🏅"} tier={activeTier.tier} state={state} size={64} />
            <p className="text-xs font-medium text-gray-800 leading-tight mt-1">{family.familyName}</p>

            {family.tiers.length > 1 && (
              <div className="flex gap-1">
                {family.tiers.map((t) => (
                  <span key={t.code} className={clsx("w-1.5 h-1.5 rounded-full", t.unlocked ? "bg-us" : "bg-gray-200")} />
                ))}
              </div>
            )}

            {!activeTier.unlocked && (
              <p className="text-[10px] text-gray-400">
                {activeTier.current_value}/{activeTier.target_value}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
