"use client";

import { useState } from "react";
import useSWR from "swr";
import { TreePine } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";

interface SquadProgress {
  has_group: boolean;
  group_name?: string;
  target?: number;
  total?: number;
  remaining?: number;
  members?: { name: string; avatar_url: string | null; value: number }[];
}

async function fetchSquadProgress(): Promise<SquadProgress | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_squad_progress");
  return data;
}

export default function SquadCard() {
  const { data: progress, isLoading: loading } = useSWR("squad-progress", fetchSquadProgress, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });
  const [showMembers, setShowMembers] = useState(false);

  if (loading) {
    return <div className="rounded-card bg-white shadow-sm p-4 h-28 animate-pulse" />;
  }

  if (!progress?.has_group) {
    return (
      <div className="rounded-card bg-white shadow-sm p-4 text-sm text-gray-400 text-center">
        ยังไม่ได้จับกลุ่ม Squad — รอ Admin จัดกลุ่มให้นะ 🌳
      </div>
    );
  }

  const pct = Math.min(100, Math.round(((progress.total ?? 0) / (progress.target ?? 1)) * 100));

  return (
    <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TreePine size={18} className="text-us" />
        <h3 className="font-semibold text-gray-800">{progress.group_name}</h3>
        <span className="ml-auto text-xs text-gray-400">{progress.members?.length ?? 0} members</span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-us rounded-full" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-center text-sm">
        <span className="font-bold text-us text-base">
          ทีมเหลืออีก {(progress.remaining ?? 0).toLocaleString()} ก้าว
        </span>
      </p>
      <p className="text-center text-xs text-gray-400">
        {(progress.total ?? 0).toLocaleString()} / {(progress.target ?? 0).toLocaleString()} steps
      </p>

      {!!progress.members?.length && (
        <button
          onClick={() => setShowMembers((s) => !s)}
          className="w-full text-center text-xs text-gray-400 underline underline-offset-2"
        >
          {showMembers ? "ซ่อนรายชื่อสมาชิก" : "ดูสมาชิกในทีม"}
        </button>
      )}

      {showMembers && !!progress.members?.length && (
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
