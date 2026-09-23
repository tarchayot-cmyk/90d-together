// Shared rendering logic for BOTH trees — personal (member's own
// stickers) and collective (team-wide sticker totals) — since they're
// structurally identical: 6 parts, each independently leveled by a
// sticker-color count, with admin-adjustable thresholds.
//   🟡 yellow  (move / กาย)    -> กิ่งก้าน (branches)
//   🔴 red     (fuel / กิน)    -> ผล (fruits)
//   💗 pink    (rest / พัก)    -> ราก (roots)
//   🟣 purple  (mind / ใจ)     -> ดอก (flowers)
//   🟠 orange  (connect/สังคม) -> ใบ (leaves)
//   🌈 rainbow (kindness)      -> ลำต้น (trunk)
//
// Admin can upload ONE full illustration per (part, level) via
// /admin/tree-images (keyed "<prefix><color>_<level>") — e.g. a
// painted "leaves at level 3" picture that already shows a full,
// dense canopy. That single image is layered over its designated
// region of the canvas; no custom image for a slot falls back to the
// built-in hand-drawn shapes for that part instead.

export interface PartConfig {
  color: string;
  partLabel: string;
  themeLabel: string;
  emoji: string;
}

export const PARTS: PartConfig[] = [
  { color: "rainbow", partLabel: "ลำต้น", themeLabel: "Kindness", emoji: "🌈" },
  { color: "pink", partLabel: "ราก", themeLabel: "พัก", emoji: "💗" },
  { color: "yellow", partLabel: "กิ่งก้าน", themeLabel: "กาย", emoji: "🟡" },
  { color: "orange", partLabel: "ใบ", themeLabel: "สังคม", emoji: "🟠" },
  { color: "purple", partLabel: "ดอก", themeLabel: "ใจ", emoji: "🟣" },
  { color: "red", partLabel: "ผล", themeLabel: "กิน", emoji: "🔴" },
];

// thresholds = [t1, t2, t3] -> level 0 if count<t1, 1 if <t2, 2 if <t3, else 3
export function levelForCount(count: number, thresholds: number[]): 0 | 1 | 2 | 3 {
  const [t1, t2, t3] = thresholds;
  if (count >= t3) return 3;
  if (count >= t2) return 2;
  if (count >= t1) return 1;
  return 0;
}

function customImageUrl(treeImages: Record<string, string>, imageKeyPrefix: string, color: string, level: number) {
  return treeImages[`${imageKeyPrefix}${color}_${level}`];
}

// Fallback (no custom image) shapes — small repeated icons/lines,
// revealed progressively by level via slice(0, n).
export const BRANCH_LINES = [
  { x1: 150, y1: 190, x2: 108, y2: 150 },
  { x1: 150, y1: 190, x2: 192, y2: 150 },
  { x1: 150, y1: 160, x2: 120, y2: 110 },
  { x1: 150, y1: 160, x2: 180, y2: 110 },
  { x1: 150, y1: 130, x2: 135, y2: 90 },
  { x1: 150, y1: 130, x2: 165, y2: 90 },
];
export const ROOT_LINES = [
  { x1: 150, y1: 250, x2: 120, y2: 272 },
  { x1: 150, y1: 250, x2: 180, y2: 272 },
  { x1: 150, y1: 250, x2: 100, y2: 255 },
  { x1: 150, y1: 250, x2: 200, y2: 255 },
];
export const LEAF_SPOTS = [
  { cx: 108, cy: 148, r: 18 }, { cx: 192, cy: 148, r: 18 },
  { cx: 120, cy: 108, r: 16 }, { cx: 180, cy: 108, r: 16 },
  { cx: 135, cy: 86, r: 15 }, { cx: 165, cy: 86, r: 15 },
  { cx: 150, cy: 70, r: 17 }, { cx: 150, cy: 120, r: 20 },
  { cx: 95, cy: 130, r: 14 }, { cx: 205, cy: 130, r: 14 },
];
export const FLOWER_SPOTS = [
  { cx: 112, cy: 140 }, { cx: 188, cy: 140 }, { cx: 128, cy: 100 },
  { cx: 172, cy: 100 }, { cx: 150, cy: 75 }, { cx: 140, cy: 115 }, { cx: 160, cy: 115 },
];
export const FRUIT_SPOTS = [
  { cx: 118, cy: 155 }, { cx: 182, cy: 155 }, { cx: 133, cy: 115 },
  { cx: 167, cy: 115 }, { cx: 150, cy: 90 }, { cx: 150, cy: 135 }, { cx: 105, cy: 138 },
];

