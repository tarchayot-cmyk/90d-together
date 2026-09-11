import type { TreeState } from "@/lib/types";

// Maps overall progress (0-1) to the emoji stages from spec section 22.
// Swap the emoji for an SVG/Lottie animation later without touching callers.
function stageForProgress(p: number) {
  if (p <= 0.2) return "🌱";
  if (p <= 0.4) return "🌱🌿";
  if (p <= 0.6) return "🌿";
  if (p <= 0.8) return "🌳";
  return "🌳🍎";
}

export default function TreeVisual({ tree }: { tree: TreeState }) {
  const levelLabel = tree.level === 1 ? "🌱 ME" : tree.level === 2 ? "🌿 WE" : "🌳 US";

  return (
    <div className="rounded-card bg-white shadow-sm p-5 text-center space-y-3">
      <div className="text-6xl leading-none">{stageForProgress(tree.progress)}</div>
      <div className="font-semibold text-gray-700">{levelLabel}</div>

      <div className="space-y-1.5 text-left">
        {[
          { label: "🌱 ME", value: tree.me, color: "bg-me" },
          { label: "🌿 WE", value: tree.we, color: "bg-we" },
          { label: "🌳 US", value: tree.us, color: "bg-us" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="w-12 text-gray-500">{row.label}</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${row.color}`} style={{ width: `${row.value * 100}%` }} />
            </div>
            <span className="w-9 text-right text-gray-400">{Math.round(row.value * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
