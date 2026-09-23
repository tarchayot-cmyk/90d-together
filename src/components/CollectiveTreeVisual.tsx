import { TreeSVG, PartLevelGrid } from "@/components/TreeParts";

// Collective / team tree: same 6-part structure as the personal
// tree, but leveled by TEAM-WIDE sticker totals (every member's
// stickers summed together) against its own, separately-adjustable
// thresholds — a team naturally accumulates far more than one person.
export default function CollectiveTreeVisual({
  stickerCounts,
  thresholds,
  treeImages = {},
}: {
  stickerCounts: Record<string, number>;
  thresholds: number[];
  treeImages?: Record<string, string>;
}) {
  return (
    <div className="rounded-card bg-us/5 border border-us/15 p-5 space-y-4">
      <p className="text-sm font-semibold text-us">🌳 ต้นไม้รวมทีม</p>
      <TreeSVG stickerCounts={stickerCounts} thresholds={thresholds} treeImages={treeImages} imageKeyPrefix="collective_part_" size={260} />
      <PartLevelGrid stickerCounts={stickerCounts} thresholds={thresholds} />
      <p className="text-xs text-gray-400 text-center">
        แต่ละส่วนของต้นไม้รวมทีมเติบโตตามสติ๊กเกอร์รวมของทุกคนในด้านนั้นๆ
      </p>
    </div>
  );
}
