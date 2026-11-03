// ลบรูปหลักฐานที่ตรวจแล้ว (approved/rejected/not_required) ออกจาก Supabase Storage แล้วล้างลิงก์ในฐานข้อมูล
// ไม่ลบ: รูปที่ยังรอตรวจ, คลิปวิดีโอ · คะแนน/สติ๊กเกอร์ไม่กระทบ · กู้คืนไม่ได้
// ใช้: node scripts/delete-proofs.mjs            (แสดงจำนวนที่จะลบเฉยๆ ยังไม่ลบ)
//      node scripts/delete-proofs.mjs --confirm  (ลบจริง ต้องพิมพ์ยืนยันอีกครั้ง)
import readline from "node:readline/promises";

const URL_BASE = "https://pjqrrpmcfkawpvhneehd.supabase.co";
const ANON = "sb_publishable_JPlUl1BL_SHmU2L4QhjaEw_xW6emhcY";
const DOMAIN = "employee.growtogether.local";
const MARK = "/storage/v1/object/public/proofs/";
const IMG = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const REAL = process.argv.includes("--confirm");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question("รหัสพนักงานแอดมิน (เช่น EMP001): ")).trim();
const password = await rl.question("รหัสผ่าน: ");

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
const H = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const rows = [];
for (let from = 0; ; from += 1000) {
  const q = "select=id,proof_status,proof_urls&proof_urls=not.is.null&proof_status=in.(approved,rejected,not_required)&order=created_at.asc";
  const r = await fetch(`${URL_BASE}/rest/v1/check_ins?${q}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
  if (!r.ok) {
    console.error("ดึงรายการไม่สำเร็จ:", await r.text());
    process.exit(1);
  }
  const part = await r.json();
  rows.push(...part);
  if (part.length < 1000) break;
}

const targets = rows.filter((r) => (r.proof_urls ?? []).some((u) => IMG.test(u.split("?")[0])));
const paths = targets.flatMap((r) => r.proof_urls ?? []).filter((u) => IMG.test(u.split("?")[0])).map((u) => decodeURIComponent(u.split(MARK)[1]?.split("?")[0] ?? "")).filter(Boolean);
console.log(`\nจะลบรูป ${paths.length} รูป จาก ${targets.length} รายการเช็กอิน (รวมลิงก์ที่ไฟล์หายไปแล้ว)`);

if (!REAL) {
  console.log("นี่คือการตรวจเฉยๆ ยังไม่ได้ลบอะไร — ถ้าตรวจไฟล์ในเครื่องครบแล้ว รันใหม่ด้วย --confirm");
  rl.close();
  process.exit(0);
}
const ans = await rl.question('ลบถาวร กู้คืนไม่ได้ — พิมพ์คำว่า DELETE เพื่อยืนยัน: ');
rl.close();
if (ans.trim() !== "DELETE") {
  console.log("ยกเลิก ไม่ได้ลบอะไร");
  process.exit(0);
}

let removed = 0;
for (let i = 0; i < paths.length; i += 100) {
  const batch = paths.slice(i, i + 100);
  const r = await fetch(`${URL_BASE}/storage/v1/object/proofs`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: batch }) });
  if (!r.ok) {
    console.error(`ลบไม่สำเร็จที่ชุด ${i}-${i + batch.length}:`, await r.text());
    console.error("หยุดทำงาน — รันซ้ำได้ (ไฟล์ที่ลบแล้วไม่เป็นปัญหา)");
    process.exit(1);
  }
  removed += batch.length;
  console.log(`  ลบแล้ว ${removed}/${paths.length}`);
}

const ids = targets.map((r) => r.id);
for (let i = 0; i < ids.length; i += 500) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/admin_clear_proof_urls`, { method: "POST", headers: H, body: JSON.stringify({ p_checkin_ids: ids.slice(i, i + 500) }) });
  if (!r.ok) {
    console.error("ลบไฟล์แล้ว แต่ล้างลิงก์ในฐานข้อมูลไม่สำเร็จ:", await r.text());
    process.exit(1);
  }
}
console.log(`\nเสร็จ: ลบ ${removed} รูป และล้างลิงก์ ${ids.length} รายการ ✓`);
