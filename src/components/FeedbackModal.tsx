"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Send, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface FeedbackRow {
  id: string;
  message: string;
  status: "open" | "replied";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export default function FeedbackModal({ onClose, highlightId }: { onClose: () => void; highlightId?: string | null }) {
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoadingHistory(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_my_feedback");
    setHistory(data ?? []);
    setLoadingHistory(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!loadingHistory && highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loadingHistory, highlightId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) {
      setError("พิมพ์ข้อความก่อนนะ");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("submit_feedback", { p_message: message.trim() });
    setSubmitting(false);

    if (rpcError) {
      setError("ส่งไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setMessage("");
    load();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-1.5">
            <MessageCircle size={18} className="text-us" /> สอบถามแอดมิน / ข้อเสนอแนะ
          </h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="พิมพ์คำถามหรือข้อเสนอแนะถึงแอดมิน..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-us py-2.5 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "กำลังส่ง..." : "ส่งข้อความ"}
          </button>
        </form>

        <div className="space-y-2 pt-2 border-t border-gray-50">
          <p className="text-xs font-semibold text-gray-500">ประวัติที่เคยส่ง</p>

          {loadingHistory && <p className="text-sm text-gray-400 text-center py-4">กำลังโหลด...</p>}

          {!loadingHistory && history.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่เคยส่งข้อความ</p>
          )}

          <div className="space-y-2">
            {history.map((f) => (
              <div
                key={f.id}
                ref={f.id === highlightId ? highlightRef : undefined}
                className={clsx(
                  "rounded-xl p-3 space-y-1.5 transition-colors",
                  f.id === highlightId ? "bg-pastel-green ring-2 ring-us" : "bg-bg"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700">{f.message}</p>
                  <span
                    className={clsx(
                      "shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold",
                      f.status === "replied" ? "bg-pastel-green text-us" : "bg-gray-100 text-gray-400"
                    )}
                  >
                    {f.status === "replied" ? "ตอบแล้ว" : "รอตอบ"}
                  </span>
                </div>
                <p className="text-[10px] text-gray-300">{new Date(f.created_at).toLocaleDateString("th-TH")}</p>

                {f.admin_reply && (
                  <div className="rounded-lg bg-white p-2 mt-1">
                    <p className="text-xs font-semibold text-us mb-0.5">แอดมินตอบ:</p>
                    <p className="text-sm text-gray-700">{f.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
