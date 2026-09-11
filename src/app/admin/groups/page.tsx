"use client";

import { useEffect, useState } from "react";
import { Users, TreePine } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface MemberRef {
  full_name: string;
  employee_code: string;
}
interface GroupRow {
  group_id: string;
  group_name: string;
  member: MemberRef | MemberRef[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function groupByName(rows: GroupRow[]) {
  const map = new Map<string, { name: string; members: MemberRef[] }>();
  for (const row of rows) {
    const m = one(row.member);
    if (!m) continue;
    if (!map.has(row.group_id)) map.set(row.group_id, { name: row.group_name, members: [] });
    map.get(row.group_id)!.members.push(m);
  }
  return Array.from(map.values());
}

export default function AdminGroupsPage() {
  const [buddyGroups, setBuddyGroups] = useState<{ name: string; members: MemberRef[] }[]>([]);
  const [squads, setSquads] = useState<{ name: string; members: MemberRef[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [{ data: buddyRows }, { data: squadRows }] = await Promise.all([
        supabase
          .from("buddy_members")
          .select(
            "group_id:buddy_group_id, group_name:buddy_groups!buddy_members_buddy_group_id_fkey(name), " +
              "member:members!buddy_members_member_id_fkey(full_name, employee_code)"
          ),
        supabase
          .from("squad_members")
          .select(
            "group_id:squad_id, group_name:squads!squad_members_squad_id_fkey(name), " +
              "member:members!squad_members_member_id_fkey(full_name, employee_code)"
          ),
      ]);

      // group_name comes back nested (FK embed) — flatten to a plain string per row.
      const flattenBuddy = (buddyRows ?? []).map((r: any) => ({
        group_id: r.group_id,
        group_name: one(r.group_name)?.name ?? "-",
        member: r.member,
      }));
      const flattenSquad = (squadRows ?? []).map((r: any) => ({
        group_id: r.group_id,
        group_name: one(r.group_name)?.name ?? "-",
        member: r.member,
      }));

      setBuddyGroups(groupByName(flattenBuddy));
      setSquads(groupByName(flattenSquad));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
          <Users size={16} /> Buddy Groups ({buddyGroups.length})
        </h2>
        {buddyGroups.length === 0 && (
          <p className="text-sm text-gray-400 bg-white rounded-card p-4 shadow-sm">
            ยังไม่มีการจับคู่ — ไปที่แท็บ Members กด "สุ่มแบ่ง Buddy"
          </p>
        )}
        <div className="space-y-2">
          {buddyGroups.map((g) => (
            <div key={g.name} className="rounded-card bg-white shadow-sm p-3">
              <p className="font-medium text-gray-800 text-sm mb-1">{g.name}</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {g.members.map((m) => (
                  <li key={m.employee_code}>
                    {m.full_name} <span className="text-gray-300">· {m.employee_code}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
          <TreePine size={16} /> Squads ({squads.length})
        </h2>
        {squads.length === 0 && (
          <p className="text-sm text-gray-400 bg-white rounded-card p-4 shadow-sm">
            ยังไม่มีการจัดกลุ่ม — ไปที่แท็บ Members กด "สุ่มแบ่ง Squad"
          </p>
        )}
        <div className="space-y-2">
          {squads.map((g) => (
            <div key={g.name} className="rounded-card bg-white shadow-sm p-3">
              <p className="font-medium text-gray-800 text-sm mb-1">{g.name}</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {g.members.map((m) => (
                  <li key={m.employee_code}>
                    {m.full_name} <span className="text-gray-300">· {m.employee_code}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
