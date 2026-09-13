"use client";

import { X } from "lucide-react";
import BadgeArtwork, { type BadgeTier, type BadgeState } from "@/components/BadgeArtwork";

const TIER_LABEL: Record<string, string> = { bulk: "Bulk (พื้นฐาน)", lean: "Lean (ก้าวหน้า)", smart: "Smart (สุดยอด)" };

export interface BadgeDetailData {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  icon_url?: string | null;
  tier: BadgeTier;
  unlocked: boolean;
  unlocked_at: string | null;
  current_value: number;
  target_value: number;
}

export default function BadgeDetailModal({ badge, onClose }: { badge: BadgeDetailData; onClose: () => void }) {
  const pct = Math.min(100, Math.round((badge.current_value / Math.max(badge.target_value, 1)) * 100));
  const state: BadgeState = badge.unlocked ? "earned" : badge.current_value > 0 ? "in_progress" : "locked";
  const remaining = Math.max(0, badge.target_value - badge.current_value);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-6 space-y-4 max-h-[85vh] overflow-y-auto text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="close" className="absolute right-4 top-4 p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <X size={20} />
        </button>

        <div className="flex justify-center pt-2">
          <BadgeArtwork icon={badge.icon ?? "🏅"} iconUrl={badge.icon_url} tier={badge.tier} state={state} size={120} />
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-800">{badge.name}</h2>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-0.5">{TIER_LABEL[badge.tier]}</p>
        </div>

        {badge.description && (
          <div className="text-left rounded-xl bg-bg p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">ทำอย่างไรจึงจะได้ Badge นี้</p>
            <p className="text-sm text-gray-700">{badge.description}</p>
          </div>
        )}

        {badge.unlocked ? (
          <p className="text-sm font-semibold text-us">
            ✓ ปลดล็อกแล้ว
            {badge.unlocked_at && ` · ${new Date(badge.unlocked_at).toLocaleDateString("th-TH")}`}
          </p>
        ) : (
          <div className="text-left space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>ความคืบหน้า</span>
              <span className="font-semibold">
                {badge.current_value} / {badge.target_value}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-we rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400">🔒 เหลืออีก {remaining} เพื่อปลดล็อก</p>
          </div>
        )}
      </div>
    </div>
  );
}
