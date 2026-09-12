"use client";

import { useEffect, useState } from "react";
import { Check, X as XIcon, Clock, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface InvitationRow {
  id: string;
  mission_id: string;
  mission_name: string;
  from_member_id: string;
  from_name: string;
  to_member_id: string;
  to_name: string;
  scheduled_at: string;
  message: string | null;
  status: "pending" | "countered" | "accepted" | "declined" | "expired";
  counter_scheduled_at: string | null;
  counter_message: string | null;
  counter_expires_at: string | null;
  created_at: string;
  is_sender: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "รอตอบรับ",
  countered: "เสนอเวลาใหม่",
  accepted: "ตอบรับแล้ว ✓",
  declined: "ไม่สะดวก",
  expired: "หมดอายุ",
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function InvitationsPage() {
  const [items, setItems] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterTime, setCounterTime] = useState("");
  const [counterMsg, setCounterMsg] = useState("");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_my_invitations");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("respond_to_invitation", { p_invitation_id: id, p_accept: accept });
    setBusyId(null);
    if (error) {
      setBanner("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner(accept ? "ตอบรับคำชวนแล้ว 🎉" : "ปฏิเสธคำชวนแล้ว");
    load();
  }

  async function respondCounter(id: string, accept: boolean) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("respond_to_counter", { p_invitation_id: id, p_accept: accept });
    setBusyId(null);
    if (error) {
      setBanner(error.message.includes("counter_expired") ? "ข้อเสนอนี้หมดอายุแล้ว" : "ทำรายการไม่สำเร็จ กรุณาลองใหม่");
      load();
      return;
    }
    setBanner(accept ? "รับเวลาใหม่แล้ว 🎉" : "ไม่รับเวลาใหม่ที่เสนอมา");
    load();
  }

  async function submitCounter(id: string) {
    if (!counterTime) {
      setBanner("เลือกเวลาที่เสนอใหม่ก่อนนะ");
      return;
    }
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("counter_propose_invitation", {
      p_invitation_id: id,
      p_new_scheduled_at: new Date(counterTime).toISOString(),
      p_message: counterMsg || null,
      p_expires_in_days: 3,
    });
    setBusyId(null);
    if (error) {
      setBanner("ส่งข้อเสนอไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("ส่งข้อเสนอเวลาใหม่แล้ว");
    setCounteringId(null);
    setCounterTime("");
    setCounterMsg("");
    load();
  }

  const received = items.filter((i) => !i.is_sender);
  const sent = items.filter((i) => i.is_sender);

  return (
    <div className="space-y-5 pt-2">
      <header>
        <p className="text-sm text-gray-400">🤝 นัดกันทำภารกิจ</p>
        <h1 className="text-xl font-bold text-gray-800">คำเชิญกิจกรรม</h1>
      </header>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-sm">{banner}</p>}
      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">คำเชิญที่ได้รับ ({received.length})</h2>
            {received.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-card p-4 shadow-sm">ยังไม่มีใครชวนคุณ</p>}

            {received.map((inv) => (
              <div key={inv.id} className="rounded-card bg-white shadow-sm p-3 space-y-2">
                <div>
                  <p className="font-medium text-gray-800 text-sm">
                    {inv.from_name} ชวนทำ &quot;{inv.mission_name}&quot;
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={12} /> {fmt(inv.scheduled_at)}
                  </p>
                  {inv.message && <p className="text-xs text-gray-500 mt-1">&quot;{inv.message}&quot;</p>}
                </div>

                {inv.status === "pending" && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => respond(inv.id, true)}
                        disabled={busyId === inv.id}
                        className="flex-1 rounded-full bg-us text-white text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Check size={14} /> ตอบรับ
                      </button>
                      <button
                        onClick={() => respond(inv.id, false)}
                        disabled={busyId === inv.id}
                        className="flex-1 rounded-full border border-gray-200 text-gray-600 text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <XIcon size={14} /> ไม่สะดวก
                      </button>
                      <button
                        onClick={() => setCounteringId(counteringId === inv.id ? null : inv.id)}
                        disabled={busyId === inv.id}
                        className="flex-1 rounded-full border border-we/30 text-we text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw size={14} /> เสนอเวลาใหม่
                      </button>
                    </div>

                    {counteringId === inv.id && (
                      <div className="space-y-2 pt-2 border-t border-gray-50">
                        <input
                          type="datetime-local"
                          value={counterTime}
                          onChange={(e) => setCounterTime(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          value={counterMsg}
                          onChange={(e) => setCounterMsg(e.target.value)}
                          placeholder="ข้อความ (ไม่บังคับ)"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => submitCounter(inv.id)}
                          disabled={busyId === inv.id}
                          className="w-full rounded-full bg-we text-white text-xs font-semibold py-2 min-h-[36px] disabled:opacity-50"
                        >
                          ส่งข้อเสนอ (มีอายุ 3 วัน)
                        </button>
                      </div>
                    )}
                  </>
                )}

                {inv.status === "countered" && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                    คุณเสนอเวลาใหม่เป็น {inv.counter_scheduled_at && fmt(inv.counter_scheduled_at)} แล้ว — รอ {inv.from_name} ตอบรับ
                  </p>
                )}

                {(inv.status === "accepted" || inv.status === "declined" || inv.status === "expired") && (
                  <p className={clsx("text-xs font-semibold", inv.status === "accepted" ? "text-us" : "text-gray-400")}>
                    {STATUS_LABEL[inv.status]}
                  </p>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">คำเชิญที่คุณส่ง ({sent.length})</h2>
            {sent.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-card p-4 shadow-sm">ยังไม่ได้ชวนใคร</p>}

            {sent.map((inv) => (
              <div key={inv.id} className="rounded-card bg-white shadow-sm p-3 space-y-2">
                <div>
                  <p className="font-medium text-gray-800 text-sm">
                    ชวน {inv.to_name} ทำ &quot;{inv.mission_name}&quot;
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={12} /> {fmt(inv.scheduled_at)}
                  </p>
                </div>

                {inv.status === "countered" && (() => {
                  const isExpired = inv.counter_expires_at ? new Date(inv.counter_expires_at) < new Date() : false;
                  return (
                    <>
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                        {inv.to_name} เสนอเวลาใหม่: {inv.counter_scheduled_at && fmt(inv.counter_scheduled_at)}
                        {inv.counter_message && ` — "${inv.counter_message}"`}
                        {inv.counter_expires_at && ` (ตอบรับภายใน ${fmt(inv.counter_expires_at)})`}
                      </p>
                      {isExpired ? (
                        <p className="text-xs text-gray-400 text-center py-1">
                          หมดอายุแล้ว — ไม่สามารถตอบรับข้อเสนอนี้ได้อีก
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => respondCounter(inv.id, true)}
                            disabled={busyId === inv.id}
                            className="flex-1 rounded-full bg-us text-white text-xs font-semibold py-2 min-h-[36px] disabled:opacity-50"
                          >
                            รับเวลาใหม่
                          </button>
                          <button
                            onClick={() => respondCounter(inv.id, false)}
                            disabled={busyId === inv.id}
                            className="flex-1 rounded-full border border-gray-200 text-gray-600 text-xs font-semibold py-2 min-h-[36px] disabled:opacity-50"
                          >
                            ไม่รับ
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}

                {inv.status === "pending" && <p className="text-xs text-gray-400">รอ {inv.to_name} ตอบรับ</p>}

                {(inv.status === "accepted" || inv.status === "declined" || inv.status === "expired") && (
                  <p className={clsx("text-xs font-semibold", inv.status === "accepted" ? "text-us" : "text-gray-400")}>
                    {STATUS_LABEL[inv.status]}
                  </p>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
