"use client";

import { useEffect, useState } from "react";
import { Check, X as XIcon, PlayCircle, StopCircle, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "voting" | "closed";
  proposed_by_name: string;
  created_at: string;
  vote_count: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "รอพิจารณา",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  voting: "กำลังโหวต",
  closed: "ปิดโหวตแล้ว",
};

export default function AdminProposalsPage() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_proposals_with_votes");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, approve: boolean) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_review_proposal", { p_proposal_id: id, p_approved: approve });
    setBusyId(null);
    if (error) {
      setBanner("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner(approve ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว");
    load();
  }

  async function openVoting(id: string) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_open_voting", { p_proposal_id: id });
    setBusyId(null);
    if (error) {
      setBanner("เปิดโหวตไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("เปิดโหวตแล้ว — แจ้งเตือนสมาชิกทุกคนแล้ว");
    load();
  }

  async function closeVoting(id: string) {
    const confirmed = window.confirm("ปิดโหวตกิจกรรมนี้? หลังปิดแล้วจะโหวตเพิ่มไม่ได้อีก");
    if (!confirmed) return;

    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_close_voting", { p_proposal_id: id });
    setBusyId(null);
    if (error) {
      setBanner("ปิดโหวตไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("ปิดโหวตแล้ว");
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        กิจกรรมที่โหวตผ่านเป็นแค่ผลโพล — ถ้าจะเปิดให้เช็คอินจริง ต้องไปสร้างภารกิจเองที่แท็บ Missions
      </p>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-sm">{banner}</p>}

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && items.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีข้อเสนอ</p>}

      <div className="space-y-3">
        {items.map((p) => {
          const busy = busyId === p.id;
          return (
            <div key={p.id} className="rounded-card bg-white shadow-sm p-4 space-y-2">
              <div>
                <h3 className="font-semibold text-gray-800">{p.title}</h3>
                <p className="text-xs text-gray-400">เสนอโดย {p.proposed_by_name}</p>
                {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span
                  className={clsx(
                    "font-semibold",
                    p.status === "voting" ? "text-us" : p.status === "rejected" ? "text-red-400" : "text-gray-500"
                  )}
                >
                  {STATUS_LABEL[p.status]}
                </span>
                {(p.status === "voting" || p.status === "closed") && (
                  <span className="text-gray-400 flex items-center gap-1">
                    <ThumbsUp size={12} /> {p.vote_count} โหวต
                  </span>
                )}
              </div>

              {p.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => review(p.id, true)}
                    disabled={busy}
                    className="flex-1 rounded-full bg-us text-white text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <Check size={14} /> อนุมัติ
                  </button>
                  <button
                    onClick={() => review(p.id, false)}
                    disabled={busy}
                    className="flex-1 rounded-full border border-gray-200 text-gray-600 text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <XIcon size={14} /> ไม่อนุมัติ
                  </button>
                </div>
              )}

              {p.status === "approved" && (
                <button
                  onClick={() => openVoting(p.id)}
                  disabled={busy}
                  className="w-full rounded-full bg-we text-white text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <PlayCircle size={14} /> เปิดโหวต
                </button>
              )}

              {p.status === "voting" && (
                <button
                  onClick={() => closeVoting(p.id)}
                  disabled={busy}
                  className="w-full rounded-full border border-red-200 text-red-500 text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <StopCircle size={14} /> ปิดโหวต
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
