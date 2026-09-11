"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";
import MissionCard from "@/components/MissionCard";
import CheckInModal from "@/components/CheckInModal";
import InviteModal from "@/components/InviteModal";
import RewardToast, { type RewardToastData } from "@/components/RewardToast";
import type { Mission, CheckIn } from "@/lib/types";

function currentCampaignWeek(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

const PHASE_LABEL: Record<string, string> = {
  me: "🌱 Level 1 · ME",
  we: "🌿 Level 2 · WE",
  us: "🌳 Level 3 · US",
};

export default function MissionsPage() {
  const { member } = useMember(); // shared across pages — no extra fetch here
  const [missions, setMissions] = useState<Mission[]>([]);
  const [checkInsByMission, setCheckInsByMission] = useState<Record<string, CheckIn>>({});
  const [phase, setPhase] = useState<string | null>(null);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [invitingMission, setInvitingMission] = useState<Mission | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // Phase is derived server-side from the campaign's start_date —
    // this replaces the old hardcoded .eq("level", "me") filter,
    // which meant WE/US missions never showed up in this page at all
    // even once their phase had actually started.
    const { data: phaseInfo } = await supabase.rpc("get_campaign_phase_info");

    if (!phaseInfo?.has_campaign) {
      setPhase(null);
      setCurrentDay(null);
      setMissions([]);
      setLoading(false);
      return;
    }

    setCurrentDay(phaseInfo.current_day);
    setPhase(phaseInfo.current_phase); // null if before day 1 or after day 90

    if (!phaseInfo.current_phase) {
      setMissions([]);
      setLoading(false);
      return;
    }

    const week = currentCampaignWeek(phaseInfo.start_date);

    const { data: missionRows } = await supabase
      .from("missions")
      .select("*")
      .eq("campaign_id", phaseInfo.campaign_id)
      .eq("level", phaseInfo.current_phase)
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
        <p className="text-sm text-gray-400">
          {phase ? PHASE_LABEL[phase] : "—"}
          {currentDay !== null && ` · วันที่ ${currentDay}`}
        </p>
        <h1 className="text-xl font-bold text-gray-800">ภารกิจสัปดาห์นี้</h1>
      </header>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && !phase && (
        <p className="text-sm text-gray-400 text-center py-10">
          {currentDay === null ? "ยังไม่มีแคมเปญที่เปิดใช้งาน" : "แคมเปญนี้ยังไม่เริ่มหรือสิ้นสุดแล้ว"}
        </p>
      )}

      {!loading && phase && missions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีภารกิจที่เปิดใช้งานในระยะนี้</p>
      )}

      <div className="space-y-3">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            checkIn={checkInsByMission[mission.id] ?? null}
            onCheckIn={setActiveMission}
            onInvite={setInvitingMission}
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

      {invitingMission && (
        <InviteModal
          mission={invitingMission}
          onClose={() => setInvitingMission(null)}
          onSuccess={() => setReward({ points: 0, sticker: null, message: "ส่งคำชวนสำเร็จ! 🤝" })}
        />
      )}

      <RewardToast reward={reward} onClose={() => setReward(null)} />
    </div>
  );
}
