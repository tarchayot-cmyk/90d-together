"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface AuditRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  admin: { full_name: string } | { full_name: string }[] | null;
}

const ACTION_LABEL: Record<string, string> = {
  adjust_points: "ปรับคะแนน",
  approve_checkin: "อนุมัติ Check-in",
  reject_checkin: "ปฏิเสธ Check-in",
  assign_buddy: "สุ่มแบ่ง Buddy",
  assign_squad: "สุ่มแบ่ง Squad",
  deactivate_member: "ปิดใช้งานสมาชิก",
  edit_mission: "แก้ไขภารกิจ",
  other: "อื่นๆ",
};

function adminName(admin: AuditRow["admin"]): string {
  if (!admin) return "-";
  return Array.isArray(admin) ? admin[0]?.full_name ?? "-" : admin.full_name;
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id, action, target_type, target_id, old_value, new_value, created_at, admin:members!audit_logs_admin_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error) setRows((data as unknown as AuditRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        แสดง 100 รายการล่าสุด — เฉพาะ Admin เท่านั้นที่อ่านได้ (RLS + is_admin() ในทุกฟังก์ชันที่เขียนตารางนี้)
      </p>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-card bg-white shadow-soft p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">{ACTION_LABEL[row.action] ?? row.action}</span>
              <span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleString("th-TH")}</span>
            </div>
            <p className="text-xs text-gray-400">
              โดย {adminName(row.admin)} · เป้าหมาย: {row.target_type} {row.target_id ? `(${row.target_id.slice(0, 8)}…)` : ""}
            </p>
            {(row.old_value || row.new_value) && (
              <div className="text-xs bg-bg rounded-lg p-2 font-mono text-gray-500 overflow-x-auto">
                {row.old_value && <div>ก่อน: {JSON.stringify(row.old_value)}</div>}
                {row.new_value && <div>หลัง: {JSON.stringify(row.new_value)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
