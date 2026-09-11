"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";
import MissionCard from "@/components/MissionCard";
import CheckInModal from "@/components/CheckInModal";
import RewardToast, { type RewardToastData } from "@/components/RewardToast";
import type { Mission, CheckIn } from "@/lib/types";

function currentCampaignWeek(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

export default function MissionsPage() {
  const { member } = useMember(); // shared across pages — no extra fetch here
  const [missions, setMissions] = useState<Mission[]>([]);
  const [checkInsByMission, setCheckInsByMission] = useState<Record<string, CheckIn>>({});
  const [loading, setLoading] = useState(true);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, start_date")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .single();

    if (!campaign) {
      setLoading(false);
      return;
    }

    const week = currentCampaignWeek(campaign.start_date);

    const { data: missionRows } = await supabase
      .from("missions")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("level", "me")
      .eq("is_active", true);

    let myCheckIns: CheckIn[] = [];
    if (member?.id && missionRows?.length) {
      const { data: checkins } = await supabase
        .from("check_ins")
        .select("*")
        .eq("member_id", member.id)
        .eq("campaign_week", week)
        .in("mission_id", missionRows.map((m) => m.id));
      myCheckIns = checkins ?? [];
    }

    setMissions(missionRows ?? []);
    setCheckInsByMission(Object.fromEntries(myCheckIns.map((c) => [c.mission_id, c])));
    setLoading(false);
  }, [member?.id]);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  function handleSuccess(result: { points: number; sticker: { color: string; amount: number } | null; message: string }) {
    setReward({ points: result.points, sticker: result.sticker, message: result.message });
    loadMissions(); // refresh so the completed card flips to "done"
  }

  return (
    <div className="space-y-4">
      <header className="pt-2 pb-1">
        <p className="text-sm text-gray-400">🌱 Level 1 · ME</p>
        <h1 className="text-xl font-bold text-gray-800">ภารกิจสัปดาห์นี้</h1>
      </header>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && missions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีภารกิจที่เปิดใช้งานในตอนนี้</p>
      )}

      <div className="space-y-3">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            checkIn={checkInsByMission[mission.id] ?? null}
            onCheckIn={setActiveMission}
          />
        ))}
      </div>

      {activeMission && (
        <CheckInModal
          mission={activeMission}
          onClose={() => setActiveMission(null)}
          onSuccess={handleSuccess}
        />
      )}

      <RewardToast reward={reward} onClose={() => setReward(null)} />
    </div>
  );
}
