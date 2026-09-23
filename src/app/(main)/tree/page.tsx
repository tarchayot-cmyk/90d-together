"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabaseClient";
import TreeVisual from "@/components/TreeVisual";
import CollectiveTreeVisual from "@/components/CollectiveTreeVisual";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

interface TreePageData {
  totalPoints: number;
  stickerCounts: Record<string, number>;
  collectiveStickerCounts: Record<string, number>;
  treeImages: Record<string, string>;
  personalThresholds: number[];
  collectiveThresholds: number[];
}

async function fetchTreeData(): Promise<TreePageData> {
  const supabase = createClient();

  const [{ data: pointsRows }, { data: stickerRows }, { data: collectiveStickers }, { data: treeImagesData }, { data: settingsData }] =
    await Promise.all([
      supabase.from("points_transactions").select("points"), // RLS scopes this to the caller's own rows
      supabase.from("stickers").select("color, amount"), // same — own rows only
      supabase.rpc("get_campaign_sticker_totals"),
      supabase.rpc("get_tree_images"),
      supabase.rpc("get_tree_settings"),
    ]);

  const stickerCounts: Record<string, number> = {};
  for (const s of stickerRows ?? []) {
    stickerCounts[s.color] = (stickerCounts[s.color] ?? 0) + s.amount;
  }

  return {
    totalPoints: (pointsRows ?? []).reduce((sum: number, p: { points: number }) => sum + p.points, 0),
    stickerCounts,
    collectiveStickerCounts: (collectiveStickers as Record<string, number>) ?? {},
    treeImages: (treeImagesData as Record<string, string>) ?? {},
    personalThresholds: settingsData?.personal_thresholds ?? [3, 7, 15],
    collectiveThresholds: settingsData?.collective_thresholds ?? [50, 150, 400],
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

  const { totalPoints, stickerCounts, collectiveStickerCounts, treeImages, personalThresholds, collectiveThresholds } = data;

  return (
    <div className="space-y-4 pt-2">
      <header>
        <p className="text-sm text-gray-400">การเติบโตของฉัน</p>
        <h1 className="text-xl font-bold text-gray-800">🌳 My Tree</h1>
      </header>

      <TreeVisual stickerCounts={stickerCounts} thresholds={personalThresholds} treeImages={treeImages} />

      <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
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

      <CollectiveTreeVisual stickerCounts={collectiveStickerCounts} thresholds={collectiveThresholds} treeImages={treeImages} />

      <a
        href="/final-tree"
        className="block rounded-card bg-white shadow-soft p-4 text-center text-sm font-semibold text-us border border-us/20"
      >
        🌳 ดูต้นไม้ใหญ่ของทั้งแผนก (Final Tree)
      </a>
    </div>
  );
}
