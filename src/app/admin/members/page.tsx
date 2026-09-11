"use client";

import { useEffect, useState } from "react";
import { Search, Shuffle, UserPlus, Pencil } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import AdjustPointsModal from "@/components/AdjustPointsModal";
import AddMemberModal from "@/components/AddMemberModal";
import EditMemberModal from "@/components/EditMemberModal";

interface MemberRow {
  id: string;
  employee_code: string;
  full_name: string;
  nickname: string | null;
  unit: string | null;
  department: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<MemberRow | null>(null);
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [assigning, setAssigning] = useState<"buddy" | "squad" | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  async function loadMembers() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("id, employee_code, full_name, nickname, unit, department, avatar_url, role, is_active")
      .order("full_name");
    setMembers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function handleAssign(kind: "buddy" | "squad") {
    setAssigning(kind);
    setBanner(null);
    const supabase = createClient();

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .single();

    if (!campaign) {
      setBanner("ไม่พบ Campaign ที่ Active อยู่");
      setAssigning(null);
      return;
    }

    const [minSize, maxSize] = kind === "buddy" ? [2, 3] : [4, 6];
    const { data, error } = await supabase.rpc("assign_groups_randomly", {
      p_campaign_id: campaign.id,
      p_kind: kind,
      p_min_size: minSize,
      p_max_size: maxSize,
    });

    setAssigning(null);
    if (error) {
      setBanner(error.message.includes("not_authorized") ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }
    setBanner(`สุ่มแบ่ง ${kind === "buddy" ? "Buddy" : "Squad"} สำเร็จ — สร้าง ${data.groups_created} กลุ่ม`);
  }

  async function toggleMemberActive(member: MemberRow) {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_member_active", {
      p_member_id: member.id,
      p_is_active: !member.is_active,
    });
    if (error) {
      setBanner(error.message.includes("not_authorized") ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }
    loadMembers();
  }

  const filtered = members.filter((m) => {
    const q = query.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.employee_code.toLowerCase().includes(q) ||
      (m.department ?? "").toLowerCase().includes(q) ||
      (m.unit ?? "").toLowerCase().includes(q) ||
      (m.nickname ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleAssign("buddy")}
          disabled={assigning !== null}
          className="rounded-card bg-white shadow-sm p-3 flex items-center justify-center gap-2 text-sm font-semibold text-we disabled:opacity-50"
        >
          <Shuffle size={16} />
          {assigning === "buddy" ? "กำลังสุ่ม..." : "สุ่มแบ่ง Buddy"}
        </button>
        <button
          onClick={() => handleAssign("squad")}
          disabled={assigning !== null}
          className="rounded-card bg-white shadow-sm p-3 flex items-center justify-center gap-2 text-sm font-semibold text-us disabled:opacity-50"
        >
          <Shuffle size={16} />
          {assigning === "squad" ? "กำลังสุ่ม..." : "สุ่มแบ่ง Squad"}
        </button>
      </div>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-sm">{banner}</p>}

      <button
        onClick={() => setAddingMember(true)}
        className="w-full rounded-card bg-us/10 border border-us/30 text-us p-3 flex items-center justify-center gap-2 text-sm font-semibold min-h-[44px]"
      >
        <UserPlus size={16} />
        เพิ่มสมาชิกใหม่
      </button>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัสบุคลากร, หน่วย, แผนก..."
          className="w-full rounded-full border border-gray-200 pl-9 pr-3 py-2.5 text-sm bg-white"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>
      ) : (
        <div className="rounded-card bg-white shadow-sm divide-y divide-gray-50">
          {filtered.map((m) => (
            <div key={m.id} className="p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-bg overflow-hidden shrink-0 flex items-center justify-center text-sm text-gray-400 border border-gray-100">
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (m.nickname ?? m.full_name).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {m.full_name}
                    {m.nickname && <span className="text-gray-400 font-normal"> ({m.nickname})</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {m.employee_code} · {m.unit ?? m.department ?? "-"} · {m.role}
                    {!m.is_active && " · inactive"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setEditTarget(m)}
                  className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 min-h-[32px] flex items-center gap-1"
                >
                  <Pencil size={12} /> แก้ไข
                </button>
                <button
                  onClick={() => setAdjustTarget(m)}
                  className="text-xs font-semibold text-us border border-us/30 rounded-full px-3 py-1.5 min-h-[32px]"
                >
                  ปรับคะแนน
                </button>
                <button
                  onClick={() => toggleMemberActive(m)}
                  className={clsx(
                    "text-xs font-semibold rounded-full px-3 py-1.5 min-h-[32px]",
                    m.is_active ? "text-red-500 border border-red-200" : "text-us border border-us/30"
                  )}
                >
                  {m.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ไม่พบสมาชิก</p>}
        </div>
      )}

      {adjustTarget && (
        <AdjustPointsModal
          memberId={adjustTarget.id}
          memberName={adjustTarget.full_name}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => setBanner(`ปรับคะแนนของ ${adjustTarget.full_name} เรียบร้อย`)}
        />
      )}

      {editTarget && (
        <EditMemberModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setBanner("แก้ไขข้อมูลสมาชิกเรียบร้อย");
            loadMembers();
          }}
        />
      )}

      {addingMember && (
        <AddMemberModal
          onClose={() => setAddingMember(false)}
          onSuccess={() => {
            setBanner("เพิ่มสมาชิกใหม่เรียบร้อย");
            loadMembers();
          }}
        />
      )}
    </div>
  );
}
