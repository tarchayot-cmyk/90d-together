"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

interface Signup {
  available: boolean;
  round_no?: number;
  mode?: "unset" | "random" | "partner" | "none";
  partner_id?: string | null;
  partner_name?: string | null;
  status?: "mutual" | "waiting" | null;
}
interface Candidate {
  id: string;
  name: string;
}

async function fetchSignup(): Promise<Signup> {
  const { data } = await createClient().rpc("get_my_buddy_signup");
  return (data as Signup) ?? { available: false };
}

// สมัครจับคู่ Buddy ช่วง US (สมัครใจ) — แสดงเมื่อฐานข้อมูลเปิดให้สมัครเท่านั้น
export default function BuddySignupCard() {
  const { data, mutate } = useSWR("buddy-signup", fetchSignup, { revalidateOnFocus: false });
  const [mode, setMode] = useState<"random" | "partner" | "none">("random");
  const [partner, setPartner] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.available) return;
    if (data.mode && data.mode !== "unset") setMode(data.mode);
    setPartner(data.partner_id ?? "");
    createClient()
      .rpc("list_signup_candidates")
      .then(({ data: c }) => setCands((c as Candidate[]) ?? []));
  }, [data?.available, data?.mode, data?.partner_id]);

  if (!data?.available) return null;

  async function save() {
    if (busy) return;
    if (mode === "partner" && !partner) {
      setMsg("เลือกชื่อคนที่อยากเป็นบัดดี้ด้วย");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("set_my_buddy_signup", { p_mode: mode, p_partner: mode === "partner" ? partner : null });
    setBusy(false);
    if (error) {
      setMsg("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setMsg("บันทึกแล้ว ✓ (เปลี่ยนใจได้จนกว่าจะปิดรับสมัคร)");
    mutate();
  }

  const saved = data.mode && data.mode !== "unset";
  const OPTIONS: { v: "random" | "partner" | "none"; label: string }[] = [
    { v: "random", label: "🎲 สุ่มให้" },
    { v: "partner", label: "👥 ขอคู่กับคนที่ระบุ" },
    { v: "none", label: "ไม่ขอจับคู่" },
  ];

  return (
    <section className="rounded-card bg-white shadow-soft p-4 space-y-2">
      <h2 className="font-semibold text-gray-800 text-sm">🤝 สมัครจับคู่ Buddy ช่วง US</h2>
      <p className="text-xs text-gray-500">
        ช่วง US จับคู่ตามความสมัครใจ อยู่ด้วยกันจนจบช่วง US (14 พ.ย. – 13 ธ.ค.) ถ้าไม่สมัคร จะไม่ถูกจับคู่ ถ้าขอคู่กับคนที่ระบุ ต้องให้อีกฝ่ายเลือกคุณกลับด้วยจึงจะได้คู่กัน ถ้าไม่ตรงกัน ระบบจะสุ่มให้
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={busy}
            onClick={() => setMode(o.v)}
            className={clsx(
              "rounded-xl py-2 text-xs font-medium min-h-[44px] border px-1",
              mode === o.v ? "bg-us text-white border-us" : "bg-white text-gray-600 border-gray-200"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === "partner" && (
        <select value={partner} onChange={(e) => setPartner(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          <option value="">เลือกคนที่อยากเป็นบัดดี้ด้วย</option>
          {cands.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button onClick={save} disabled={busy} className="w-full rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50">
        {busy ? "กำลังบันทึก..." : saved ? "บันทึกการเปลี่ยนแปลง" : "ยืนยันการสมัคร"}
      </button>
      {saved && data.mode === "partner" && data.partner_name && (
        <p className="text-xs text-gray-600">
          {data.status === "mutual"
            ? `✅ ตรงกันแล้ว: คุณกับ ${data.partner_name}`
            : `⏳ รอ ${data.partner_name} เลือกคุณกลับ (ถ้าไม่ตรงกัน ระบบจะสุ่มให้)`}
        </p>
      )}
      {saved && data.mode === "random" && <p className="text-xs text-gray-600">สมัครแล้ว: ให้ระบบสุ่มคู่ให้</p>}
      {saved && data.mode === "none" && <p className="text-xs text-gray-600">ตอนนี้ตั้งไว้ว่า ไม่ขอจับคู่ในช่วง US</p>}
      {!saved && <p className="text-xs text-amber-600">ยังไม่ได้ตอบ — ถ้าไม่สมัคร จะไม่ถูกจับคู่ในช่วง US</p>}
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </section>
  );
}
