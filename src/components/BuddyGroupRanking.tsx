"use client";

import { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface GroupMember {
  id: string;
  name: string;
  points: number;
}

interface GroupRow {
  rank: number;
  avg: number;
  total: number;
  is_mine: boolean;
  members: GroupMember[];
}

interface RankingData {
  round?: number;
  current_round?: number;
  round_start?: string;
  round_end?: string;
  available_rounds: number[];
  total_groups?: number;
  top: GroupRow[];
  mine?: GroupRow | null;
}

const MEDAL = ["🥇", "🥈", "🥉"];

function fmtDate(d?: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

async function fetchRanking(all: boolean, round: number | null): Promise<RankingData> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_buddy_ranking_by_round", { p_round: round, p_all: all });
  return (data as RankingData) ?? { available_rounds: [], top: [] };
}

function GroupCard({ g, showRank }: { g: GroupRow; showRank?: boolean }) {
  return (
    <li
      className={clsx(
        "rounded-card p-3 space-y-2 shadow-soft",
        g.is_mine ? "bg-us/10 border border-us/40" : "bg-white"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="w-8 text-center font-bold text-gray-500 text-sm">
          {showRank === false ? "" : MEDAL[g.rank - 1] ?? g.rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            {g.is_mine ? "กลุ่มของฉัน" : `กลุ่มอันดับ ${g.rank}`}
          </p>
          <p className="text-[11px] text-gray-400">รวม {g.total.toLocaleString()} คะแนน · {g.members.length} คน</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-us">🌿 {g.avg.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400">เฉลี่ย/คน</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5 pl-11">
        {g.members.map((m) => (
          <li key={m.id} className="rounded-full bg-bg px-2.5 py-1 text-xs text-gray-600">
            {m.name} <span className="text-gray-400">{m.points.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// all = true (admin): show every group instead of the Top 5
export default function BuddyGroupRanking({ all = false }: { all?: boolean }) {
  const [round, setRound] = useState<number | null>(null);
  const { data, isLoading } = useSWR(["buddy-group-ranking-round", all, round], ([, a, r]) => fetchRanking(a as boolean, r as number | null), {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  const inTop = data?.top.some((g) => g.is_mine);

  return (
    <div className="space-y-3">
      <div className="rounded-card bg-white shadow-soft p-3 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700">🤝 อันดับกลุ่ม Buddy ประจำรอบ</p>
        <p>
          จัดอันดับจาก<b>คะแนนเฉลี่ยต่อคน</b> เพื่อให้กลุ่ม 2 คนและ 3 คนแข่งกันได้ยุติธรรม
          นับ<b>คะแนนกิจกรรมของกลุ่ม (ไม่หักเพดานธีม)</b> ที่สมาชิกทำสำเร็จในรอบนั้น
          ตัวเลขจึงอาจสูงกว่าคะแนนส่วนตัวของแต่ละคนถ้าธีมนั้นเต็มเพดานแล้ว อันดับกลุ่มจัดถึงรอบสุดท้ายของช่วง WE เท่านั้น
        </p>
      </div>

      {data && data.available_rounds.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {data.available_rounds.map((r) => (
            <button
              key={r}
              onClick={() => setRound(r === data.current_round ? null : r)}
              className={clsx(
                "rounded-full px-3 py-2 text-xs font-semibold min-h-[36px] shrink-0",
                (round ?? data.current_round) === r ? "bg-we text-white" : "bg-white text-gray-500 shadow-soft"
              )}
            >
              รอบ {r}
              {r === data.current_round ? " (ล่าสุด)" : ""}
            </button>
          ))}
        </div>
      )}

      {isLoading && !data && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {data && data.available_rounds.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">อันดับกลุ่ม Buddy จะเริ่มตั้งแต่ช่วง WE</p>
      )}

      {data && data.round && (
        <>
          <p className="text-xs text-gray-400">
            รอบ {data.round} · {fmtDate(data.round_start)} – {fmtDate(data.round_end)} · ทั้งหมด {data.total_groups} กลุ่ม
          </p>
          <ol className="space-y-2">
            {data.top.map((g) => (
              <GroupCard key={g.rank + "-" + g.members.map((m) => m.id).join("")} g={g} />
            ))}
          </ol>
          {data.mine && !inTop && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">อันดับของกลุ่มคุณ</p>
              <ol>
                <GroupCard g={data.mine} />
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
