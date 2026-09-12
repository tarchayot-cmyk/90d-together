"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import MissionFormModal from "@/components/MissionFormModal";
import { LEVELS } from "@/lib/missionOptions";
import type { Mission } from "@/lib/types";

export default function AdminMissionsPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Mission | null | "new">(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .single();

    if (!campaign) {
      setLoading(false);
      return;
    }
    setCampaignId(campaign.id);

    const { data } = await supabase
      .from("missions")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("level")
      .order("created_at");
    setMissions(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(mission: Mission) {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_upsert_mission", {
      p_mission_id: mission.id,
      p_campaign_id: mission.campaign_id,
      p_level: mission.level,
      p_category: mission.category,
      p_name: mission.name,
      p_description: mission.description,
      p_target_value: mission.target_value,
      p_unit: mission.unit,
      p_points: mission.points,
      p_sticker_color: mission.sticker_color,
      p_sticker_amount: mission.sticker_amount,
      p_requires_proof: mission.requires_proof,
      p_is_active: !mission.is_active,
    });
    if (error) {
      setBanner("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    load();
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;

  if (!campaignId) {
    return <p className="text-sm text-gray-400 text-center py-10">ยังไม่มี Campaign ที่ Active — ไปสร้างที่แท็บ Campaign ก่อน</p>;
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setEditing("new")}
        className="w-full rounded-card bg-us/10 border border-us/30 text-us p-3 flex items-center justify-center gap-2 text-sm font-semibold min-h-[44px]"
      >
        <Plus size={16} />
        เพิ่มภารกิจใหม่
      </button>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      {LEVELS.map((lvl) => {
        const group = missions.filter((m) => m.level === lvl.value);
        if (group.length === 0) return null;
        return (
          <div key={lvl.value} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">{lvl.label}</h2>
            {group.map((m) => (
              <div key={m.id} className="rounded-card bg-white shadow-soft p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400">
                    เป้าหมาย {m.target_value.toLocaleString()} {m.unit} · ⭐ {m.points}
                    {m.requires_proof && " · ต้องแนบหลักฐาน"}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(m)}
                  className={clsx(
                    "text-xs font-semibold rounded-full px-2.5 py-1",
                    m.is_active ? "bg-us/10 text-us" : "bg-gray-100 text-gray-400"
                  )}
                >
                  {m.is_active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditing(m)}
                  className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-full px-3 py-1.5 min-h-[32px]"
                >
                  แก้ไข
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {missions.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีภารกิจ</p>}

      {editing && (
        <MissionFormModal
          campaignId={campaignId}
          mission={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setBanner(editing === "new" ? "สร้างภารกิจใหม่เรียบร้อย" : "แก้ไขภารกิจเรียบร้อย");
            load();
          }}
        />
      )}
    </div>
  );
}
