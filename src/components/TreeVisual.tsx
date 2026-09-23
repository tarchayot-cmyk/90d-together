import { TreeSVG, PartLevelGrid } from "@/components/TreeParts";

// Personal tree: 6 parts, each leveled by the member's OWN sticker
// counts, using admin-adjustable thresholds (/admin/tree-images).
export default function TreeVisual({
  stickerCounts,
  thresholds,
  treeImages = {},
}: {
  stickerCounts: Record<string, number>;
  thresholds: number[];
  treeImages?: Record<string, string>;
}) {
  return (
    <div className="rounded-card bg-white shadow-soft p-5 space-y-4">
      <TreeSVG stickerCounts={stickerCounts} thresholds={thresholds} treeImages={treeImages} imageKeyPrefix="part_" size={260} />
      <PartLevelGrid stickerCounts={stickerCounts} thresholds={thresholds} />
      <p className="text-xs text-gray-400 text-center">
        แต่ละส่วนของต้นไม้เติบโตตามสติ๊กเกอร์ที่สะสมในด้านนั้นๆ
      </p>
    </div>
  );
}
