// ดาวน์โหลดรูปหลักฐานทั้งหมด แยกโฟลเดอร์ตามภารกิจ (ไม่ลบอะไรทั้งสิ้น)
// ใช้: node scripts/download-proofs.mjs   (ต้องใช้ Node 18 ขึ้นไป)
// ใส่รหัสพนักงานแอดมินและรหัสผ่านตามที่ถาม — ใช้ล็อกอินอ่านรายการเท่านั้น ไม่ถูกเก็บ
import { mkdir, writeFile, access } from "node:fs/promises";
import readline from "node:readline/promises";
import path from "node:path";

const URL_BASE = "https://pjqrrpmcfkawpvhneehd.supabase.co";
const ANON = "sb_publishable_JPlUl1BL_SHmU2L4QhjaEw_xW6emhcY";
const DOMAIN = "employee.growtogether.local";
const OUT = process.argv[2] || "proof-photos";
const IMG = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const safe = (s) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question("รหัสพนักงานแอดมิน (เช่น EMP001): ")).trim();
const password = await rl.question("รหัสผ่าน: ");
rl.close();

const auth = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `${code.toLowerCase()}@${DOMAIN}`, password }),
});
if (!auth.ok) {
  console.error("ล็อกอินไม่สำเร็จ:", await auth.text());
  process.exit(1);
}
const { access_token: token } = await auth.json();
const H = { apikey: ANON, Authorization: `Bearer ${token}` };

const rows = [];
for (let from = 0; ; from += 1000) {
  const q =
    "select=id,created_at,proof_urls,member:members!check_ins_member_id_fkey(full_name,employee_code),mission:missions(name)" +
    "&proof_urls=not.is.null&order=created_at.asc";
  const r = await fetch(`${URL_BASE}/rest/v1/check_ins?${q}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
  if (!r.ok) {
    console.error("ดึงรายการไม่สำเร็จ:", await r.text());
    process.exit(1);
  }
  const part = await r.json();
  rows.push(...part);
  if (part.length < 1000) break;
}

const jobs = [];
const counter = new Map();
for (const r of rows) {
  const mission = safe(r.mission?.name ?? "ไม่ทราบภารกิจ");
  const day = new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  for (const u of r.proof_urls ?? []) {
    const clean = u.split("?")[0];
    if (!IMG.test(clean)) continue;
    const n = (counter.get(mission) ?? 0) + 1;
    counter.set(mission, n);
    const ext = clean.match(/\.(\w+)$/)[1].toLowerCase();
    const file = `${day}_${r.member?.employee_code ?? "x"}_${safe(r.member?.full_name ?? "")}_${String(n).padStart(4, "0")}.${ext}`;
    jobs.push({ url: clean, file: path.join(OUT, mission, file), mission });
  }
}
console.log(`พบรูป ${jobs.length} รูป ใน ${counter.size} ภารกิจ → โฟลเดอร์ ${path.resolve(OUT)}`);

let ok = 0, skipped = 0, gone = 0;
const failed = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    try {
      await access(j.file);
      skipped++;
      continue;
    } catch {}
    try {
      const res = await fetch(j.url);
      if (res.status === 400 || res.status === 404) {
        gone++; // ไฟล์ถูกลบไปจากระบบก่อนหน้านี้แล้ว ไม่ใช่ความผิดพลาด
        continue;
      }
      if (!res.ok) throw new Error(res.status);
      await mkdir(path.dirname(j.file), { recursive: true });
      await writeFile(j.file, Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (e) {
      failed.push(j.url);
    }
    if ((ok + skipped + gone + failed.length) % 100 === 0) console.log(`  ${ok + skipped + gone + failed.length}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`\nเสร็จ: ดาวน์โหลดใหม่ ${ok} · มีอยู่แล้ว ${skipped} · ไฟล์ไม่มีในระบบแล้ว ${gone} · ล้มเหลวจริง ${failed.length} จากทั้งหมด ${jobs.length}`);
if (failed.length) {
  await writeFile(path.join(OUT, "_failed.txt"), failed.join("\n"));
  console.log("รายการที่พลาดอยู่ใน _failed.txt — รันสคริปต์ซ้ำได้ (ข้ามไฟล์ที่มีแล้ว)");
}
