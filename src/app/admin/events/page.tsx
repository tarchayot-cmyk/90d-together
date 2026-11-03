"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { THEME_LABEL, fmtEventTime, eventPointsEach } from "@/lib/groupEvents";

interface Ev {
  id: string;
  title: string;
  theme: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: "open" | "completed" | "cancelled";
  series_id: string | null;
  session_no: number;
  rsvp_count: number;
  attended_count: number;
}
interface RosterRow {
  member_id: string;
  full_name: string;
  employee_code: string;
  department: string | null;
  rsvp: boolean;
  attended: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY = { id: "", title: "", theme: "move", description: "", location: "", starts: "", ends: "", capacity: "" };

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<Ev | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rosterBusy, setRosterBusy] = useState(false);
  const [q, setQ] = useState("");
  const [addFor, setAddFor] = useState<Ev | null>(null);
  const [s2, setS2] = useState({ starts: "", ends: "", location: "", capacity: "" });

  async function load() {
    const { data } = await createClient().rpc("admin_list_group_events");
    setEvents((data as Ev[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(status: "open" | "cancelled" = "open") {
    if (!form.title.trim() || !form.starts) {
      setMsg("กรอกชื่อกิจกรรมและวัน-เวลาเริ่ม");
      return;
    }
    setSaving(true);
    setMsg(null);
    const { error } = await createClient().rpc("admin_save_group_event", {
      p_id: form.id || null,
      p_title: form.title.trim(),
      p_theme: form.theme,
      p_description: form.description,
      p_location: form.location,
      p_starts_at: new Date(form.starts).toISOString(),
      p_ends_at: form.ends ? new Date(form.ends).toISOString() : null,
      p_capacity: form.capacity ? Number(form.capacity) : null,
      p_status: status,
    });
    setSaving(false);
    if (error) {
      setMsg("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setMsg(status === "cancelled" ? "ยกเลิกกิจกรรมแล้ว" : "บันทึกแล้ว ✓");
    setForm(EMPTY);
    load();
  }

  async function addSession() {
    if (!addFor || !s2.starts) {
      setMsg("กรอกวัน-เวลาเริ่มของรอบที่เพิ่ม");
      return;
    }
    const { error } = await createClient().rpc("admin_add_event_session", {
      p_event: addFor.id,
      p_starts_at: new Date(s2.starts).toISOString(),
      p_ends_at: s2.ends ? new Date(s2.ends).toISOString() : null,
      p_location: s2.location,
      p_capacity: s2.capacity ? Number(s2.capacity) : null,
    });
    if (error) {
      setMsg("เพิ่มรอบไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setMsg("เพิ่มรอบแล้ว ✓ (สมาชิกเลือกลงชื่อได้รอบเดียว)");
    setAddFor(null);
    setS2({ starts: "", ends: "", location: "", capacity: "" });
    load();
  }

  function edit(e: Ev) {
    setForm({
      id: e.id,
      title: e.title,
      theme: e.theme,
      description: e.description ?? "",
      location: e.location ?? "",
      starts: toLocalInput(e.starts_at),
      ends: toLocalInput(e.ends_at),
      capacity: e.capacity ? String(e.capacity) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openRoster(e: Ev) {
    setRosterFor(e);
    setQ("");
    const { data } = await createClient().rpc("admin_event_roster", { p_event: e.id });
    const rows = (data as RosterRow[]) ?? [];
    setRoster(rows);
    // ถ้ายังไม่เคยเช็กชื่อ ติ๊กคนที่ลงชื่อไว้ให้ก่อน (แอดมินแก้ได้)
    const done = e.status === "completed";
    setChecked(new Set(rows.filter((r) => (done ? r.attended : r.rsvp)).map((r) => r.member_id)));
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveRoster() {
    if (!rosterFor || rosterBusy) return;
    setRosterBusy(true);
    const { error } = await createClient().rpc("admin_set_event_attendance", { p_event: rosterFor.id, p_member_ids: Array.from(checked) });
    setRosterBusy(false);
    if (error) {
      setMsg("บันทึกการเช็กชื่อไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setMsg(`บันทึกแล้ว: ${checked.size} คน คนละ ${eventPointsEach(checked.size)} คะแนน ✓`);
    setRosterFor(null);
    load();
  }

  const shown = roster.filter((r) => !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || r.employee_code.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🎉 กิจกรรมร่วม (ช่วง US)</h1>
        <p className="text-xs text-gray-500">สร้างกิจกรรม ให้สมาชิกลงชื่อ แล้วหลังจบกิจกรรมติ๊กชื่อคนที่มาจริง ระบบให้คะแนนอัตโนมัติ (50 × จำนวนคน สูงสุด 500 ต่อคน ไม่นับเพดานธีม)</p>
      </div>

      <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
        <p className="text-sm font-semibold text-gray-700">{form.id ? "แก้ไขกิจกรรม" : "สร้างกิจกรรมใหม่"}</p>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ชื่อกิจกรรม เช่น เดินป่าดอยสุเทพ" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
        <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          {Object.entries(THEME_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-500 block">
          เริ่ม
          <input type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-2 text-sm mt-0.5" />
        </label>
        <label className="text-xs text-gray-500 block">
          สิ้นสุด (ไม่บังคับ)
          <input type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-2 text-sm mt-0.5" />
        </label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="สถานที่" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="รายละเอียด (ไม่บังคับ)" rows={2} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" />
        <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="จำนวนที่รับลงชื่อ (เว้นว่าง = ไม่จำกัด)" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
        <div className="flex gap-2">
          <button onClick={() => save("open")} disabled={saving} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "สร้างกิจกรรม"}
          </button>
          {form.id && (
            <>
              <button onClick={() => save("cancelled")} disabled={saving} className="rounded-full border border-red-200 text-red-400 px-4 min-h-[44px] text-sm">
                ยกเลิกกิจกรรม
              </button>
              <button onClick={() => setForm(EMPTY)} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">
                ล้างฟอร์ม
              </button>
            </>
          )}
        </div>
        {msg && <p className="text-xs text-gray-500">{msg}</p>}
      </div>

      <div className="space-y-2">
        {events.length === 0 && <p className="text-sm text-gray-400 text-center py-6">ยังไม่มีกิจกรรม</p>}
        {events.map((e) => (
          <div key={e.id} className="rounded-card bg-white shadow-soft p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">
                {THEME_LABEL[e.theme]?.icon} {e.title}
                {e.series_id ? ` (รอบที่ ${e.session_no})` : ""}
              </p>
              <span className="text-[11px] rounded-full bg-gray-50 text-gray-500 px-2 py-0.5 shrink-0">
                {e.status === "open" ? "เปิดลงชื่อ" : e.status === "completed" ? "เช็กชื่อแล้ว" : "ยกเลิก"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {fmtEventTime(e.starts_at)}
              {e.location ? ` · ${e.location}` : ""}
            </p>
            <p className="text-xs text-gray-500">
              ลงชื่อ {e.rsvp_count}
              {e.capacity ? `/${e.capacity}` : ""} คน · มาจริง {e.attended_count} คน
            </p>
            {e.status !== "cancelled" && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => openRoster(e)} className="rounded-full bg-us text-white text-xs font-semibold px-3 py-2 min-h-[36px]">
                  {e.status === "completed" ? "แก้ไขการเช็กชื่อ" : "เช็กชื่อ + ให้คะแนน"}
                </button>
                <button onClick={() => edit(e)} className="rounded-full border border-gray-200 text-gray-500 text-xs px-3 py-2 min-h-[36px]">
                  แก้ไขรายละเอียด
                </button>
                <button onClick={() => { setAddFor(e); setS2({ starts: "", ends: "", location: e.location ?? "", capacity: e.capacity ? String(e.capacity) : "" }); }} className="rounded-full border border-us/40 text-us text-xs px-3 py-2 min-h-[36px]">
                  + เพิ่มรอบ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {addFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setAddFor(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 text-sm">เพิ่มรอบของ “{addFor.title}”</p>
            <p className="text-xs text-gray-500">สมาชิกลงชื่อได้รอบเดียวต่อกิจกรรม · คะแนนนับผู้เข้าร่วมรวมทุกรอบ (คนที่มาทั้งสองรอบได้คะแนนครั้งเดียว)</p>
            <label className="text-xs text-gray-500 block">
              เริ่ม
              <input type="datetime-local" value={s2.starts} onChange={(e) => setS2({ ...s2, starts: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-2 text-sm mt-0.5" />
            </label>
            <label className="text-xs text-gray-500 block">
              สิ้นสุด (ไม่บังคับ)
              <input type="datetime-local" value={s2.ends} onChange={(e) => setS2({ ...s2, ends: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-2 text-sm mt-0.5" />
            </label>
            <input value={s2.location} onChange={(e) => setS2({ ...s2, location: e.target.value })} placeholder="สถานที่" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
            <input type="number" min={1} value={s2.capacity} onChange={(e) => setS2({ ...s2, capacity: e.target.value })} placeholder="จำนวนที่รับ (เว้นว่าง = ไม่จำกัด)" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
            <div className="flex gap-2">
              <button onClick={addSession} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px]">เพิ่มรอบ</button>
              <button onClick={() => setAddFor(null)} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {rosterFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setRosterFor(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 space-y-2">
              <p className="font-semibold text-gray-800 text-sm">{rosterFor.title}</p>
              <p className="text-xs text-gray-500">
                ติ๊กคนที่มาจริง (รวมคนที่ไม่ได้ลงชื่อไว้) · มา {checked.size} คน = คนละ <b>{eventPointsEach(checked.size)}</b> คะแนน
              </p>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ/รหัส" className="w-full rounded-full border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <ul className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {shown.map((r) => (
                <li key={r.member_id}>
                  <label className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] cursor-pointer">
                    <input type="checkbox" checked={checked.has(r.member_id)} onChange={() => toggle(r.member_id)} />
                    <span className="flex-1 text-sm text-gray-800">
                      {r.full_name} <span className="text-xs text-gray-400">{r.employee_code}</span>
                    </span>
                    {r.rsvp && <span className="text-[10px] rounded-full bg-pastel-green text-us px-2 py-0.5">ลงชื่อไว้</span>}
                  </label>
                </li>
              ))}
            </ul>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <button onClick={saveRoster} disabled={rosterBusy} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50">
                {rosterBusy ? "กำลังบันทึก..." : "บันทึกและให้คะแนน"}
              </button>
              <button onClick={() => setRosterFor(null)} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
