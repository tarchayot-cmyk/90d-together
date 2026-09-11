"use client";

import useSWR from "swr";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface BuddyProgress {
  has_group: boolean;
  group_name?: string;
  target?: number;
  total?: number;
  remaining?: number;
  members?: { name: string; value: number }[];
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

  if (loading) {
    return <div className="rounded-card bg-white shadow-sm p-4 h-28 animate-pulse" />;
  }

  if (!progress?.has_group) {
    return (
      <div className="rounded-card bg-white shadow-sm p-4 text-sm text-gray-400 text-center">
        ยังไม่ได้จับคู่ Buddy — รอ Admin จัดกลุ่มให้นะ 🤝
      </div>
    );
  }

  const pct = Math.min(100, Math.round(((progress.total ?? 0) / (progress.target ?? 1)) * 100));

  return (
    <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-we" />
        <h3 className="font-semibold text-gray-800">{progress.group_name}</h3>
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

      {!!progress.members?.length && (
        <ul className="space-y-1 pt-1 border-t border-gray-50">
          {progress.members.map((m) => (
            <li key={m.name} className="flex justify-between text-xs text-gray-500">
              <span>{m.name}</span>
              <span>{m.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
