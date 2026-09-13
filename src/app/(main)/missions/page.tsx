"use client";

import { useEffect, useState, useCallback } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";
import MissionCard from "@/components/MissionCard";
import CheckInModal from "@/components/CheckInModal";
import InviteModal from "@/components/InviteModal";
import RewardToast, { type RewardToastData } from "@/components/RewardToast";
import PhaseHero from "@/components/PhaseHero";
import type { Mission, CheckIn } from "@/lib/types";

function currentCampaignWeek(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

const TAB_META: Record<string, { emoji: string; label: string }> = {
  me: { emoji: "🌱", label: "ME" },
  we: { emoji: "🤝", label: "WE" },
  us: { emoji: "🌳", label: "US" },
};

interface PhaseInfo {
  has_campaign: boolean;
  campaign_id: string;
  current_day: number;
  primary_phase: string | null;
  unlocked_levels: string[];
  visible_levels: string[];
  start_date: string;
  end_date: string;
}

export default function MissionsPage() {
  const { member } = useMember();
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [tab, setTab] = useState<string>("me");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [checkInsByMission, setCheckInsByMission] = useState<Record<string, CheckIn[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [invitingMission, setInvitingMission] = useState<Mission | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const loadMissionsForTab = useCallback(
    async (currentPhaseInfo: PhaseInfo, selectedTab: string) => {
      const supabase = createClient();

      if (!currentPhaseInfo.visible_levels.includes(selectedTab)) {
        setMissions([]);
        setCheckInsByMission({});
        return;
      }

      const { data: missionRows } = await supabase
        .from("missions")
        .select("*")
        .eq("campaign_id", currentPhaseInfo.campaign_id)
        .eq("level", selectedTab)
        .eq("is_active", true);

      let myCheckIns: CheckIn[] = [];
      if (member?.id && missionRows?.length) {
        const week = currentCampaignWeek(currentPhaseInfo.start_date);
        const { data: checkins } = await supabase
          .from("check_ins")
          .select("*")
          .eq("member_id", member.id)
          .eq("campaign_week", week)
          .in("mission_id", missionRows.map((m) => m.id));
        myCheckIns = checkins ?? [];
      }

      const grouped: Record<string, CheckIn[]> = {};
      for (const c of myCheckIns) {
        if (!grouped[c.mission_id]) grouped[c.mission_id] = [];
        grouped[c.mission_id].push(c);
      }

      setMissions(missionRows ?? []);
      setCheckInsByMission(grouped);
    },
    [member?.id]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: phase } = await supabase.rpc("get_campaign_phase_info");
    if (!phase?.has_campaign) {
      setPhaseInfo(null);
      setLoading(false);
      return;
    }

    setPhaseInfo(phase);
    const initialTab = phase.primary_phase ?? "me";
    setTab(initialTab);
    await loadMissionsForTab(phase, initialTab);

    setLoading(false);
  }, [loadMissionsForTab]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleTabChange(newTab: string) {
    setTab(newTab);
    if (phaseInfo) {
      setLoading(true);
      await loadMissionsForTab(phaseInfo, newTab);
      setLoading(false);
    }
  }

  function handleSuccess(result: { points: number; sticker: { color: string; amount: number } | null; message: string }) {
    setReward({ points: result.points, sticker: result.sticker, message: result.message });
    if (phaseInfo) loadMissionsForTab(phaseInfo, tab);
  }

  const isUnlocked = phaseInfo?.unlocked_levels.includes(tab) ?? false;
  const isVisible = phaseInfo?.visible_levels.includes(tab) ?? false;
  const featuredMission = missions.find((m) => {
    const c = checkInsByMission[m.id] ?? [];
    return c.filter((x) => x.proof_status !== "rejected").length < m.max_per_week;
  });

  return (
    <div className="space-y-4 pt-2">
      <header>
        <div className="flex items-center gap-1.5 text-us font-bold text-lg">🌱 ภารกิจ</div>
        <p className="text-xs text-gray-400">ทำภารกิจ สะสมความสำเร็จ และรับ Badge ไปด้วยกัน</p>
      </header>

      {loading && !phaseInfo && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && !phaseInfo && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีแคมเปญที่เปิดใช้งาน</p>}

      {phaseInfo && (
        <>
          <PhaseHero
            primaryPhase={phaseInfo.primary_phase}
            currentDay={phaseInfo.current_day}
            startDate={phaseInfo.start_date}
            endDate={phaseInfo.end_date}
          />

          <div className="grid grid-cols-3 gap-2">
            {(["me", "we", "us"] as const).map((t) => {
              const meta = TAB_META[t];
              const active = tab === t;
              const disabled = !phaseInfo.visible_levels.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => !disabled && handleTabChange(t)}
                  disabled={disabled}
                  className={clsx(
                    "rounded-full py-2.5 text-sm font-semibold min-h-[44px] flex items-center justify-center gap-1.5",
                    active ? "bg-us text-white" : disabled ? "bg-gray-50 text-gray-300" : "bg-white text-gray-500 shadow-soft"
                  )}
                >
                  <span>{meta.emoji}</span> {meta.label}
                </button>
              );
            })}
          </div>

          {!isVisible && (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่ถึงช่วงนี้ — จะเปิดเมื่อถึงเวลา</p>
          )}

          {isVisible && !isUnlocked && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-center">
              พ้นช่วงเช็คอินของระดับนี้แล้ว — ดูได้แต่เช็คอินเพิ่มไม่ได้
            </p>
          )}

          {isVisible && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500">🎯 ภารกิจหลัก ({TAB_META[tab].label})</h2>
              </div>

              {!loading && missions.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีภารกิจที่เปิดใช้งานในระดับนี้</p>
              )}

              <div className="space-y-2">
                {missions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    checkIns={checkInsByMission[mission.id] ?? []}
                    onCheckIn={(m) => isUnlocked && setActiveMission(m)}
                    onInvite={isUnlocked ? setInvitingMission : undefined}
                  />
                ))}
              </div>

              {featuredMission && isUnlocked && (
                <div className="space-y-2 pt-2">
                  <h2 className="text-sm font-semibold text-gray-500">☀️ ภารกิจวันนี้</h2>
                  <MissionCard
                    mission={featuredMission}
                    checkIns={checkInsByMission[featuredMission.id] ?? []}
                    onCheckIn={setActiveMission}
                    compact
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeMission && (
        <CheckInModal mission={activeMission} onClose={() => setActiveMission(null)} onSuccess={handleSuccess} />
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
