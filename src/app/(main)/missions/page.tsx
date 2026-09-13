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

const PHASE_LABEL: Record<string, string> = {
  me: "🌱 ME",
  we: "🌿 WE",
  us: "🌳 US",
};

export default function MissionsPage() {
  const { member } = useMember(); // shared across pages — no extra fetch here
  const [missionsByLevel, setMissionsByLevel] = useState<Record<string, Mission[]>>({});
  const [checkInsByMission, setCheckInsByMission] = useState<Record<string, CheckIn[]>>({});
  const [unlockedLevels, setUnlockedLevels] = useState<string[]>([]);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // ME is unlocked the whole 90 days; WE/US only unlock in their
    // own month — a member can see more than one level's missions
    // at once now (e.g. ME + US during month 3).
    const { data: phaseInfo } = await supabase.rpc("get_campaign_phase_info");

    if (!phaseInfo?.has_campaign) {
      setUnlockedLevels([]);
      setCurrentDay(null);
      setMissionsByLevel({});
      setLoading(false);
      return;
    }

    setCurrentDay(phaseInfo.current_day);
    const levels: string[] = phaseInfo.unlocked_levels ?? [];
    setUnlockedLevels(levels);

    if (levels.length === 0) {
      setMissionsByLevel({});
      setLoading(false);
      return;
    }

    const week = currentCampaignWeek(phaseInfo.start_date);

    const { data: missionRows } = await supabase
      .from("missions")
      .select("*")
      .eq("campaign_id", phaseInfo.campaign_id)
      .in("level", levels)
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

    const grouped: Record<string, Mission[]> = {};
    for (const m of missionRows ?? []) {
      if (!grouped[m.level]) grouped[m.level] = [];
      grouped[m.level].push(m);
    }

    setMissionsByLevel(grouped);
    const groupedCheckIns: Record<string, CheckIn[]> = {};
    for (const c of myCheckIns) {
      if (!groupedCheckIns[c.mission_id]) groupedCheckIns[c.mission_id] = [];
      groupedCheckIns[c.mission_id].push(c);
    }
    setCheckInsByMission(groupedCheckIns);
    setLoading(false);
  }, [member?.id]);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  function handleSuccess(result: { points: number; sticker: { color: string; amount: number } | null; message: string }) {
    setReward({ points: result.points, sticker: result.sticker, message: result.message });
    loadMissions(); // refresh so the completed card flips to "done"
  }

  const levelOrder = ["me", "we", "us"].filter((lvl) => unlockedLevels.includes(lvl));

  return (
    <div className="space-y-4">
      <header className="pt-2 pb-1">
        <p className="text-sm text-gray-400">
          {levelOrder.map((l) => PHASE_LABEL[l]).join(" + ") || "—"}
          {currentDay !== null && ` · วันที่ ${currentDay}`}
        </p>
        <h1 className="text-xl font-bold text-gray-800">ภารกิจสัปดาห์นี้</h1>
      </header>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && unlockedLevels.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">
          {currentDay === null ? "ยังไม่มีแคมเปญที่เปิดใช้งาน" : "แคมเปญนี้ยังไม่เริ่มหรือสิ้นสุดแล้ว"}
        </p>
      )}

      {levelOrder.map((level) => {
        const missions = missionsByLevel[level] ?? [];
        if (missions.length === 0) return null;
        return (
          <section key={level} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">{PHASE_LABEL[level]}</h2>
            <div className="space-y-3">
              {missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  checkIns={checkInsByMission[mission.id] ?? []}
                  onCheckIn={setActiveMission}
                />
              ))}
            </div>
          </section>
        );
      })}

      {!loading && unlockedLevels.length > 0 && levelOrder.every((l) => (missionsByLevel[l] ?? []).length === 0) && (
        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีภารกิจที่เปิดใช้งานในระยะนี้</p>
      )}

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
