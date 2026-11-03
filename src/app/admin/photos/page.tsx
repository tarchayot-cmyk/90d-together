"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { buildZip, type ZipEntry } from "@/lib/zipStore";

interface Row {
  id: string;
  proof_status: string;
  proof_urls: string[] | null;
  created_at: string;
  member: { full_name: string; employee_code: string } | { full_name: string; employee_code: string }[] | null;
  mission: { name: string } | { name: string }[] | null;
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const IMG = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const PART_SIZE = 150;
const MARK = "/storage/v1/object/public/proofs/";
const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);

interface Group {
  name: string;
  rows: Row[];
  files: number;
  pending: number;
}

export default function AdminPhotosPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("check_ins")
        .select("id, proof_status, proof_urls, created_at, member:members!check_ins_member_id_fkey(full_name, employee_code), mission:missions(name)")
        .not("proof_urls", "is", null)
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) {
        setMsg("โหลดรายการไม่สำเร็จ กรุณาลองใหม่");
        break;
      }
      all.push(...((data as unknown as Row[]) ?? []));
      if (!data || data.length < 1000) break;
    }
    setRows(all.filter((r) => (r.proof_urls ?? []).some((u) => IMG.test(u.split("?")[0]))));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const name = one(r.mission)?.name ?? "(ไม่ทราบภารกิจ)";
      const g = m.get(name) ?? { name, rows: [], files: 0, pending: 0 };
      g.rows.push(r);
      g.files += (r.proof_urls ?? []).filter((u) => IMG.test(u.split("?")[0])).length;
      if (r.proof_status === "pending") g.pending += 1;
      m.set(name, g);
    }
    return Array.from(m.values()).sort((a, b) => b.files - a.files);
  }, [rows]);

  function listFiles(g: Group) {
    const out: { url: string; name: string }[] = [];
    let n = 0;
    for (const r of g.rows) {
      const mem = one(r.member);
      const day = new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
      for (const u of r.proof_urls ?? []) {
        const clean = u.split("?")[0];
        if (!IMG.test(clean)) continue;
        n += 1;
        const ext = clean.match(/\.(\w+)$/)![1].toLowerCase();
        out.push({ url: clean, name: `${safe(g.name)}/${day}_${mem?.employee_code ?? "x"}_${safe(mem?.full_name ?? "")}_${String(n).padStart(4, "0")}.${ext}` });
      }
    }
    return out;
  }

  async function download(g: Group) {
    if (busy) return;
    setBusy(g.name);
    setMsg(null);
    const files = listFiles(g);
    const parts = Math.ceil(files.length / PART_SIZE);
    let failed = 0;
    try {
      for (let p = 0; p < parts; p++) {
        const slice = files.slice(p * PART_SIZE, (p + 1) * PART_SIZE);
        const entries: ZipEntry[] = [];
        for (let i = 0; i < slice.length; i++) {
          setProgress(`ส่วนที่ ${p + 1}/${parts} · ดึงรูป ${i + 1}/${slice.length}`);
          try {
            const res = await fetch(slice[i].url);
            if (!res.ok) throw new Error(String(res.status));
            entries.push({ name: slice[i].name, data: new Uint8Array(await res.arrayBuffer()) });
          } catch {
            failed += 1;
          }
        }
        const blob = buildZip(entries);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${safe(g.name)}${parts > 1 ? `_part${p + 1}` : ""}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
        await new Promise((r) => setTimeout(r, 800));
      }
    } finally {
      setBusy(null);
      setProgress("");
    }
    if (failed === 0) {
      setDone((s) => new Set(s).add(g.name));
      setMsg(`ดาวน์โหลด “${g.name}” ครบ ${files.length} รูป (${parts} ไฟล์ ZIP) — ตรวจไฟล์ในเครื่องก่อน แล้วค่อยกดลบ`);
    } else {
      setMsg(`ดาวน์โหลด “${g.name}” ไม่ครบ (พลาด ${failed} รูป) จึงยังไม่เปิดให้ลบ — กดดาวน์โหลดใหม่`);
    }
  }

  async function remove(g: Group) {
    if (busy || !done.has(g.name)) return;
    const targets = g.rows.filter((r) => r.proof_status !== "pending");
    const paths = targets.flatMap((r) => r.proof_urls ?? []).filter((u) => IMG.test(u.split("?")[0])).map((u) => u.split(MARK)[1]?.split("?")[0]).filter(Boolean) as string[];
    if (!window.confirm(`ลบรูปของ “${g.name}” จำนวน ${paths.length} รูปออกจากระบบถาวร?\n(คะแนนและสติ๊กเกอร์ไม่กระทบ · รายการที่ยังรอตรวจจะไม่ถูกลบ)\n\nดาวน์โหลดและตรวจไฟล์ในเครื่องแล้วใช่ไหม?`)) return;
    setBusy(g.name);
    setMsg(null);
    const supabase = createClient();
    for (let i = 0; i < paths.length; i += 200) {
      setProgress(`กำลังลบ ${Math.min(i + 200, paths.length)}/${paths.length}`);
      const { error } = await supabase.storage.from("proofs").remove(paths.slice(i, i + 200));
      if (error) {
        setBusy(null);
        setProgress("");
        setMsg("ลบไฟล์ไม่สำเร็จ (บางไฟล์อาจถูกลบไปแล้ว) กรุณาลองใหม่");
        return;
      }
    }
    const { error: rpcErr } = await supabase.rpc("admin_clear_proof_urls", { p_checkin_ids: targets.map((r) => r.id) });
    setBusy(null);
    setProgress("");
    setMsg(rpcErr ? "ลบไฟล์แล้ว แต่ล้างลิงก์ในฐานข้อมูลไม่สำเร็จ — แจ้งผมได้เลย" : `ลบรูปของ “${g.name}” เรียบร้อย ${paths.length} รูป ✓`);
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🖼 ดาวน์โหลดรูปแยกตามภารกิจ</h1>
        <p className="text-xs text-gray-500">
          กดดาวน์โหลดเป็น ZIP ต่อภารกิจ (แบ่งไฟล์ละ {PART_SIZE} รูป) ชื่อไฟล์ = วันที่_รหัส_ชื่อ · ปุ่มลบจะเปิดให้หลังดาวน์โหลดครบเท่านั้น · ไม่รวมคลิปวิดีโอ
        </p>
      </div>
      {msg && <p className="text-xs rounded-card bg-white shadow-soft p-3 text-gray-700">{msg}</p>}
      {busy && <p className="text-xs text-us">⏳ {busy} · {progress} (อย่าปิดหน้านี้)</p>}
      {loading && <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>}
      {groups.map((g) => (
        <div key={g.name} className="rounded-card bg-white shadow-soft p-3 space-y-1.5">
          <p className="text-sm font-semibold text-gray-800">{g.name}</p>
          <p className="text-xs text-gray-500">
            {g.files} รูป ({g.rows.length} รายการ){g.pending > 0 ? ` · รอตรวจ ${g.pending} (จะไม่ถูกลบ)` : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={() => download(g)} disabled={!!busy} className="rounded-full bg-us text-white text-xs font-semibold px-3 py-2 min-h-[36px] disabled:opacity-50">
              {done.has(g.name) ? "ดาวน์โหลดอีกครั้ง" : "⬇ ดาวน์โหลด ZIP"}
            </button>
            <button onClick={() => remove(g)} disabled={!!busy || !done.has(g.name)} className="rounded-full border border-red-200 text-red-400 text-xs px-3 py-2 min-h-[36px] disabled:opacity-40">
              🗑 ลบรูปภารกิจนี้
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
