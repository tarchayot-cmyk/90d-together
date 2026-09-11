"use client";

import { useEffect, useState } from "react";
import { Plus, ThumbsUp, Check } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import ProposeActivityModal from "@/components/ProposeActivityModal";

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "voting" | "closed";
  proposed_by: string;
  proposed_by_name: string;
  created_at: string;
  voting_opened_at: string | null;
  voting_closed_at: string | null;
  vote_count: number;
  has_voted: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "รอ Admin พิจารณา",
  approved: "อนุมัติแล้ว รอเปิดโหวต",
  rejected: "ไม่ได้รับการอนุมัติ",
  voting: "เปิดโหวตอยู่",
  closed: "ปิดโหวตแล้ว",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-gray-400",
  approved: "text-we",
  rejected: "text-gray-400",
  voting: "text-us font-semibold",
  closed: "text-gray-500",
};

export default function ProposalsPage() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPropose, setShowPropose] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
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

  async function handleVote(id: string) {
    setVotingId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("cast_vote", { p_proposal_id: id });
    setVotingId(null);
    if (error) {
      setBanner(error.message.includes("already_voted") ? "คุณโหวตให้กิจกรรมนี้ไปแล้ว" : "โหวตไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("โหวตสำเร็จ! ขอบคุณครับ 👍");
    load();
  }

  return (
    <div className="space-y-4 pt-2">
      <header>
        <p className="text-sm text-gray-400">📢 ร่วมกำหนดกิจกรรม</p>
        <h1 className="text-xl font-bold text-gray-800">เสนอ & โหวตกิจกรรม</h1>
      </header>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-sm">{banner}</p>}

      <button
        onClick={() => setShowPropose(true)}
        className="w-full rounded-card bg-us text-white p-4 flex items-center justify-center gap-2 font-semibold shadow-sm min-h-[44px]"
      >
        <Plus size={18} />
        เสนอกิจกรรมใหม่
      </button>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีใครเสนอกิจกรรม — เป็นคนแรกเลย!</p>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.id} className="rounded-card bg-white shadow-sm p-4 space-y-2">
            <div>
              <h3 className="font-semibold text-gray-800">{p.title}</h3>
              <p className="text-xs text-gray-400">เสนอโดย {p.proposed_by_name}</p>
              {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
            </div>

            <div className="flex items-center justify-between">
              <span className={clsx("text-xs", STATUS_COLOR[p.status])}>{STATUS_LABEL[p.status]}</span>
              {(p.status === "voting" || p.status === "closed") && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <ThumbsUp size={12} /> {p.vote_count} โหวต
                </span>
              )}
            </div>

            {p.status === "voting" && (
              <button
                onClick={() => handleVote(p.id)}
                disabled={p.has_voted || votingId === p.id}
                className={clsx(
                  "w-full rounded-full py-2.5 text-sm font-semibold min-h-[44px] flex items-center justify-center gap-2",
                  p.has_voted ? "bg-gray-100 text-gray-400" : "bg-us text-white active:opacity-80"
                )}
              >
                {p.has_voted ? (
                  <>
                    <Check size={16} /> คุณโหวตแล้ว
                  </>
                ) : votingId === p.id ? (
                  "กำลังโหวต..."
                ) : (
                  <>
                    <ThumbsUp size={16} /> โหวตให้กิจกรรมนี้
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {showPropose && (
        <ProposeActivityModal
          onClose={() => setShowPropose(false)}
          onSuccess={() => {
            setBanner("ส่งข้อเสนอแล้ว รอ Admin พิจารณา");
            load();
          }}
        />
      )}
    </div>
  );
}
