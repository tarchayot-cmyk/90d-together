"use client";

import { useEffect, useState } from "react";
import { Sparkles, PartyPopper } from "lucide-react";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

export interface RewardToastData {
  points: number;
  sticker: { color: string; amount: number } | null;
  message: string;
}

export default function RewardToast({
  reward,
  onClose,
}: {
  reward: RewardToastData | null;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reward) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 200); // let the fade-out finish before unmount
    }, 2600);
    return () => clearTimeout(t);
  }, [reward, onClose]);

  if (!reward) return null;

  return (
    <div
      className={`fixed inset-x-0 top-6 z-50 flex justify-center px-4 transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <div className="rounded-card bg-white shadow-lg border border-us/10 px-5 py-4 text-center space-y-1 animate-bounce-once">
        <div className="flex items-center justify-center gap-2 text-us font-bold">
          <PartyPopper size={20} />
          {reward.message}
        </div>
        {(reward.points > 0 || reward.sticker) && (
          <div className="flex items-center justify-center gap-4 text-sm font-semibold text-gray-600">
            {reward.points > 0 && (
              <span className="flex items-center gap-1">
                <Sparkles size={16} className="text-sticker-yellow" /> +{reward.points} Growth Points
              </span>
            )}
            {reward.sticker && (
              <span>
                {STICKER_EMOJI[reward.sticker.color] ?? "⭐"} +{reward.sticker.amount} Sticker
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
