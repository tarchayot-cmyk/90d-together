"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Pair {
  round_no: number;
  names: string;
  next_round: number;
}
interface SignupRow {
  name: string;
  mode: string;
  partner: string | null;
  status: string;
}
interface Mem {
  id: string;
  full_name: string;
  employee_code: string;
}

export default function AdminBuddyPairsPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [members, setMembers] = useState<Mem[]>([]);
  const [nextRound, setNextRound] = useState<number | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signups, setSignups] = useState<{ round_no: number | null; rows: SignupRow[]; not_signed: string[] } | null>(null);

  async function load() {
    const supabase = createClient();
    const [{ data: p }, { data: m }, { data: st }] = await Promise.all([
      supabase.rpc("admin_list_forced_groups"),
      supabase.from("members").select("id, full_name, employee_code").eq("role", "participant").eq("is_active", true).order("full_name"),
      supabase.rpc("admin_buddy_round_status"),
    ]);
    const { data: su } = await supabase.rpc("admin_list_buddy_signups");
    setSignups(su ?? null);
    setPairs((p as Pair[]) ?? []);
    setMembers((m as Mem[]) ?? []);
    const nr = (p as Pair[] | null)?.[0]?.next_round ?? (st?.round_no ? Number(st.round_no) + 1 : null);
    setNextRound(nr);
    setRound((r) => r ?? nr);
  }

  useEffect(() => {
    load();
  }, []);

  const pairedNames = new Set(pairs.filter((x) => x.round_no === round).flatMap((x) => x.names.split(" + ")));

  async function add() {
    if (!a || !b || round == null || busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("admin_add_forced_group", { p_round_no: round, p_members: [a, b, ...(c ? [c] : [])] });
    setBusy(false);
    if (error) {
      setMsg(
        error.message.includes("member_already_paired")
          ? "มีคนใดคนหนึ่งถูกกำหนดคู่ในรอบนี้แล้ว"
          : error.message.includes("same_member")
          ? "เลือกคนเดียวกันสองครั้งไม่ได้"
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }
    setA("");
    setB("");
    setC("");
    setMsg("เพิ่มคู่แล้ว ✓");
    load();
  }

  const opts = (...exclude: string[]) =>
    members
      .filter((m) => !exclude.includes(m.id) && !pairedNames.has(m.full_name))
      .map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name} ({m.employee_code})
        </option>
      ));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🤝 กำหนดคู่/กลุ่ม Buddy ล่วงหน้า</h1>
        <p className="text-xs text-gray-500">
          สมาชิกที่เลือกจับคู่กันเอง แล้วแจ้งแอดมิน ให้กรอกที่นี่ก่อนกดสุ่มจับคู่ ระบบจะจัดคู่เหล่านี้ไว้ก่อน แล้วสุ่มคนที่เหลือตามปกติ (กลุ่มที่กำหนดไว้ใส่ได้ 2 หรือ 3 คน และจะไม่ถูกเพิ่มคนอื่นเข้ามาอีก)
        </p>
      </div>

      <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
        <label className="text-xs text-gray-500 block">
          สำหรับ Buddy รอบที่
          <input
            type="number"
            min={nextRound ?? 1}
            value={round ?? ""}
            onChange={(e) => setRound(Number(e.target.value) || null)}
            className="ml-2 w-16 rounded border border-gray-200 px-2 py-1 text-sm"
          />
          <span className="ml-2 text-gray-400">(รอบถัดไปที่จะจับ = รอบที่ {nextRound ?? "-"})</span>
        </label>
        <select value={a} onChange={(e) => setA(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          <option value="">เลือกคนที่ 1</option>
          {opts(b, c)}
        </select>
        <select value={b} onChange={(e) => setB(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          <option value="">เลือกคนที่ 2</option>
          {opts(a, c)}
        </select>
        <select value={c} onChange={(e) => setC(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          <option value="">คนที่ 3 (ไม่บังคับ — ถ้ากลุ่มมี 3 คน)</option>
          {opts(a, b)}
        </select>
        <button
          onClick={add}
          disabled={!a || !b || busy || round == null}
          className="w-full rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก..." : "เพิ่มคู่"}
        </button>
        {msg && <p className="text-xs text-gray-500">{msg}</p>}
      </div>

      {signups?.round_no != null && (
        <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">📝 สมัครจับคู่ Buddy รอบที่ {signups.round_no} (สมัครใจ)</p>
          <p className="text-xs text-gray-500">
            สมัครแล้ว {signups.rows.filter((r) => r.mode !== "none").length} คน · สุ่ม {signups.rows.filter((r) => r.mode === "random").length} · ขอคู่ตรงกัน{" "}
            {signups.rows.filter((r) => r.status === "mutual").length / 2 || 0} คู่ · รอตอบกลับ {signups.rows.filter((r) => r.status === "waiting").length} · ยังไม่สมัคร {signups.not_signed.length} คน
          </p>
          <ul className="text-xs text-gray-600 space-y-0.5 max-h-48 overflow-y-auto">
            {signups.rows.map((r) => (
              <li key={r.name}>
                {r.name} — {r.mode === "random" ? "สุ่ม" : r.mode === "none" ? "ไม่ขอจับคู่" : `ขอคู่กับ ${r.partner} (${r.status === "mutual" ? "ตรงกัน ✓" : "รอตอบกลับ"})`}
              </li>
            ))}
          </ul>
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">ยังไม่สมัคร ({signups.not_signed.length})</summary>
            <p className="mt-1">{signups.not_signed.join(", ") || "-"}</p>
          </details>
          <p className="text-[11px] text-gray-400">คู่ที่ตรงกันจะถูกจัดไว้ให้อัตโนมัติตอนกดสุ่ม คนที่สุ่ม/ไม่ตรงกันจะถูกสุ่มรวมกัน คนที่ไม่สมัครจะไม่ถูกจับคู่</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-gray-400">กลุ่มที่กำหนดไว้แล้ว ({pairs.length})</p>
        {pairs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">ยังไม่มี</p>}
        {pairs.map((p) => (
          <div key={`${p.round_no}-${p.names}`} className="rounded-card bg-white shadow-soft p-3 flex items-center justify-between gap-2">
            <p className="text-sm text-gray-800">
              {p.names}
            </p>
            <span className="text-xs text-gray-400 shrink-0">รอบ {p.round_no}</span>
          </div>
        ))}
        <p className="text-[11px] text-gray-400">ถ้ากรอกผิด แจ้งผมให้ลบคู่ได้</p>
      </div>
    </div>
  );
}
