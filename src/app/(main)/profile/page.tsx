"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";

interface Badge {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { member, loading: memberLoading } = useMember();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [unlockedCodes, setUnlockedCodes] = useState<Set<string>>(new Set());
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [{ data: allBadges }, { data: mine }] = await Promise.all([
        supabase.from("badges").select("*").order("created_at"),
        supabase.from("member_badges").select("badge_id"), // RLS: own rows only
      ]);

      setBadges(allBadges ?? []);
      setUnlockedCodes(new Set((mine ?? []).map((m) => m.badge_id)));
      setLoadingBadges(false);
    }
    load();
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login"); // (main) layout would also catch this, but no need to wait for it
  }

  return (
    <div className="space-y-4 pt-2">
      <header>
        <p className="text-sm text-gray-400">👤 Profile</p>
        <h1 className="text-xl font-bold text-gray-800">
          {memberLoading ? "..." : member?.full_name ?? "ผู้เข้าร่วม"}
        </h1>
      </header>

      <div className="rounded-card bg-white shadow-sm p-4 space-y-1.5 text-sm">
        <Row label="รหัสบุคลากร" value={member?.employee_code} />
        <Row label="แผนก" value={member?.department ?? "-"} />
        <Row label="สถานะ" value={member?.is_active ? "Active" : "Inactive"} />
      </div>

      <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm">🏅 Badge ของฉัน</h2>

        {loadingBadges ? (
          <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {badges.map((badge) => {
              // note: member_badges.badge_id is what we compared against
              // above, so this check matches by id, not code.
              const unlocked = unlockedCodes.has(badge.id);
              return (
                <div
                  key={badge.id}
                  className={clsx(
                    "rounded-xl p-3 text-center space-y-1 border",
                    unlocked ? "bg-us/5 border-us/20" : "bg-gray-50 border-gray-100"
                  )}
                >
                  <div className={clsx("text-2xl", !unlocked && "grayscale opacity-40")}>
                    {badge.icon ?? "🏅"}
                  </div>
                  <p className={clsx("text-xs font-semibold", unlocked ? "text-gray-700" : "text-gray-400")}>
                    {badge.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full rounded-card bg-white shadow-sm p-4 flex items-center justify-center gap-2 text-sm font-semibold text-red-500 min-h-[44px] disabled:opacity-60"
      >
        <LogOut size={16} />
        {signingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{value ?? "-"}</span>
    </div>
  );
}
