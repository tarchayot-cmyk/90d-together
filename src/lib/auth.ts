// Supabase Auth natively speaks email+password, not "Employee Code +
// PIN" (spec section 5). Rather than standing up a custom auth
// server, V1 maps each employee code to a synthetic, never-emailed
// address on a fake internal domain, and uses the PIN as that
// account's password. The mapping is deterministic and needs no
// lookup — the client computes it straight from what the user types,
// and admin_create_member() (Sprint 7 SQL) uses the exact same
// mapping when provisioning accounts, so the two always agree.
export const EMPLOYEE_AUTH_DOMAIN = "employee.growtogether.local";

export function employeeCodeToEmail(employeeCode: string): string {
  return `${employeeCode.trim().toLowerCase()}@${EMPLOYEE_AUTH_DOMAIN}`;
}

export function friendlyAuthError(raw: string): string {
  if (raw.includes("Invalid login credentials")) return "รหัสบุคลากรหรือ PIN ไม่ถูกต้อง";
  if (raw.includes("Email not confirmed")) return "บัญชีนี้ยังไม่ได้ยืนยัน กรุณาติดต่อ Admin";
  return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
}
