"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartHandshake, Mail, Megaphone } from "lucide-react";
import { useMember } from "@/hooks/useMember";
import BuddyCard from "@/components/BuddyCard";
import SquadCard from "@/components/SquadCard";
import KindnessModal from "@/components/KindnessModal";
import RewardToast, { type RewardToastData } from "@/components/RewardToast";
import AvatarCircle from "@/components/AvatarCircle";

export default function HomePage() {
  const { member, loading } = useMember();
  const [kindnessOpen, setKindnessOpen] = useState(false);
  const [toast, setToast] = useState<RewardToastData | null>(null);

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-400">🌱 ME → 🌿 WE → 🌳 US</p>
          <h1 className="text-xl font-bold text-gray-800 truncate">
            {loading ? "..." : member ? `สวัสดี, ${member.nickname ?? member.full_name}` : "90 Days Growing Together"}
          </h1>
        </div>
        <Link href="/profile" className="shrink-0">
          <AvatarCircle avatarUrl={member?.avatar_url} name={member?.nickname ?? member?.full_name} size={44} />
        </Link>
      </header>

      {/* Tree summary + weekly missions live here once getDashboard()
          is wired up. For now, Home surfaces the two team engines
          (Buddy / Squad) plus quick access into missions & kindness. */}
      <Link
        href="/missions"
        className="block rounded-card bg-us text-white p-5 text-center font-semibold shadow-sm"
      >
        🎯 ดูภารกิจสัปดาห์นี้
      </Link>

      <BuddyCard />
      <SquadCard />

      <button
        onClick={() => setKindnessOpen(true)}
        className="w-full rounded-card bg-kindness/10 border border-kindness/30 text-kindness p-4 flex items-center justify-center gap-2 font-semibold min-h-[44px]"
      >
        <HeartHandshake size={18} />
        ส่ง Kindness ให้เพื่อนร่วมงาน
      </button>

      <Link
        href="/invitations"
        className="w-full rounded-card bg-we/10 border border-we/30 text-we p-4 flex items-center justify-center gap-2 font-semibold min-h-[44px]"
      >
        <Mail size={18} />
        คำเชิญกิจกรรม
      </Link>

      <Link
        href="/proposals"
        className="w-full rounded-card bg-white border border-gray-200 text-gray-600 p-4 flex items-center justify-center gap-2 font-semibold min-h-[44px]"
      >
        <Megaphone size={18} />
        เสนอ & โหวตกิจกรรม
      </Link>

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