// Regions used when a custom (painted) image IS provided — each part
// gets ONE image covering its natural area, layered bottom-to-top:
// roots -> trunk -> branches -> leaves -> fruits -> flowers.
// Each canopy part gets its OWN quadrant — sharing one region made
// later-drawn parts completely hide earlier ones when several had
// custom images at once (confirmed bug, fixed here).
const LEAF_REGION = { x: 55, y: 45, width: 100, height: 95 };      // top-left
const BRANCH_REGION = { x: 150, y: 45, width: 100, height: 95 };   // top-right
const FLOWER_REGION = { x: 55, y: 130, width: 100, height: 90 };   // bottom-left
const FRUIT_REGION = { x: 150, y: 130, width: 100, height: 90 };   // bottom-right
const ROOT_REGION = { x: 55, y: 235, width: 190, height: 45 };

export function Flower({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx={cx + 4 * Math.cos((deg * Math.PI) / 180)}
          cy={cy + 4 * Math.sin((deg * Math.PI) / 180)}
          rx="3.2"
          ry="2"
          fill="#C77DD1"
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r="2" fill="#FFD54F" />
    </g>
  );
}

export function TreeSVG({
  stickerCounts,
  thresholds,
  treeImages,
  imageKeyPrefix,
  size = 260,
}: {
  stickerCounts: Record<string, number>;
  thresholds: number[];
  treeImages: Record<string, string>;
  imageKeyPrefix: string;
  size?: number;
}) {
  const trunkLevel = levelForCount(stickerCounts.rainbow ?? 0, thresholds);
  const rootLevel = levelForCount(stickerCounts.pink ?? 0, thresholds);
  const branchLevel = levelForCount(stickerCounts.yellow ?? 0, thresholds);
  const leafLevel = levelForCount(stickerCounts.orange ?? 0, thresholds);
  const flowerLevel = levelForCount(stickerCounts.purple ?? 0, thresholds);
  const fruitLevel = levelForCount(stickerCounts.red ?? 0, thresholds);

  const trunkHeight = 30 + trunkLevel * 20; // 30 - 90
  const trunkTopY = 250 - trunkHeight;
  const trunkWidth = 10 + trunkLevel * 4;

  const trunkImage = customImageUrl(treeImages, imageKeyPrefix, "rainbow", trunkLevel);
  const rootImage = customImageUrl(treeImages, imageKeyPrefix, "pink", rootLevel);
  const branchImage = customImageUrl(treeImages, imageKeyPrefix, "yellow", branchLevel);
  const leafImage = customImageUrl(treeImages, imageKeyPrefix, "orange", leafLevel);
  const flowerImage = customImageUrl(treeImages, imageKeyPrefix, "purple", flowerLevel);
  const fruitImage = customImageUrl(treeImages, imageKeyPrefix, "red", fruitLevel);

  const branchCount = [0, 2, 4, 6][branchLevel];
  const rootCount = [0, 2, 3, 4][rootLevel];
  const leafCount = [0, 3, 6, 10][leafLevel];
  const flowerCount = [0, 2, 4, 7][flowerLevel];
  const fruitCount = [0, 2, 4, 7][fruitLevel];

  return (
    <svg viewBox="0 0 300 300" style={{ maxWidth: size }} className="w-full mx-auto" aria-label="ต้นไม้">
      <ellipse cx="150" cy="262" rx="90" ry="10" fill="#E8F5E9" />

      {/* roots (pink / พัก) */}
      {rootImage ? (
        rootCount > 0 && <image href={rootImage} x={ROOT_REGION.x} y={ROOT_REGION.y} width={ROOT_REGION.width} height={ROOT_REGION.height} preserveAspectRatio="xMidYMid meet" />
      ) : (
        ROOT_LINES.slice(0, rootCount).map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#C48A8A" strokeWidth="4" strokeLinecap="round" />
        ))
      )}

      {/* branches (yellow / กาย) */}
      {branchImage ? (
        branchCount > 0 && <image href={branchImage} x={BRANCH_REGION.x} y={BRANCH_REGION.y} width={BRANCH_REGION.width} height={BRANCH_REGION.height} preserveAspectRatio="xMidYMid meet" />
      ) : (
        BRANCH_LINES.slice(0, branchCount).map((b, i) => (
          <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke="#8D6E4A" strokeWidth="5" strokeLinecap="round" />
        ))
      )}

      {/* leaves (orange / สังคม) — before trunk so trunk overlaps cleanly in fallback mode */}
      {leafImage ? (
        leafCount > 0 && <image href={leafImage} x={LEAF_REGION.x} y={LEAF_REGION.y} width={LEAF_REGION.width} height={LEAF_REGION.height} preserveAspectRatio="xMidYMid meet" />
      ) : (
        LEAF_SPOTS.slice(0, leafCount).map((l, i) => <circle key={i} cx={l.cx} cy={l.cy} r={l.r} fill="#8BC98A" opacity="0.9" />)
      )}

      {/* trunk (rainbow / Kindness) */}
      {trunkImage ? (
        <image href={trunkImage} x={150 - trunkWidth} y={trunkTopY} width={trunkWidth * 2} height={250 - trunkTopY} preserveAspectRatio="xMidYMax meet" />
      ) : (
        <rect x={150 - trunkWidth / 2} y={trunkTopY} width={trunkWidth} height={250 - trunkTopY} rx={trunkWidth / 3} fill="#6B4E3A" />
      )}

      {/* fruits (red / กิน) */}
      {fruitImage ? (
        fruitCount > 0 && <image href={fruitImage} x={FRUIT_REGION.x} y={FRUIT_REGION.y} width={FRUIT_REGION.width} height={FRUIT_REGION.height} preserveAspectRatio="xMidYMid meet" />
      ) : (
        FRUIT_SPOTS.slice(0, fruitCount).map((f, i) => <circle key={i} cx={f.cx} cy={f.cy} r="6" fill="#E5533D" />)
      )}

      {/* flowers (purple / ใจ) */}
      {flowerImage ? (
        flowerCount > 0 && <image href={flowerImage} x={FLOWER_REGION.x} y={FLOWER_REGION.y} width={FLOWER_REGION.width} height={FLOWER_REGION.height} preserveAspectRatio="xMidYMid meet" />
      ) : (
        FLOWER_SPOTS.slice(0, flowerCount).map((f, i) => <Flower key={i} cx={f.cx} cy={f.cy} />)
      )}
    </svg>
  );
}

export function PartLevelGrid({ stickerCounts, thresholds }: { stickerCounts: Record<string, number>; thresholds: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PARTS.map((p) => {
        const level = levelForCount(stickerCounts[p.color] ?? 0, thresholds);
        return (
          <div key={p.color} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
            <span className="text-xs text-gray-500">
              {p.emoji} {p.partLabel} <span className="text-gray-300">· {p.themeLabel}</span>
            </span>
            <span className="text-xs font-semibold text-gray-600">
              {"●".repeat(level)}
              {"○".repeat(3 - level)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
