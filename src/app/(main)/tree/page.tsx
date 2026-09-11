"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabaseClient";
import TreeVisual from "@/components/TreeVisual";
import type { TreeState } from "@/lib/types";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "🩷",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

interface TreePageData {
  tree: TreeState;
  totalPoints: number;
  stickerCounts: Record<string, number>;
}

async function fetchTreeData(): Promise<TreePageData> {
  const supabase = createClient();

  const [{ data: treeData }, { data: pointsRows }, { data: stickerRows }] = await Promise.all([
    supabase.rpc("get_tree_progress"),
    supabase.from("points_transactions").select("points"), // RLS scopes this to the caller's own rows
    supabase.from("stickers").select("color, amount"), // same — own rows only
  ]);

  const stickerCounts: Record<string, number> = {};
  for (const s of stickerRows ?? []) {
    stickerCounts[s.color] = (stickerCounts[s.color] ?? 0) + s.amount;
  }

  return {
    tree: treeData ?? { level: 1, progress: 0, me: 0, we: 0, us: 0 },
    totalPoints: (pointsRows ?? []).reduce((sum: number, p: { points: number }) => sum + p.points, 0),
    stickerCounts,
  };
}

export default function TreePage() {
  const { data, isLoading: loading } = useSWR("tree-data", fetchTreeData, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  if (loading || !data) {
    return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;
  }

  const { tree, totalPoints, stickerCounts } = data;

  return (
    <div className="space-y-4 pt-2">
      <header>
        <p className="text-sm text-gray-400">การเติบโตของฉัน</p>
        <h1 className="text-xl font-bold text-gray-800">🌳 My Tree</h1>
      </header>

      <TreeVisual tree={tree} />

      <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">⭐ Growth Points สะสม</span>
          <span className="text-lg font-bold text-us">{totalPoints.toLocaleString()}</span>
        </div>

        <div className="border-t border-gray-50 pt-3">
          <p className="text-xs text-gray-400 mb-2">สติ๊กเกอร์ทั้งหมด</p>
          {Object.keys(stickerCounts).length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีสติ๊กเกอร์ — เริ่มเช็คอินภารกิจแรกกันเลย!</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(stickerCounts).map(([color, amount]) => (
                <div key={color} className="rounded-xl bg-bg py-2 text-center">
                  <div className="text-xl">{STICKER_EMOJI[color] ?? "⭐"}</div>
                  <div className="text-xs font-semibold text-gray-600">×{amount}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <a
        href="/final-tree"
        className="block rounded-card bg-white shadow-sm p-4 text-center text-sm font-semibold text-us border border-us/20"
      >
        🌳 ดูต้นไม้ใหญ่ของทั้งแผนก (Final Tree)
      </a>
    </div>
  );
}
