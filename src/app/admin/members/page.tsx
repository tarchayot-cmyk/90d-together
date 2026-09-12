"use client";

import { useEffect, useState } from "react";
import { Search, Shuffle, UserPlus, Pencil, KeyRound, AlertCircle, MoreVertical, Power } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import AvatarCircle from "@/components/AvatarCircle";
import AdjustPointsModal from "@/components/AdjustPointsModal";
import AddMemberModal from "@/components/AddMemberModal";
import EditMemberModal from "@/components/EditMemberModal";
import ResetPinModal from "@/components/ResetPinModal";

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
  points: number;
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<MemberRow | null>(null);
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [resetPinTarget, setResetPinTarget] = useState<MemberRow | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<"buddy" | "squad" | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [reminders, setReminders] = useState<{ needs_buddy_assignment: boolean; needs_squad_assignment: boolean } | null>(null);

  async function loadReminders() {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_admin_reminders");
    setReminders(data ?? null);
  }

  async function loadMembers() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: memberRows }, { data: pointRows }] = await Promise.all([
      supabase
        .from("members")
        .select("id, employee_code, full_name, nickname, unit, department, avatar_url, role, is_active")
        .order("full_name"),
      supabase.from("points_transactions").select("member_id, points"),
    ]);

    const pointsByMember = new Map<string, number>();
    for (const row of pointRows ?? []) {
      pointsByMember.set(row.member_id, (pointsByMember.get(row.member_id) ?? 0) + row.points);
    }

    setMembers((memberRows ?? []).map((m) => ({ ...m, points: pointsByMember.get(m.id) ?? 0 })));
    setLoading(false);
  }

  useEffect(() => {
    loadMembers();
    loadReminders();
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
    loadReminders();
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
    setMenuOpenFor(null);
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
      {(reminders?.needs_buddy_assignment || reminders?.needs_squad_assignment) && (
        <div className="rounded-card bg-amber-50 border border-amber-200 p-4 flex gap-3">
          <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-0.5">
            {reminders.needs_buddy_assignment && <p>ถึงช่วง WE แล้ว แต่ยังไม่ได้สุ่มจับคู่ Buddy — กดปุ่มด้านล่างได้เลย</p>}
            {reminders.needs_squad_assignment && <p>ถึงช่วง US แล้ว แต่ยังไม่ได้สุ่มจัดกลุ่ม Squad — กดปุ่มด้านล่างได้เลย</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleAssign("buddy")}
          disabled={assigning !== null}
          className="rounded-card bg-white shadow-soft p-3 flex items-center justify-center gap-2 text-sm font-semibold text-we disabled:opacity-50"
        >
          <Shuffle size={16} />
          {assigning === "buddy" ? "กำลังสุ่ม..." : "สุ่มแบ่ง Buddy"}
        </button>
        <button
          onClick={() => handleAssign("squad")}
          disabled={assigning !== null}
          className="rounded-card bg-white shadow-soft p-3 flex items-center justify-center gap-2 text-sm font-semibold text-us disabled:opacity-50"
        >
          <Shuffle size={16} />
          {assigning === "squad" ? "กำลังสุ่ม..." : "สุ่มแบ่ง Squad"}
        </button>
      </div>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

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
        <div className="rounded-card bg-white shadow-soft divide-y divide-gray-50">
          {filtered.map((m) => (
            <div key={m.id} className="relative p-3 flex items-center gap-3">
              <AvatarCircle avatarUrl={m.avatar_url} name={m.nickname ?? m.full_name} size={40} />

              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate text-sm">
                  {m.full_name}
                  {m.nickname && <span className="text-gray-400 font-normal"> ({m.nickname})</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {m.employee_code}
                  {(m.unit ?? m.department) && ` · ${m.unit ?? m.department}`}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-us">{m.points.toLocaleString()}</p>
                <span
                  className={clsx(
                    "inline-block rounded-pill px-2 py-0.5 text-[10px] font-semibold mt-0.5",
                    m.is_active ? "bg-pastel-green text-us" : "bg-gray-100 text-gray-400"
                  )}
                >
                  {m.is_active ? "ปกติ" : "ปิดใช้งาน"}
                </span>
              </div>

              <button
                onClick={() => setMenuOpenFor(menuOpenFor === m.id ? null : m.id)}
                aria-label="ตัวเลือกเพิ่มเติม"
                className="shrink-0 p-2 text-gray-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <MoreVertical size={18} />
              </button>

              {menuOpenFor === m.id && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpenFor(null)} />
                  <div className="absolute right-3 top-12 z-40 w-44 rounded-xl bg-white shadow-soft border border-gray-100 py-1.5 divide-y divide-gray-50">
                    <button
                      onClick={() => {
                        setEditTarget(m);
                        setMenuOpenFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 text-left min-h-[40px]"
                    >
                      <Pencil size={14} /> แก้ไขข้อมูล
                    </button>
                    <button
                      onClick={() => {
                        setAdjustTarget(m);
                        setMenuOpenFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-us text-left min-h-[40px]"
                    >
                      <span className="w-3.5 text-center">✦</span> ปรับคะแนน
                    </button>
                    <button
                      onClick={() => {
                        setResetPinTarget(m);
                        setMenuOpenFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 text-left min-h-[40px]"
                    >
                      <KeyRound size={14} /> รีเซ็ต PIN
                    </button>
                    <button
                      onClick={() => toggleMemberActive(m)}
                      className={clsx(
                        "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left min-h-[40px]",
                        m.is_active ? "text-red-500" : "text-us"
                      )}
                    >
                      <Power size={14} /> {m.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </div>
                </>
              )}
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
          onSuccess={() => {
            setBanner(`ปรับคะแนนของ ${adjustTarget.full_name} เรียบร้อย`);
            loadMembers();
          }}
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

      {resetPinTarget && (
        <ResetPinModal
          memberId={resetPinTarget.id}
          memberName={resetPinTarget.full_name}
          onClose={() => setResetPinTarget(null)}
          onSuccess={() => setBanner(`รีเซ็ต PIN ของ ${resetPinTarget.full_name} เรียบร้อย`)}
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
