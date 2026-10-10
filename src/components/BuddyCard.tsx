"use client";

import useSWR from "swr";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";

interface BuddyProgress {
  has_group: boolean;
  group_name?: string;
  round_no?: number | null;
  locked_until?: string | null;
  target?: number;
  total?: number;
  remaining?: number;
  members?: { name: string; avatar_url: string | null; value: number }[];
}

interface BuddyFlame {
  has_group: boolean;
  flame?: number;
  spare_left?: boolean;
  today_lit?: boolean;
  is_current?: boolean;
  awarded?: number[];
  people?: { name: string; is_me: boolean; done_today: boolean }[];
}

const FLAME_MILESTONES: { day: number; pts: number }[] = [
  { day: 3, pts: 10 },
  { day: 5, pts: 15 },
  { day: 7, pts: 25 },
];

async function fetchBuddyFlame(): Promise<BuddyFlame | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_buddy_flame");
  return data;
}

async function fetchBuddyProgress(): Promise<BuddyProgress | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_buddy_progress");
  return data;
}

export default function BuddyCard() {
  const { data: progress, isLoading: loading } = useSWR("buddy-progress", fetchBuddyProgress, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  const { data: flame } = useSWR("buddy-flame", fetchBuddyFlame, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  if (loading) {
    return <div className="rounded-card bg-white shadow-soft p-4 h-28 animate-pulse" />;
  }

  if (!progress?.has_group) {
    return (
      <div className="rounded-card bg-white shadow-soft p-4 text-sm text-gray-400 text-center">
        ยังไม่ได้จับคู่ Buddy — การจับคู่ใช้เฉพาะคนที่ระบุเพศในโปรไฟล์แล้ว ถ้ายังไม่ได้ระบุ ไปกรอกที่หน้าโปรไฟล์ แล้วรอ Admin จัดกลุ่มรอบถัดไปนะ 🤝
      </div>
    );
  }

  const pct = Math.min(100, Math.round(((progress.total ?? 0) / (progress.target ?? 1)) * 100));

  return (
    <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-we" />
        <h3 className="font-semibold text-gray-800">
          {progress.round_no ? `Buddy ของสัปดาห์นี้ (รอบ ${progress.round_no})` : progress.group_name}
        </h3>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-we rounded-full" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {(progress.total ?? 0).toLocaleString()} / {(progress.target ?? 0).toLocaleString()} steps
        </span>
        <span className="font-semibold text-we">เหลืออีก {(progress.remaining ?? 0).toLocaleString()}</span>
      </div>

      {flame?.has_group && (
        <div className="rounded-xl bg-orange-50 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-600">
              🔥 ไฟ Buddy {flame.flame ? `${flame.flame} วัน` : "ยังไม่ติด"}
            </span>
            <span className="text-[11px] text-orange-500">
              {flame.spare_left ? "ไฟสำรอง 1 ครั้ง" : "ใช้ไฟสำรองแล้ว"}
            </span>
          </div>
          <div className="flex gap-1.5">
            {FLAME_MILESTONES.map((m) => {
              const got = flame.awarded?.includes(m.day);
              const reached = (flame.flame ?? 0) >= m.day;
              return (
                <span
                  key={m.day}
                  className={`flex-1 text-center rounded-lg py-1 text-[11px] ${
                    got
                      ? "bg-orange-500 text-white font-semibold"
                      : reached
                        ? "bg-orange-200 text-orange-700"
                        : "bg-white text-gray-400"
                  }`}
                >
                  {m.day} วัน +{m.pts}
                </span>
              );
            })}
          </div>
          {flame.is_current && !flame.today_lit && !!flame.people?.length && (
            <p className="text-[11px] text-orange-600">
              วันนี้เช็คอินแล้ว:{" "}
              {flame.people.map((p) => `${p.is_me ? "คุณ" : p.name} ${p.done_today ? "✓" : "–"}`).join("  ")}
              {" "}— ทุกคนเช็คอินวันนี้ ไฟถึงจะติด
            </p>
          )}
          {flame.is_current && flame.today_lit && (
            <p className="text-[11px] text-orange-600">วันนี้ไฟติดแล้ว 🔥</p>
          )}
        </div>
      )}

      {!!progress.members?.length && (
        <ul className="space-y-1.5 pt-1 border-t border-gray-50">
          {progress.members.map((m) => (
            <li key={m.name} className="flex items-center gap-2 text-xs text-gray-500">
              <AvatarCircle avatarUrl={m.avatar_url} name={m.name} size={20} />
              <span className="flex-1 min-w-0 truncate">{m.name}</span>
              <span className="shrink-0">{m.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
