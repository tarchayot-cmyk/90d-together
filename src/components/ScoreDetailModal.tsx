"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import BadgeFamilyList, { type BadgeRow } from "@/components/BadgeFamilyList";

interface ScoreDetail {
  id: string;
  created_at: string;
  points: number;
  source: "mission" | "kindness" | "admin_adjust";
  activity: string;
  detail: string | null;
  proof_status: string | null;
  admin_name: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  mission: "🎯 ภารกิจ",
  kindness: "🌈 Kindness",
  admin_adjust: "⚙️ Admin ปรับคะแนน",
};

export default function ScoreDetailModal({
  memberId,
  memberName,
  onClose,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"score" | "badges">("score");
  const [items, setItems] = useState<ScoreDetail[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: scoreData }, { data: badgeData }] = await Promise.all([
        supabase.rpc("get_member_score_details", { p_member_id: memberId }),
        supabase.rpc("get_badge_progress", { p_member_id: memberId }),
      ]);
      setItems(scoreData ?? []);
      setBadges(badgeData ?? []);
      setLoading(false);
    }
    load();
  }, [memberId]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{memberName}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <div className="flex rounded-full bg-bg p-1 w-fit">
          {(["score", "badges"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "rounded-full px-4 py-2 text-xs font-semibold min-h-[36px]",
                tab === t ? "bg-us text-white" : "text-gray-400"
              )}
            >
              {t === "score" ? "ประวัติคะแนน" : "🏅 Badge"}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

        {!loading && tab === "score" && (
          <div className="space-y-2">
            {items.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติคะแนน</p>}
            {items.map((item) => (
              <div key={item.id} className="rounded-xl bg-bg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">{SOURCE_LABEL[item.source] ?? item.source}</span>
                  <span className={item.points >= 0 ? "text-us font-bold text-sm" : "text-red-500 font-bold text-sm"}>
                    {item.points >= 0 ? "+" : ""}
                    {item.points}
                  </span>
                </div>
                <p className="text-sm text-gray-800">{item.activity}</p>
                {item.detail && <p className="text-xs text-gray-500">{item.detail}</p>}
                {item.proof_status && item.proof_status !== "not_required" && (
                  <p className="text-xs text-amber-600">สถานะหลักฐาน: {item.proof_status}</p>
                )}
                {item.admin_name && <p className="text-xs text-gray-400">โดย Admin: {item.admin_name}</p>}
                <p className="text-xs text-gray-300">{new Date(item.created_at).toLocaleString("th-TH")}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "badges" && <BadgeFamilyList badges={badges} />}
      </div>
    </div>
  );
}
