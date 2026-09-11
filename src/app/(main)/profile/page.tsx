"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut, Check, Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useMember } from "@/hooks/useMember";

interface BadgeProgress {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  unlocked: boolean;
  unlocked_at: string | null;
  current_value: number;
  target_value: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { member, loading: memberLoading } = useMember();
  const [badges, setBadges] = useState<BadgeProgress[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(member?.avatar_url ?? null);
  }, [member?.avatar_url]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_badge_progress");
      setBadges(data ?? []);
      setLoadingBadges(false);
    }
    load();
  }, []);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !member) return;

    setAvatarError(null);
    setUploadingAvatar(true);
    const supabase = createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) {
      setUploadingAvatar(false);
      setAvatarError("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      return;
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadError) {
      setUploadingAvatar(false);
      setAvatarError("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    // cache-bust so the new image shows immediately even though the path is the same (upsert)
    const bustedUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: rpcError } = await supabase.rpc("update_my_avatar", { p_avatar_url: bustedUrl });
    setUploadingAvatar(false);

    if (rpcError) {
      setAvatarError("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setAvatarUrl(bustedUrl);
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login"); // (main) layout would also catch this, but no need to wait for it
  }

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-full bg-bg overflow-hidden flex items-center justify-center text-2xl text-gray-400 border border-gray-100">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (member?.nickname ?? member?.full_name ?? "?").charAt(0).toUpperCase()
            )}
          </div>
          <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-us text-white flex items-center justify-center cursor-pointer shadow-sm">
            {uploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
          </label>
        </div>
        <div>
          <p className="text-sm text-gray-400">👤 Profile</p>
          <h1 className="text-xl font-bold text-gray-800">
            {memberLoading ? "..." : member?.full_name ?? "ผู้เข้าร่วม"}
          </h1>
        </div>
      </header>

      {avatarError && <p className="text-xs text-red-500 text-center">{avatarError}</p>}

      <div className="rounded-card bg-white shadow-sm p-4 space-y-1.5 text-sm">
        <Row label="รหัสบุคลากร" value={member?.employee_code} />
        <Row label="ชื่อเล่น" value={member?.nickname ?? "-"} />
        <Row label="หน่วย" value={member?.unit ?? "-"} />
        <Row label="แผนก" value={member?.department ?? "-"} />
        <Row label="สถานะ" value={member?.is_active ? "Active" : "Inactive"} />
      </div>

      <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm">🏅 Badge ของฉัน</h2>

        {loadingBadges ? (
          <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>
        ) : (
          <div className="space-y-2">
            {badges.map((badge) => {
              const pct = Math.min(100, Math.round((badge.current_value / Math.max(badge.target_value, 1)) * 100));
              return (
                <div
                  key={badge.code}
                  className={clsx(
                    "rounded-xl p-3 flex gap-3 border",
                    badge.unlocked ? "bg-us/5 border-us/20" : "bg-gray-50 border-gray-100"
                  )}
                >
                  <div className={clsx("text-2xl shrink-0", !badge.unlocked && "grayscale opacity-40")}>
                    {badge.icon ?? "🏅"}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <p className={clsx("text-sm font-semibold", badge.unlocked ? "text-gray-800" : "text-gray-500")}>
                        {badge.name}
                      </p>
                      {badge.unlocked && <Check size={14} className="text-us shrink-0" />}
                    </div>
                    {badge.description && <p className="text-xs text-gray-400">{badge.description}</p>}

                    {badge.unlocked ? (
                      <p className="text-xs text-us font-medium">
                        ปลดล็อกแล้ว
                        {badge.unlocked_at && ` · ${new Date(badge.unlocked_at).toLocaleDateString("th-TH")}`}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full bg-we rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400">
                          ความคืบหน้า {badge.current_value}/{badge.target_value}
                        </p>
                      </div>
                    )}
                  </div>
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
