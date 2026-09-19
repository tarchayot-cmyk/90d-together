"use client";

import { useEffect, useState } from "react";
import { Search, Trash2, Check, X as XIcon, ImageIcon, Eraser } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface CheckinRow {
  id: string;
  campaign_week: number;
  value: number;
  note: string | null;
  completed_at: string | null;
  proof_status: string;
  proof_url: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  member: { full_name: string; employee_code: string } | { full_name: string; employee_code: string }[] | null;
  mission: { name: string; level: string; requires_proof: boolean } | { name: string; level: string; requires_proof: boolean }[] | null;
  reviewer: { full_name: string } | { full_name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const PROOF_STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธแล้ว",
};

export default function AdminCheckinsPage() {
  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("check_ins")
      .select(
        "id, campaign_week, value, note, completed_at, proof_status, proof_url, created_at, updated_at, reviewed_at, rejection_reason, " +
          "member:members!check_ins_member_id_fkey(full_name, employee_code), " +
          "mission:missions!check_ins_mission_id_fkey(name, level, requires_proof), " +
          "reviewer:members!check_ins_reviewed_by_fkey(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (!error) setRows((data as unknown as CheckinRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(row: CheckinRow) {
    const member = one(row.member);
    const mission = one(row.mission);
    const confirmed = window.confirm(
      `ลบ Check-in นี้?\n\n${member?.full_name ?? "-"} · ${mission?.name ?? "-"} · สัปดาห์ ${row.campaign_week}\n\n` +
        "จะดึงคะแนน/สติ๊กเกอร์ที่ได้จากรายการนี้คืน และเปิดให้เช็คอินใหม่ได้ในสัปดาห์เดิม"
    );
    if (!confirmed) return;

    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_checkin", { p_checkin_id: row.id });
    setBusyId(null);

    if (error) {
      setBanner(error.message.includes("not_authorized") ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "ลบไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("ลบ Check-in เรียบร้อย — สามารถเช็คอินใหม่ได้แล้ว");
    load();
  }

  async function handleApprove(row: CheckinRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_approve_checkin", {
      p_checkin_id: row.id,
      p_approved: true,
    });
    setBusyId(null);

    if (error) {
      setBanner(
        error.message.includes("not_authorized")
          ? "คุณไม่มีสิทธิ์ทำรายการนี้"
          : error.message.includes("cannot_approve_own_submission")
          ? "ไม่สามารถอนุมัติ Check-in ของตัวเองได้ — ให้ Admin คนอื่นตรวจสอบแทน"
          : "ทำรายการไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }
    setBanner("อนุมัติแล้ว — แจกคะแนน/สติ๊กเกอร์เรียบร้อย");
    load();
  }

  function openReject(row: CheckinRow) {
    setRejectingId(row.id);
    setRejectReason("");
  }

  async function submitReject(row: CheckinRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_approve_checkin", {
      p_checkin_id: row.id,
      p_approved: false,
      p_reason: rejectReason.trim() || null,
    });
    setBusyId(null);

    if (error) {
      setBanner(
        error.message.includes("not_authorized")
          ? "คุณไม่มีสิทธิ์ทำรายการนี้"
          : error.message.includes("cannot_approve_own_submission")
          ? "ไม่สามารถอนุมัติ Check-in ของตัวเองได้ — ให้ Admin คนอื่นตรวจสอบแทน"
          : "ทำรายการไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }
    setRejectingId(null);
    setBanner("ปฏิเสธรายการนี้แล้ว");
    load();
  }

  async function handleCleanupOldProofs() {
    const candidates = rows.filter(
      (r) => r.proof_url && (r.proof_status === "approved" || r.proof_status === "rejected")
    );

    if (candidates.length === 0) {
      setBanner("ไม่มีรูปหลักฐานที่ตรวจสอบแล้วให้ล้าง");
      return;
    }

    const confirmed = window.confirm(
      `พบรูปหลักฐานที่ตรวจสอบเสร็จแล้ว จำนวน ${candidates.length} รูป\n\n` +
        "ลบไฟล์รูปเหล่านี้ทิ้งถาวร (คะแนน/สติ๊กเกอร์ที่แจกไปแล้วไม่ถูกกระทบ — ลบแค่ตัวรูปเท่านั้น)?"
    );
    if (!confirmed) return;

    setCleaningUp(true);
    const supabase = createClient();

    const paths = candidates
      .map((r) => r.proof_url!.split("/storage/v1/object/public/proofs/")[1])
      .filter(Boolean);

    const { error: removeError } = await supabase.storage.from("proofs").remove(paths);
    if (removeError) {
      setCleaningUp(false);
      setBanner("ลบไฟล์รูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("admin_clear_proof_urls", {
      p_checkin_ids: candidates.map((r) => r.id),
    });
    setCleaningUp(false);

    if (rpcError) {
      setBanner("ลบไฟล์สำเร็จ แต่ล้างลิงก์ในฐานข้อมูลไม่สำเร็จ — ลองใหม่หรือแจ้งผู้ดูแลระบบ");
      return;
    }

    setBanner(`ล้างรูปหลักฐานเรียบร้อย ${data?.cleared_count ?? candidates.length} รายการ`);
    load();
  }

  const filtered = rows
    .filter((r) => (pendingOnly ? r.proof_status === "pending" : true))
    .filter((r) => {
      const member = one(r.member);
      const mission = one(r.mission);
      const q = query.toLowerCase();
      if (!q) return true;
      return (
        member?.full_name.toLowerCase().includes(q) ||
        member?.employee_code.toLowerCase().includes(q) ||
        mission?.name.toLowerCase().includes(q)
      );
    });

  const pendingCount = rows.filter((r) => r.proof_status === "pending").length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        แสดง 150 รายการล่าสุด — ลบแล้วคะแนน/สติ๊กเกอร์ของรายการนั้นจะถูกดึงคืนอัตโนมัติ และบันทึกลง Audit Log ทุกการกระทำ
      </p>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      <button
        onClick={() => setPendingOnly((v) => !v)}
        className={clsx(
          "w-full rounded-card p-3 text-sm font-semibold min-h-[44px] border",
          pendingOnly ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200"
        )}
      >
        🕒 รอตรวจสอบหลักฐาน {pendingCount} รายการ — {pendingOnly ? "แสดงทั้งหมด" : "กรองเฉพาะรายการนี้"}
      </button>

      <button
        onClick={handleCleanupOldProofs}
        disabled={cleaningUp}
        className="w-full rounded-card p-3 text-sm font-semibold min-h-[44px] border bg-gray-50 text-gray-600 border-gray-200 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Eraser size={16} />
        {cleaningUp ? "กำลังล้างรูป..." : "ล้างรูปหลักฐานที่ตรวจสอบแล้ว"}
      </button>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ, รหัสบุคลากร, ภารกิจ..."
          className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ไม่พบ Check-in</p>}

      <div className="space-y-2">
        {filtered.map((row) => {
          const member = one(row.member);
          const mission = one(row.mission);
          const reviewer = one(row.reviewer);
          const isPending = row.proof_status === "pending";
          const isReviewed = row.proof_status === "approved" || row.proof_status === "rejected";
          const busy = busyId === row.id;
          return (
            <div key={row.id} className="rounded-card bg-white shadow-soft p-3 space-y-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {member?.full_name ?? "-"} <span className="text-gray-400 font-normal">· {member?.employee_code}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {mission?.name ?? "-"} ({mission?.level?.toUpperCase()}) · สัปดาห์ {row.campaign_week} · ค่า {row.value.toLocaleString()}
                  {mission?.requires_proof && (
                    <>
                      {" · "}
                      <span className={clsx(isPending && "font-semibold text-amber-600")}>
                        {PROOF_STATUS_LABEL[row.proof_status] ?? row.proof_status}
                      </span>
                    </>
                  )}
                  {!mission?.requires_proof && row.completed_at && " · สำเร็จ"}
                </p>
                <p className="text-xs text-gray-300">{new Date(row.created_at).toLocaleString("th-TH")}</p>

                {row.note && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5 mt-1.5">
                    💬 {row.note}
                  </p>
                )}

                {isReviewed && reviewer && (
                  <p className="text-xs text-gray-400 mt-1">
                    ตรวจโดย <span className="font-medium text-gray-600">{reviewer.full_name}</span>
                    {row.reviewed_at && ` · ${new Date(row.reviewed_at).toLocaleString("th-TH")}`}
                  </p>
                )}
                {row.proof_status === "rejected" && row.rejection_reason && (
                  <p className="text-xs text-red-500 mt-0.5">เหตุผล: {row.rejection_reason}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.proof_url && (
                  <a
                    href={row.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 min-h-[32px] flex items-center gap-1"
                  >
                    <ImageIcon size={14} />
                    ดูรูปหลักฐาน
                  </a>
                )}

                {isPending && (
                  <>
                    <button
                      onClick={() => handleApprove(row)}
                      disabled={busy}
                      className="text-xs font-semibold text-white bg-us rounded-full px-3 py-1.5 min-h-[32px] flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check size={14} />
                      อนุมัติ
                    </button>
                    <button
                      onClick={() => openReject(row)}
                      disabled={busy}
                      className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 min-h-[32px] flex items-center gap-1 disabled:opacity-50"
                    >
                      <XIcon size={14} />
                      ปฏิเสธ
                    </button>
                  </>
                )}

                <button
                  onClick={() => handleDelete(row)}
                  disabled={busy}
                  aria-label="ลบ"
                  className="text-red-400 border border-red-100 rounded-full p-2 min-h-[32px] min-w-[32px] flex items-center justify-center disabled:opacity-50 ml-auto"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {rejectingId === row.id && (
                <div className="rounded-xl bg-red-50 border border-red-100 p-3 space-y-2">
                  <label className="text-xs font-medium text-red-700">เหตุผลที่ปฏิเสธ (ไม่บังคับ แต่แนะนำให้ใส่)</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="เช่น รูปไม่ชัดเจน มองไม่เห็นตัวเลข"
                    className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitReject(row)}
                      disabled={busy}
                      className="flex-1 rounded-full bg-red-500 text-white text-xs font-semibold py-2 min-h-[36px] disabled:opacity-50"
                    >
                      {busy ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
                    </button>
                    <button
                      onClick={() => setRejectingId(null)}
                      className="rounded-full border border-gray-200 text-gray-500 text-xs font-semibold px-4 py-2 min-h-[36px]"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
