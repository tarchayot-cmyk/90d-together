"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Send } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { KINDNESS_CATEGORIES, type KindnessCategoryValue } from "@/lib/kindness";
import AvatarCircle from "@/components/AvatarCircle";

interface Colleague {
  id: string;
  full_name: string;
  department: string | null;
  avatar_url: string | null;
}

function friendlyError(raw: string): string {
  if (raw.includes("cannot_send_to_self")) return "ส่งให้ตัวเองไม่ได้นะ 😉";
  if (raw.includes("pair_limit_reached")) return "สัปดาห์นี้คุณส่งให้คนนี้ไปแล้ว ลองส่งให้เพื่อนคนอื่นดูนะ";
  if (raw.includes("recipient_limit_reached")) return "เพื่อนคนนี้ได้รับ Kindness ครบโควตาของสัปดาห์นี้แล้ว";
  if (raw.includes("campaign_not_active")) return "แคมเปญนี้ยังไม่เริ่ม หรือสิ้นสุดแล้ว";
  if (raw.includes("not_authenticated")) return "กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function KindnessModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [toMemberId, setToMemberId] = useState("");
  const [category, setCategory] = useState<KindnessCategoryValue | null>(null);
  const [message, setMessage] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadColleagues() {
      const supabase = createClient();
      const { data } = await supabase.rpc("list_colleagues");
      setColleagues(data ?? []);
      setLoadingList(false);
    }
    loadColleagues();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!toMemberId) {
      setError("เลือกเพื่อนร่วมงานก่อนนะ");
      return;
    }
    if (!category) {
      setError("เลือกประเภทความห่วงใยก่อนนะ");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("give_kindness", {
      p_to_member_id: toMemberId,
      p_category: category,
      p_message: message || null,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">🌈 ส่ง Kindness</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <div className="rounded-xl bg-kindness/5 border border-kindness/15 p-3 text-xs text-gray-500 space-y-0.5">
          <p>🔸 ส่งให้คนเดิมซ้ำได้อีกทีตอนขึ้นสัปดาห์ใหม่ (1 คน/สัปดาห์)</p>
          <p>🔸 แต่ละคนรับ Kindness ได้สูงสุด 3 ครั้งต่อสัปดาห์</p>
          <p>🔸 ผู้รับจะไม่เห็นว่าใครเป็นคนส่งให้</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">ส่งให้</label>
            {loadingList ? (
              <p className="text-sm text-gray-400">กำลังโหลดรายชื่อ...</p>
            ) : (
              <>
                <select
                  value={toMemberId}
                  onChange={(e) => setToMemberId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-kindness/40"
                >
                  <option value="">-- เลือกเพื่อนร่วมงาน --</option>
                  {colleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                      {c.department ? ` · ${c.department}` : ""}
                    </option>
                  ))}
                </select>

                {toMemberId && (
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <AvatarCircle
                      avatarUrl={colleagues.find((c) => c.id === toMemberId)?.avatar_url}
                      name={colleagues.find((c) => c.id === toMemberId)?.full_name}
                      size={28}
                    />
                    <span className="text-sm text-gray-600">
                      {colleagues.find((c) => c.id === toMemberId)?.full_name}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">ประเภท</label>
            <div className="grid grid-cols-3 gap-2">
              {KINDNESS_CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={clsx(
                    "rounded-xl border py-3 flex flex-col items-center gap-1 text-xs min-h-[44px]",
                    category === cat.value
                      ? "border-kindness bg-kindness/10 text-kindness font-semibold"
                      : "border-gray-200 text-gray-500"
                  )}
                >
                  <span className="text-lg">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">ข้อความ (ไม่บังคับ)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="เช่น ขอบคุณที่ช่วยงานเมื่อเช้านะ!"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-kindness/40"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-kindness py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "กำลังส่ง..." : "ส่ง Kindness"}
          </button>
        </form>
      </div>
    </div>
  );
}
