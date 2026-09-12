"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Send, Check } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import type { Mission } from "@/lib/types";
import AvatarCircle from "@/components/AvatarCircle";

interface Colleague {
  id: string;
  full_name: string;
  department: string | null;
  avatar_url: string | null;
}

function friendlyError(raw: string): string {
  if (raw.includes("cannot_invite_self")) return "ชวนตัวเองไม่ได้นะ 😉";
  if (raw.includes("scheduled_time_in_past")) return "เลือกวัน-เวลาที่ยังไม่ผ่านไปนะ";
  if (raw.includes("mission_not_found")) return "ไม่พบภารกิจนี้ อาจถูกปิดใช้งานไปแล้ว";
  return "ส่งคำเชิญไม่สำเร็จ กรุณาลองใหม่";
}

export default function InviteModal({
  mission,
  onClose,
  onSuccess,
}: {
  mission: Mission;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [toMemberId, setToMemberId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("list_colleagues");
      setColleagues(data ?? []);
      setLoadingList(false);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!toMemberId) {
      setError("เลือกเพื่อนร่วมงานก่อนนะ");
      return;
    }
    if (!scheduledAt) {
      setError("เลือกวันและเวลาก่อนนะ");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_invitation", {
      p_to_member_id: toMemberId,
      p_mission_id: mission.id,
      p_scheduled_at: new Date(scheduledAt).toISOString(),
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
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">🤝 ชวนทำ &quot;{mission.name}&quot;</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">ชวนใคร</label>
            {loadingList ? (
              <p className="text-sm text-gray-400">กำลังโหลดรายชื่อ...</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-50">
                {colleagues.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setToMemberId(c.id)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left min-h-[44px]",
                      toMemberId === c.id && "bg-we/10"
                    )}
                  >
                    <AvatarCircle avatarUrl={c.avatar_url} name={c.full_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{c.full_name}</p>
                      {c.department && <p className="text-xs text-gray-400 truncate">{c.department}</p>}
                    </div>
                    {toMemberId === c.id && <Check size={16} className="text-we shrink-0" />}
                  </button>
                ))}
                {colleagues.length === 0 && <p className="text-sm text-gray-400 px-3 py-4 text-center">ไม่พบเพื่อนร่วมงาน</p>}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">วันและเวลานัด</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-we/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">ข้อความ (ไม่บังคับ)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="เช่น ไปเดินด้วยกันตอนพักเที่ยงไหม?"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-we/40"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-we py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? "กำลังส่ง..." : "ส่งคำชวน"}
          </button>
        </form>
      </div>
    </div>
  );
}
