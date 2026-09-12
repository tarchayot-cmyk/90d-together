"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartHandshake, Users, Megaphone, CheckCircle2, ChevronRight, Bell } from "lucide-react";
import { useMember } from "@/hooks/useMember";
import { createClient } from "@/lib/supabaseClient";
import BuddyCard from "@/components/BuddyCard";
import SquadCard from "@/components/SquadCard";
import KindnessModal from "@/components/KindnessModal";
import RewardToast, { type RewardToastData } from "@/components/RewardToast";
import AvatarCircle from "@/components/AvatarCircle";
import PhaseHero from "@/components/PhaseHero";
import { getNotificationCategory } from "@/lib/notificationCategories";
import type { Mission } from "@/lib/types";

interface NotificationPreview {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const QUICK_ACTIONS = [
  { href: "/missions", icon: CheckCircle2, label: "เช็คอิน", sub: "ทำกิจกรรมวันนี้", bg: "bg-pastel-green", fg: "text-us" },
  { href: "#kindness", icon: HeartHandshake, label: "ส่ง Kindness", sub: "มอบกำลังใจให้เพื่อน", bg: "bg-pastel-pink", fg: "text-kindness" },
  { href: "/invitations", icon: Users, label: "เพื่อน & กลุ่ม", sub: "เชื่อมต่อกัน", bg: "bg-pastel-blue", fg: "text-blue-500" },
  { href: "/proposals", icon: Megaphone, label: "กิจกรรม", sub: "ดูและเข้าร่วม", bg: "bg-pastel-orange", fg: "text-orange-500" },
];

export default function HomePage() {
  const { member, loading } = useMember();
  const [kindnessOpen, setKindnessOpen] = useState(false);
  const [toast, setToast] = useState<RewardToastData | null>(null);
  const [phaseInfo, setPhaseInfo] = useState<{ primary_phase: string | null; current_day: number; start_date: string; end_date: string } | null>(null);
  const [notifPreview, setNotifPreview] = useState<NotificationPreview[]>([]);
  const [todayMission, setTodayMission] = useState<Mission | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: phase } = await supabase.rpc("get_campaign_phase_info");
      if (phase?.has_campaign) {
        setPhaseInfo(phase);

        if (phase.unlocked_levels?.length) {
          const { data: missions } = await supabase
            .from("missions")
            .select("*")
            .eq("campaign_id", phase.campaign_id)
            .in("level", phase.unlocked_levels)
            .eq("is_active", true)
            .limit(1);
          setTodayMission(missions?.[0] ?? null);
        }
      }

      const { data: notifs } = await supabase
        .from("notifications")
        .select("id, type, message, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      setNotifPreview(notifs ?? []);
    }
    load();
  }, []);

  const unreadCount = notifPreview.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4 pt-2 pb-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-800 truncate">
            {loading ? "..." : member ? `สวัสดี, ${member.nickname ?? member.full_name} 👋` : "90 Days Growing Together"}
          </h1>
          <p className="text-sm text-gray-400">มาร่วมกันสร้างสุขภาพดีไปด้วยกันนะ</p>
        </div>
        <Link href="/profile" className="shrink-0">
          <AvatarCircle avatarUrl={member?.avatar_url} name={member?.nickname ?? member?.full_name} size={44} />
        </Link>
      </header>

      {phaseInfo && (
        <PhaseHero
          primaryPhase={phaseInfo.primary_phase}
          currentDay={phaseInfo.current_day}
          startDate={phaseInfo.start_date}
          endDate={phaseInfo.end_date}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          const content = (
            <div className="rounded-card bg-white shadow-soft p-4 flex flex-col gap-2 min-h-[44px]">
              <div className={`w-10 h-10 rounded-full ${action.bg} flex items-center justify-center ${action.fg}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{action.label}</p>
                <p className="text-xs text-gray-400">{action.sub}</p>
              </div>
            </div>
          );
          return action.href === "#kindness" ? (
            <button key={action.label} onClick={() => setKindnessOpen(true)} className="text-left">
              {content}
            </button>
          ) : (
            <Link key={action.label} href={action.href}>
              {content}
            </Link>
          );
        })}
      </div>

      <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
            <Bell size={16} className="text-us" /> การแจ้งเตือน
            {unreadCount > 0 && (
              <span className="bg-kindness text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </h2>
          <Link href="/notifications" className="text-xs text-us font-medium flex items-center">
            ดูทั้งหมด <ChevronRight size={14} />
          </Link>
        </div>

        {notifPreview.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีการแจ้งเตือน</p>
        ) : (
          <div className="space-y-2">
            {notifPreview.map((n) => (
              <Link key={n.id} href="/notifications" className="flex items-start gap-2 py-1.5">
                <span className="text-base shrink-0">{getNotificationCategory(n.type).icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.is_read ? "text-gray-500" : "text-gray-800 font-medium"} line-clamp-2`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-gray-300">{new Date(n.created_at).toLocaleDateString("th-TH")}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {todayMission && (
        <div className="rounded-card bg-white shadow-soft p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">🎯 กิจกรรมวันนี้</h2>
            <Link href="/missions" className="text-xs text-us font-medium flex items-center">
              ดูทั้งหมด <ChevronRight size={14} />
            </Link>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{todayMission.name}</p>
              <p className="text-xs text-gray-400">
                {todayMission.target_value.toLocaleString()} {todayMission.unit}
              </p>
            </div>
            <Link
              href="/missions"
              className="shrink-0 rounded-pill bg-us text-white text-xs font-semibold px-4 py-2 min-h-[36px] flex items-center"
            >
              เช็คอิน
            </Link>
          </div>
        </div>
      )}

      <BuddyCard />
      <SquadCard />

      {kindnessOpen && (
        <KindnessModal
          onClose={() => setKindnessOpen(false)}
          onSuccess={() => setToast({ points: 0, sticker: null, message: "ส่งความห่วงใยสำเร็จ! 🌈" })}
        />
      )}

      <RewardToast reward={toast} onClose={() => setToast(null)} />
    </div>
  );
}
