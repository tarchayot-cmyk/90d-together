"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Send, History } from "lucide-react";
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

interface SentKindnessRow {
  id: string;
  created_at: string;
  category: KindnessCategoryValue;
  message: string;
  campaign_week: number;
  to_name: string;
  awarded_points: boolean;
}

function categoryMeta(value: string) {
  return KINDNESS_CATEGORIES.find((c) => c.value === value);
}

function friendlyError(raw: string): string {
  if (raw.includes("cannot_send_to_self")) return "ส่งให้ตัวเองไม่ได้นะ 😉";
  if (raw.includes("daily_send_limit_reached")) return "วันนี้ส่งครบ 10 ครั้งแล้ว พรุ่งนี้มาส่งต่อนะ";
  if (raw.includes("message_required")) return "พิมพ์ข้อความก่อนส่งนะ";
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
  const [view, setView] = useState<"send" | "history">("send");
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [toMemberId, setToMemberId] = useState("");
  const [category, setCategory] = useState<KindnessCategoryValue | null>(null);
  const [message, setMessage] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [history, setHistory] = useState<SentKindnessRow[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    async function loadInitial() {
      const supabase = createClient();
      const [{ data: colleaguesData }, { data: statusData }] = await Promise.all([
        supabase.rpc("list_colleagues"),
        supabase.rpc("get_kindness_sender_status"),
      ]);
      setColleagues(colleaguesData ?? []);
      setRemainingToday(statusData?.remaining_today ?? null);
      setLoadingList(false);
    }
    loadInitial();
  }, []);

  async function openHistory() {
    setView("history");
    if (history !== null) return; // already loaded once this session
    setLoadingHistory(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_my_sent_kindness");
    setHistory((data as SentKindnessRow[]) ?? []);
    setLoadingHistory(false);
  }

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
    if (!message.trim()) {
      setError("พิมพ์ข้อความก่อนส่งนะ");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("give_kindness", {
      p_to_member_id: toMemberId,
      p_category: category,
      p_message: message.trim(),
    });
    setSubmitting(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }

    if (typeof data?.remaining_today === "number") setRemainingToday(data.remaining_today);

    onSuccess();
    onClose();
  }

  const remainingLabel =
    remainingToday === null ? null : remainingToday === 0 ? "วันนี้ส่งครบโควตาแล้ว" : `วันนี้ส่งได้อีก ${remainingToday} ครั้ง`;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">🌈 ส่ง Kindness</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <div className="flex rounded-full bg-gray-100 p-1">
          <button
            onClick={() => setView("send")}
            className={clsx(
              "flex-1 rounded-full py-2 text-sm font-semibold min-h-[36px]",
              view === "send" ? "bg-white text-kindness shadow-sm" : "text-gray-400"
            )}
          >
            ส่งให้เพื่อน
          </button>
          <button
            onClick={openHistory}
            className={clsx(
              "flex-1 rounded-full py-2 text-sm font-semibold min-h-[36px] flex items-center justify-center gap-1.5",
              view === "history" ? "bg-white text-kindness shadow-sm" : "text-gray-400"
            )}
          >
            <History size={14} />
            ประวัติที่ส่งไป
          </button>
        </div>

        {view === "history" && (
          <div className="space-y-2">
            {loadingHistory && <p className="text-sm text-gray-400 text-center py-8">กำลังโหลด...</p>}
            {!loadingHistory && history?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">ยังไม่เคยส่ง Kindness ให้ใครเลย</p>
            )}
            {!loadingHistory &&
              history?.map((h) => {
                const meta = categoryMeta(h.category);
                return (
                  <div key={h.id} className="rounded-xl bg-bg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">
                        {meta?.emoji ?? "🌈"} ส่งให้ {h.to_name}
                      </p>
                      {h.awarded_points ? (
                        <span className="text-xs text-kindness font-medium shrink-0">ได้คะแนน</span>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0">เกินโควตาสัปดาห์นั้น</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{h.message}</p>
                    <p className="text-xs text-gray-400">
                      {meta?.label ?? h.category} · {new Date(h.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                );
              })}
          </div>
        )}

        {view === "send" && (
        <>
        {remainingLabel && (
          <p
            className={clsx(
              "text-center text-sm font-semibold rounded-full py-2",
              remainingToday === 0 ? "bg-gray-100 text-gray-400" : "bg-kindness/10 text-kindness"
            )}
          >
            {remainingLabel}
          </p>
        )}

        <div className="rounded-xl bg-kindness/5 border border-kindness/15 p-3 text-xs text-gray-500 space-y-0.5">
          <p>🔸 ส่งได้สูงสุด 10 ครั้งต่อวัน ส่งให้คนเดิมซ้ำได้ไม่จำกัด</p>
          <p>🔸 เพื่อนรับ Kindness ได้ไม่จำกัด แต่ได้คะแนนแค่ 3 ครั้งแรกของแต่ละสัปดาห์</p>
          <p>🔸 ผู้รับจะไม่เห็นว่าใครเป็นคนส่งให้</p>
          <p>🔸 ผู้รับที่ยังไม่ครบโควตาจะได้ ⭐ +10 คะแนน 🌈 +1 สติ๊กเกอร์ (ผู้ส่งไม่ได้คะแนน)</p>
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
            <label className="text-xs font-medium text-gray-500">ข้อความ (ต้องใส่)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              required
              placeholder="เช่น ขอบคุณที่ช่วยงานเมื่อเช้านะ!"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-kindness/40"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting || remainingToday === 0}
            className="w-full rounded-full bg-kindness py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "กำลังส่ง..." : "ส่ง Kindness"}
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
