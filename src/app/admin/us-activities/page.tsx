"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { THEME_LABEL } from "@/lib/groupEvents";

interface Act {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  source: string;
  status: "active" | "pending" | "rejected" | "archived";
  proposed_by: string | null;
  proposers?: string[] | null;
  logs: number;
}
interface Log {
  id: string;
  title: string;
  theme: string;
  status: "pending" | "approved" | "rejected";
  round_no: number;
  created_at: string;
  occurred_on: string;
  note: string | null;
  video_urls: string[];
  reject_reason: string | null;
  submitter: string;
  participants: { id: string; name: string; points: number; group: string | null }[];
}

const dateFmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const EMPTY = { id: "", title: "", description: "", theme: "move", status: "active" as Act["status"] };
const ST: Record<string, string> = { pending: "รอตรวจ", approved: "อนุมัติแล้ว", rejected: "ไม่ผ่าน/ยึดคืน" };

export default function AdminUsActivitiesPage() {
  const [tab, setTab] = useState<"logs" | "acts">("logs");
  const [logFilter, setLogFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [logs, setLogs] = useState<Log[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [propFilter, setPropFilter] = useState<"pending" | "active" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<Log | null>(null);
  const [cands, setCands] = useState<{ id: string; name: string; group: string | null }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  async function openEdit(l: Log) {
    if (cands.length === 0) {
      const { data } = await createClient().rpc("admin_list_us_candidates");
      setCands((data as typeof cands) ?? []);
    }
    setPicked(new Set(l.participants.map((p) => p.id)));
    setQ("");
    setEditLog(l);
  }

  async function saveEdit() {
    if (!editLog || busy) return;
    if (picked.size < 3) return setMsg("ต้องมีผู้เข้าร่วมอย่างน้อย 3 คน");
    setBusy(editLog.id);
    const { data, error } = await createClient().rpc("admin_set_us_log_participants", { p_log: editLog.id, p_members: Array.from(picked) });
    setBusy(null);
    if (error) {
      const m = error.message;
      return setMsg(
        m.includes("duplicate_participant")
          ? "มีคนในรายชื่อที่ถูกติ๊กในกิจกรรมนี้ของวันเดียวกันแล้ว: " + m.split(":").slice(1).join(":").trim()
          : m.includes("not_pending")
            ? "รายการนี้ไม่ได้อยู่ในสถานะรอตรวจแล้ว กรุณารีเฟรช"
            : "แก้ไขรายชื่อไม่สำเร็จ",
      );
    }
    setMsg(`แก้ไขรายชื่อแล้ว ✓ (เพิ่ม ${data?.added ?? 0} · นำออก ${data?.removed ?? 0}) — กดอนุมัติเพื่อแจกคะแนนตามรายชื่อใหม่`);
    setEditLog(null);
    loadLogs();
  }

  async function reopen(l: Log) {
    if (busy || !window.confirm(`ดึงคะแนนของ “${l.title}” คืนและเปิดกลับเป็น “รอตรวจ” เพื่อแก้รายชื่อ?`)) return;
    setBusy(l.id);
    const { error } = await createClient().rpc("admin_reopen_us_log", { p_log: l.id });
    setBusy(null);
    setMsg(error ? "เปิดกลับไม่สำเร็จ" : "ดึงคะแนนคืนและเปิดกลับเป็นรอตรวจแล้ว — ไปแท็บ “รอตรวจ” เพื่อแก้รายชื่อแล้วอนุมัติใหม่");
    loadLogs();
  }

  async function loadLogs(f = logFilter) {
    const { data } = await createClient().rpc("admin_list_us_logs", { p_status: f });
    setLogs((data as Log[]) ?? []);
  }
  async function loadActs() {
    const { data } = await createClient().rpc("admin_list_us_activities");
    setActs((data as Act[]) ?? []);
  }
  useEffect(() => {
    loadLogs();
    loadActs();
  }, []);

  async function review(l: Log, approve: boolean) {
    if (busy) return;
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("เหตุผลที่ไม่ผ่าน (แสดงให้ผู้ส่งเห็น)", "") ;
      if (reason === null) return;
    }
    setBusy(l.id);
    const { data, error } = await createClient().rpc("admin_review_us_log", { p_log: l.id, p_approve: approve, p_reason: reason });
    setBusy(null);
    if (error) return setMsg("ทำรายการไม่สำเร็จ (อาจมีคนตรวจไปแล้ว) กรุณารีเฟรช");
    setMsg(approve ? `อนุมัติแล้ว ✓ แจกคะแนนรวม ${data?.points_total ?? 0} คะแนน` : "บันทึกว่าไม่ผ่านแล้ว");
    loadLogs();
  }

  async function revoke(l: Log) {
    if (busy || !window.confirm(`ยึดคะแนนของ “${l.title}” คืนทั้งหมด?`)) return;
    const reason = window.prompt("เหตุผล", "") ?? "";
    setBusy(l.id);
    const { error } = await createClient().rpc("admin_revoke_us_log", { p_log: l.id, p_reason: reason });
    setBusy(null);
    setMsg(error ? "ยึดคะแนนคืนไม่สำเร็จ" : "ยึดคะแนนคืนแล้ว");
    loadLogs();
  }

  async function saveAct(status?: Act["status"], a?: Act) {
    const src = a ? { id: a.id, title: a.title, description: a.description ?? "", theme: a.theme } : form;
    if (!src.title.trim()) return setMsg("กรอกชื่อกิจกรรม");
    const { error } = await createClient().rpc("admin_save_us_activity", {
      p_id: src.id || null,
      p_title: src.title,
      p_description: src.description,
      p_theme: src.theme,
      p_status: status ?? form.status,
    });
    if (error) return setMsg("บันทึกไม่สำเร็จ");
    setMsg("บันทึกแล้ว ✓");
    setForm(EMPTY);
    loadActs();
  }

  const pendingActs = acts.filter((a) => a.status === "pending");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🌳 กิจกรรมร่วมช่วง US</h1>
        <p className="text-xs text-gray-500">ตรวจวิดีโอที่สมาชิกส่ง → อนุมัติแล้วระบบแจกคะแนนทุกคนที่ถูกติ๊กอัตโนมัติ · อนุมัติกิจกรรมที่เพื่อนเสนอ</p>
      </div>
      <div className="flex gap-2">
        {([["logs", "ตรวจเช็กอิน"], ["acts", `กิจกรรม${pendingActs.length ? ` (รออนุมัติ ${pendingActs.length})` : ""}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm min-h-[40px] ${tab === k ? "bg-us text-white font-semibold" : "bg-white text-gray-500 shadow-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      {msg && <p className="text-xs rounded-card bg-white shadow-soft p-3 text-gray-700">{msg}</p>}

      {tab === "logs" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["pending", "approved", "rejected"] as const).map((f) => (
              <button key={f} onClick={() => { setLogFilter(f); loadLogs(f); }} className={`rounded-full px-3 py-1.5 text-xs ${logFilter === f ? "bg-us/10 text-us font-semibold" : "bg-white text-gray-500 shadow-soft"}`}>
                {ST[f]}
              </button>
            ))}
          </div>
          {logs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">ไม่มีรายการ</p>}
          {logs.map((l) => (
            <div key={l.id} className="rounded-card bg-white shadow-soft p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">
                  {THEME_LABEL[l.theme]?.icon} {l.title}
                </p>
                <span className="text-[11px] rounded-full bg-gray-50 text-gray-500 px-2 py-0.5 shrink-0">รอบ {l.round_no}</span>
              </div>
              <p className="text-xs text-gray-500">
                ส่งโดย {l.submitter} · {dateFmt.format(new Date(l.created_at))} · {l.participants.length} คน
              </p>
              <p className="text-xs text-gray-600">
                {l.participants.map((p) => `${p.name}${p.group ? ` (${p.group.replace("Buddy ", "ก.")})` : ""}${l.status === "approved" ? ` +${p.points}` : ""}`).join(" · ")}
              </p>
              {l.note && <p className="text-xs text-gray-500">📝 {l.note}</p>}
              {l.reject_reason && <p className="text-xs text-red-400">เหตุผล: {l.reject_reason}</p>}
              <div className="grid grid-cols-1 gap-2">
                {l.video_urls.map((u) =>
                  /\.(jpe?g|png|webp|gif|heic|heif|avif)(\?|$)/i.test(u) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="หลักฐาน" className="w-full rounded-lg bg-gray-50 max-h-72 object-contain" />
                    </a>
                  ) : (
                    <video key={u} src={u} controls preload="metadata" className="w-full rounded-lg bg-black max-h-64" />
                  ),
                )}
              </div>
              {l.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => review(l, true)} disabled={busy === l.id} className="flex-1 rounded-full bg-us text-white text-sm font-semibold py-2 min-h-[40px] disabled:opacity-50">
                    ✓ อนุมัติและแจกคะแนน
                  </button>
                  <button onClick={() => openEdit(l)} disabled={busy === l.id} className="rounded-full border border-gray-200 text-gray-600 text-sm px-4 min-h-[40px]">
                    ✏️ แก้รายชื่อ
                  </button>
                  <button onClick={() => review(l, false)} disabled={busy === l.id} className="rounded-full border border-red-200 text-red-400 text-sm px-4 min-h-[40px]">
                    ไม่ผ่าน
                  </button>
                </div>
              )}
              {l.status === "approved" && (
                <div className="flex gap-2">
                  <button onClick={() => reopen(l)} disabled={busy === l.id} className="rounded-full border border-gray-200 text-gray-600 text-xs px-3 py-2 min-h-[36px]">
                    ✏️ เปิดกลับมาแก้รายชื่อ
                  </button>
                  <button onClick={() => revoke(l)} disabled={busy === l.id} className="rounded-full border border-red-200 text-red-400 text-xs px-3 py-2 min-h-[36px]">
                    ยึดคะแนนคืน
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "acts" && (
        <div className="space-y-3">
          <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">💡 กิจกรรมที่สมาชิกเสนอ</p>
            <div className="flex gap-2">
              {([["pending", "รออนุมัติ"], ["active", "อนุมัติแล้ว"], ["rejected", "ไม่อนุมัติ"]] as const).map(([k, label]) => {
                const n = acts.filter((a) => a.source === "member" && (k === "active" ? a.status === "active" || a.status === "archived" : a.status === k)).length;
                return (
                  <button key={k} onClick={() => setPropFilter(k)} className={`rounded-full px-3 py-1.5 text-xs ${propFilter === k ? "bg-us/10 text-us font-semibold" : "bg-gray-50 text-gray-500"}`}>
                    {label} ({n})
                  </button>
                );
              })}
            </div>
            {acts
              .filter((a) => a.source === "member" && (propFilter === "active" ? a.status === "active" || a.status === "archived" : a.status === propFilter))
              .map((a) => (
                <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${a.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"}`}>
                  <p className="text-sm font-semibold text-gray-800">
                    {THEME_LABEL[a.theme]?.icon} {a.title}
                    {a.status === "archived" && <span className="ml-1 text-[10px] text-gray-400">(ปิดแล้ว)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    เสนอโดย {a.proposed_by}
                    {a.proposers && a.proposers.length > 0 ? ` · ผู้ร่วมเสนอ ${a.proposers.length} คน: ${a.proposers.join(", ")}` : ""}
                    {a.description ? ` · ${a.description}` : ""}
                  </p>
                  {a.status === "pending" && (
                    <div className="flex gap-2 items-center">
                      <select defaultValue={a.theme} onChange={(e) => (a.theme = e.target.value)} className="rounded border border-gray-200 px-2 py-2 text-sm bg-white">
                        {Object.entries(THEME_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.icon} {v.label}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => saveAct("active", a)} className="rounded-full bg-us text-white text-sm font-semibold px-4 min-h-[40px]">
                        อนุมัติ
                      </button>
                      <button onClick={() => saveAct("rejected", a)} className="rounded-full border border-red-200 text-red-400 text-sm px-4 min-h-[40px]">
                        ไม่อนุมัติ
                      </button>
                    </div>
                  )}
                  {a.status === "rejected" && (
                    <button onClick={() => saveAct("active", a)} className="rounded-full bg-us text-white text-xs font-semibold px-4 min-h-[36px]">
                      อนุมัติย้อนหลัง
                    </button>
                  )}
                  {a.status === "active" && (
                    <button onClick={() => saveAct("archived", a)} className="rounded-full border border-gray-200 text-gray-500 text-xs px-4 min-h-[36px]">
                      ปิดกิจกรรมนี้
                    </button>
                  )}
                  {a.status === "archived" && (
                    <button onClick={() => saveAct("active", a)} className="rounded-full bg-us text-white text-xs font-semibold px-4 min-h-[36px]">
                      เปิดใช้อีกครั้ง
                    </button>
                  )}
                </div>
              ))}
            {acts.filter((a) => a.source === "member" && (propFilter === "active" ? a.status === "active" || a.status === "archived" : a.status === propFilter)).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">ไม่มีรายการ</p>
            )}
          </div>

          <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">{form.id ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรมใหม่"}</p>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ชื่อกิจกรรม" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="รายละเอียด" rows={2} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="flex-1 rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
                {Object.entries(THEME_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Act["status"] })} className="rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
                <option value="active">เปิดใช้</option>
                <option value="archived">ปิด</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveAct()} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px]">
                {form.id ? "บันทึก" : "เพิ่มกิจกรรม"}
              </button>
              {form.id && (
                <button onClick={() => setForm(EMPTY)} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">
                  ล้างฟอร์ม
                </button>
              )}
            </div>
          </div>

          {acts.filter((a) => a.source !== "member").map((a) => (
            <div key={a.id} className="rounded-card bg-white shadow-soft p-3 flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gray-800">
                  {THEME_LABEL[a.theme]?.icon} {a.title}
                </p>
                <p className="text-xs text-gray-500">
                  {a.status === "active" ? "เปิดใช้" : a.status === "archived" ? "ปิดแล้ว" : "ไม่อนุมัติ"}
                  {a.source === "member" ? ` · เพื่อนเสนอ (${a.proposed_by})` : ""} · อนุมัติแล้ว {a.logs} ครั้ง
                </p>
              </div>
              <button
                onClick={() => { setForm({ id: a.id, title: a.title, description: a.description ?? "", theme: a.theme, status: a.status === "archived" ? "archived" : "active" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="rounded-full border border-gray-200 text-gray-500 text-xs px-3 py-2 min-h-[36px] shrink-0"
              >
                แก้ไข
              </button>
            </div>
          ))}
        </div>
      )}

      {editLog && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setEditLog(null)}>
          <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-4 space-y-3 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 text-sm">แก้รายชื่อผู้เข้าร่วม · {editLog.title}</p>
            <p className="text-xs text-gray-500">เลือกแล้ว {picked.size} คน (ขั้นต่ำ 3) · ส่งโดย {editLog.submitter}</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
            <div className="overflow-y-auto space-y-1 flex-1">
              {cands
                .filter((c) => !q.trim() || c.name.includes(q.trim()))
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() => {
                        const n = new Set(picked);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        setPicked(n);
                      }}
                    />
                    <span className="flex-1">{c.name}</span>
                    {c.group && <span className="text-[10px] text-gray-400">{c.group.replace("Buddy ", "ก.")}</span>}
                  </label>
                ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={busy === editLog.id} className="flex-1 rounded-full bg-us text-white text-sm font-semibold min-h-[44px] disabled:opacity-50">
                บันทึกรายชื่อ
              </button>
              <button onClick={() => setEditLog(null)} className="rounded-full border border-gray-200 text-gray-500 text-sm px-5 min-h-[44px]">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
