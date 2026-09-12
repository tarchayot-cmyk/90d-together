"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Send } from "lucide-react";
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
  mission: presetMission,
  onClose,
  onSuccess,
}: {
  mission?: Mission; // omit to let the member pick a mission inside the modal
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [availableMissions, setAvailableMissions] = useState<Mission[]>([]);
  const [missionId, setMissionId] = useState(presetMission?.id ?? "");
  const [toMemberId, setToMemberId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: colleaguesData } = await supabase.rpc("list_colleagues");
      setColleagues(colleaguesData ?? []);

      if (!presetMission) {
        const { data: phaseInfo } = await supabase.rpc("get_campaign_phase_info");
        if (phaseInfo?.has_campaign && phaseInfo.unlocked_levels?.length) {
          const { data: missions } = await supabase
            .from("missions")
            .select("*")
            .eq("campaign_id", phaseInfo.campaign_id)
            .in("level", phaseInfo.unlocked_levels)
            .eq("is_active", true);
          setAvailableMissions(missions ?? []);
        }
      }

      setLoadingList(false);
    }
    load();
  }, [presetMission]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!missionId) {
      setError("เลือกภารกิจที่จะชวนก่อนนะ");
      return;
    }
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
      p_mission_id: missionId,
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

  const missionName = presetMission?.name ?? availableMissions.find((m) => m.id === missionId)?.name;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            🤝 {missionName ? `ชวนทำ "${missionName}"` : "ชวนทำกิจกรรม"}
          </h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {loadingList ? (
          <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!presetMission && (
              <div>
                <label className="text-xs font-medium text-gray-500">ภารกิจที่จะชวนทำ</label>
                <select
                  value={missionId}
                  onChange={(e) => setMissionId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-we/40"
                >
                  <option value="">-- เลือกภารกิจ --</option>
                  {availableMissions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {availableMissions.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">ยังไม่มีภารกิจที่เปิดให้ชวนในตอนนี้</p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">ชวนใคร</label>
              <select
                value={toMemberId}
                onChange={(e) => setToMemberId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-we/40"
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
        )}
      </div>
    </div>
  );
}
