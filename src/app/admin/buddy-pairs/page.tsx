"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Pair {
  round_no: number;
  member_a: string;
  name_a: string;
  member_b: string;
  name_b: string;
  next_round: number;
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [{ data: p }, { data: m }, { data: st }] = await Promise.all([
      supabase.rpc("admin_list_forced_pairs"),
      supabase.from("members").select("id, full_name, employee_code").eq("role", "participant").eq("is_active", true).order("full_name"),
      supabase.rpc("admin_buddy_round_status"),
    ]);
    setPairs((p as Pair[]) ?? []);
    setMembers((m as Mem[]) ?? []);
    const nr = (p as Pair[] | null)?.[0]?.next_round ?? (st?.round_no ? Number(st.round_no) + 1 : null);
    setNextRound(nr);
    setRound((r) => r ?? nr);
  }

  useEffect(() => {
    load();
  }, []);

  const pairedInRound = new Set(pairs.filter((x) => x.round_no === round).flatMap((x) => [x.member_a, x.member_b]));

  async function add() {
    if (!a || !b || round == null || busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("admin_add_forced_pair", { p_round_no: round, p_a: a, p_b: b });
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
    setMsg("เพิ่มคู่แล้ว ✓");
    load();
  }

  const opts = (exclude: string) =>
    members
      .filter((m) => m.id !== exclude && !pairedInRound.has(m.id))
      .map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name} ({m.employee_code})
        </option>
      ));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🤝 กำหนดคู่ Buddy ล่วงหน้า</h1>
        <p className="text-xs text-gray-500">
          สมาชิกที่เลือกจับคู่กันเอง แล้วแจ้งแอดมิน ให้กรอกที่นี่ก่อนกดสุ่มจับคู่ ระบบจะจัดคู่เหล่านี้ไว้ก่อน แล้วสุ่มคนที่เหลือตามปกติ (กลุ่มที่กำหนดไว้เป็นคู่เสมอ ไม่ถูกเพิ่มคนที่ 3)
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
          {opts(b)}
        </select>
        <select value={b} onChange={(e) => setB(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          <option value="">เลือกคนที่ 2</option>
          {opts(a)}
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

      <div className="space-y-2">
        <p className="text-xs text-gray-400">คู่ที่กำหนดไว้แล้ว ({pairs.length})</p>
        {pairs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">ยังไม่มี</p>}
        {pairs.map((p) => (
          <div key={`${p.round_no}-${p.member_a}`} className="rounded-card bg-white shadow-soft p-3 flex items-center justify-between gap-2">
            <p className="text-sm text-gray-800">
              {p.name_a} + {p.name_b}
            </p>
            <span className="text-xs text-gray-400 shrink-0">รอบ {p.round_no}</span>
          </div>
        ))}
        <p className="text-[11px] text-gray-400">ถ้ากรอกผิด แจ้งผมให้ลบคู่ได้</p>
      </div>
    </div>
  );
}
