"use client";

import { useEffect, useState } from "react";
import { Send, Loader2, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface FeedbackRow {
  id: string;
  member_id: string;
  member_name: string;
  employee_code: string;
  message: string;
  status: "open" | "replied";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "replied">("open");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_list_feedback");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReply(f: FeedbackRow) {
    const reply = (replyDrafts[f.id] ?? "").trim();
    if (!reply) return;

    setSendingId(f.id);
    setBanner(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_reply_feedback", { p_feedback_id: f.id, p_reply: reply });
    setSendingId(null);

    if (error) {
      setBanner("ตอบกลับไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setBanner(`ตอบกลับ ${f.member_name} เรียบร้อย`);
    setReplyDrafts((prev) => ({ ...prev, [f.id]: "" }));
    load();
  }

  const filtered = items.filter((f) => filter === "all" || f.status === filter);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-us font-bold text-lg">
          <MessageCircle size={20} /> คำถาม/ข้อเสนอแนะจากสมาชิก
        </div>
      </div>

      <div className="flex gap-2">
        {(["open", "replied", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "rounded-full px-4 py-2 text-xs font-semibold min-h-[36px]",
              filter === f ? "bg-us text-white" : "bg-white text-gray-500 border border-gray-200"
            )}
          >
            {f === "open" ? "รอตอบ" : f === "replied" ? "ตอบแล้ว" : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ไม่มีข้อความ</p>}

      <div className="space-y-3">
        {filtered.map((f) => (
          <div key={f.id} className="rounded-card bg-white shadow-soft p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {f.member_name} <span className="text-gray-400 font-normal">· {f.employee_code}</span>
                </p>
                <p className="text-xs text-gray-300">{new Date(f.created_at).toLocaleString("th-TH")}</p>
              </div>
              <span
                className={clsx(
                  "shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold",
                  f.status === "replied" ? "bg-pastel-green text-us" : "bg-amber-50 text-amber-600"
                )}
              >
                {f.status === "replied" ? "ตอบแล้ว" : "รอตอบ"}
              </span>
            </div>

            <p className="text-sm text-gray-700 bg-bg rounded-lg p-2.5">{f.message}</p>

            {f.admin_reply && (
              <div className="rounded-lg bg-pastel-green/40 p-2.5">
                <p className="text-xs font-semibold text-us mb-0.5">คำตอบที่ส่งไปแล้ว</p>
                <p className="text-sm text-gray-700">{f.admin_reply}</p>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={replyDrafts[f.id] ?? ""}
                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                placeholder={f.status === "replied" ? "แก้ไขคำตอบ..." : "พิมพ์คำตอบ..."}
                className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-us/40"
              />
              <button
                onClick={() => handleReply(f)}
                disabled={sendingId === f.id || !(replyDrafts[f.id] ?? "").trim()}
                className="shrink-0 rounded-full bg-us text-white px-4 py-2 min-h-[40px] flex items-center gap-1.5 text-sm font-semibold disabled:opacity-40"
              >
                {sendingId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
