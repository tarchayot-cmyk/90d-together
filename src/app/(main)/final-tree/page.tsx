"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

interface FinalSummary {
  is_complete: boolean;
  has_campaign: boolean;
  campaign_name?: string;
  current_day?: number;
  days_remaining?: number;
  participants?: number;
  stickers_by_color?: Record<string, number>;
  stickers_total?: number;
  kindness_total?: number;
  badges_total?: number;
  growth_points_total?: number;
}

export default function FinalTreePage() {
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_final_tree_summary");
      setSummary(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;
  }

  if (!summary?.has_campaign) {
    return <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีแคมเปญ</p>;
  }

  if (!summary.is_complete) {
    return (
      <div className="pt-2 space-y-4 text-center">
        <div className="text-6xl">🌳</div>
        <h1 className="text-lg font-bold text-gray-800">ต้นไม้ใหญ่ยังเติบโตอยู่</h1>
        <p className="text-sm text-gray-500">
          วันนี้คือวันที่ {summary.current_day} ของ 90 วัน — อีก {summary.days_remaining} วัน
          ต้นไม้ของทั้งแผนกจะผลิดอกออกผล 🍎
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2 pb-6 space-y-5 text-center">
      <p className="text-sm text-gray-400">{summary.campaign_name}</p>

      {/* Big combined tree — every person's stickers, kindness, and
          badges feed the same tree. Spec section 23 ASCII art,
          rendered as an emoji block so it needs no image assets. */}
      <div className="rounded-card bg-white shadow-soft py-6 px-2">
        <pre className="font-sans leading-[1.35] text-2xl sm:text-3xl whitespace-pre-wrap">
{`      🍎 🌈 🍎
 🌿 🌿 🌿 🌿 🌿 🌿
🌿 🌳 🌳 🌳 🌳 🌳 🌿
     ┃ ┃ ┃ ┃ ┃`}
        </pre>

        <div className="mt-4 space-y-1">
          <p className="font-bold text-us tracking-wide">ME → WE → US</p>
          <p className="text-sm text-gray-500">90 Days of Growing Together</p>
          <p className="text-sm text-gray-500">🌱 เริ่มจากฉัน 🌿 เติบโตไปกับเพื่อน 🌳 แข็งแรงไปด้วยกัน</p>
        </div>
      </div>

      {/* Impact totals only — deliberately no individual or team
          ranking here, per spec section 23's "รวมทั้งแผนก" framing. */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">พลังรวมของทั้งแผนก</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard emoji="👥" label="ผู้เข้าร่วม" value={summary.participants ?? 0} />
          <StatCard emoji="⭐" label="Growth Points รวม" value={summary.growth_points_total ?? 0} />
          <StatCard emoji="🌈" label="Kindness ที่ส่งหากัน" value={summary.kindness_total ?? 0} />
          <StatCard emoji="🏅" label="Badge ที่ปลดล็อกรวม" value={summary.badges_total ?? 0} />
        </div>
      </div>

      {!!summary.stickers_by_color && Object.keys(summary.stickers_by_color).length > 0 && (
        <div className="rounded-card bg-white shadow-soft p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            สติ๊กเกอร์รวมทั้งหมด · {(summary.stickers_total ?? 0).toLocaleString()}
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(summary.stickers_by_color).map(([color, count]) => (
              <div key={color} className="rounded-xl bg-bg py-2">
                <div className="text-xl">{STICKER_EMOJI[color] ?? "⭐"}</div>
                <div className="text-xs font-semibold text-gray-600">×{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 pt-2">
        ขอบคุณทุกคนที่ร่วมเดินทาง 90 วันนี้ไปด้วยกัน 💚
      </p>
    </div>
  );
}

function StatCard({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div className="rounded-card bg-white shadow-soft p-4">
      <div className="text-2xl">{emoji}</div>
      <div className="text-lg font-bold text-gray-800">{value.toLocaleString()}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
