"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import CollectiveTreeVisual from "@/components/CollectiveTreeVisual";
import type { Thresholds } from "@/components/TreeParts";

const STICKER_EMOJI: Record<string, string> = {
  green: "🟢",
  pink: "💗",
  yellow: "🟡",
  red: "🔴",
  purple: "🟣",
  orange: "🟠",
  rainbow: "🌈",
};

interface Milestone {
  phase: "me" | "we" | "us";
  available: boolean;
  reveal_date?: string;
  stickers_by_color?: Record<string, number>;
  stickers_total?: number;
  kindness_total?: number;
  badges_total?: number;
  growth_points_total?: number;
}

interface FinalSummary {
  has_campaign: boolean;
  campaign_name?: string;
  current_day?: number;
  participants?: number;
  milestones?: Milestone[];
}

const PHASE_META: Record<string, { label: string; title: string; blurb: string }> = {
  me: { label: "ME", title: "ต้นไม้หลังจบช่วง ME 🌱", blurb: "เริ่มจากฉัน — นี่คือต้นไม้ของทั้งแผนกเมื่อจบช่วง ME" },
  we: { label: "WE", title: "ต้นไม้หลังจบช่วง WE 🌿", blurb: "เติบโตไปกับเพื่อน — นี่คือต้นไม้ของทั้งแผนกเมื่อจบช่วง WE" },
  us: { label: "US", title: "ต้นไม้ใหญ่เมื่อจบโครงการ 🌳", blurb: "แข็งแรงไปด้วยกัน — ต้นไม้ของทั้งแผนกเมื่อจบ 90 วัน" },
};

function thaiDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function FinalTreePage() {
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [collectiveThresholds, setCollectiveThresholds] = useState<Thresholds>([50, 150, 400]);
  const [treeImages, setTreeImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: summaryData }, { data: settingsData }, { data: treeImagesData }] = await Promise.all([
        supabase.rpc("get_final_tree_milestones"),
        supabase.rpc("get_tree_settings"),
        supabase.rpc("get_tree_images"),
      ]);
      setSummary(summaryData);
      const ct = settingsData?.collective_thresholds_by_color ?? settingsData?.collective_thresholds;
      if (ct) setCollectiveThresholds(ct);
      setTreeImages((treeImagesData as Record<string, string>) ?? {});
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

  const milestones = summary.milestones ?? [];
  const availableList = milestones.filter((m) => m.available);

  if (availableList.length === 0) {
    const next = milestones[0];
    return (
      <div className="pt-2 space-y-4 text-center">
        <div className="text-6xl">🌳</div>
        <h1 className="text-lg font-bold text-gray-800">ต้นไม้ใหญ่ยังเติบโตอยู่</h1>
        <p className="text-sm text-gray-500">
          วันนี้คือวันที่ {summary.current_day} ของ 90 วัน — ต้นไม้ของทั้งแผนกจะเผยโฉมครั้งแรกเมื่อจบช่วง ME
          {next?.reveal_date ? ` (${thaiDate(next.reveal_date)})` : ""} 🍎
        </p>
      </div>
    );
  }

  const activePhase = tab ?? availableList[availableList.length - 1].phase;
  const current = milestones.find((m) => m.phase === activePhase && m.available) ?? availableList[availableList.length - 1];
  const meta = PHASE_META[current.phase];

  return (
    <div className="pt-2 pb-6 space-y-5 text-center">
      <p className="text-sm text-gray-400">{summary.campaign_name}</p>

      <div className="flex gap-2 justify-center">
        {milestones.map((m) => (
          <button
            key={m.phase}
            disabled={!m.available}
            onClick={() => setTab(m.phase)}
            className={
              "px-4 py-1.5 rounded-full text-sm font-semibold border " +
              (m.phase === current.phase
                ? "bg-us text-white border-us"
                : m.available
                ? "bg-white text-gray-600 border-gray-200"
                : "bg-gray-50 text-gray-300 border-gray-100")
            }
          >
            {PHASE_META[m.phase].label}
            {!m.available && m.reveal_date ? ` · ${thaiDate(m.reveal_date)}` : ""}
          </button>
        ))}
      </div>

      <div>
        <h1 className="text-lg font-bold text-gray-800">{meta.title}</h1>
        <p className="text-xs text-gray-400 mt-1">{meta.blurb}</p>
      </div>

      {/* Same collective tree as /tree — this is its snapshot at the end of the phase. */}
      <CollectiveTreeVisual
        stickerCounts={current.stickers_by_color ?? {}}
        thresholds={collectiveThresholds}
        treeImages={treeImages}
      />

      <div className="rounded-card bg-white shadow-soft py-4 px-2">
        <div className="space-y-1">
          <p className="font-bold text-us tracking-wide">ME → WE → US</p>
          <p className="text-sm text-gray-500">90 Days of Growing Together</p>
          <p className="text-sm text-gray-500">🌱 เริ่มจากฉัน 🌿 เติบโตไปกับเพื่อน 🌳 แข็งแรงไปด้วยกัน</p>
        </div>
      </div>

      {/* Impact totals only — deliberately no individual or team ranking here. */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">พลังรวมของทั้งแผนก (สะสมถึงจบช่วง {meta.label})</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard emoji="👥" label="ผู้เข้าร่วม" value={summary.participants ?? 0} />
          <StatCard emoji="⭐" label="Growth Points รวม" value={current.growth_points_total ?? 0} />
          <StatCard emoji="🌈" label="Kindness ที่ส่งหากัน" value={current.kindness_total ?? 0} />
          <StatCard emoji="🏅" label="Badge ที่ปลดล็อกรวม" value={current.badges_total ?? 0} />
        </div>
      </div>

      {!!current.stickers_by_color && Object.keys(current.stickers_by_color).length > 0 && (
        <div className="rounded-card bg-white shadow-soft p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            สติ๊กเกอร์รวมทั้งหมด · {(current.stickers_total ?? 0).toLocaleString()}
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(current.stickers_by_color).map(([color, count]) => (
              <div key={color} className="rounded-xl bg-bg py-2">
                <div className="text-xl">{STICKER_EMOJI[color] ?? "⭐"}</div>
                <div className="text-xs font-semibold text-gray-600">×{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {current.phase === "us" && (
        <p className="text-xs text-gray-400 pt-2">ขอบคุณทุกคนที่ร่วมเดินทาง 90 วันนี้ไปด้วยกัน 💚</p>
      )}
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
