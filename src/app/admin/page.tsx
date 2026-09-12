"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Activity, Star, AlertCircle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface Overview {
  campaign_name: string | null;
  participants: number;
  active_today: number;
  checkin_rate: number;
  kindness_total: number;
  growth_points_total: number;
  avg_me: number;
  avg_we: number;
  avg_us: number;
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reminders, setReminders] = useState<{ needs_buddy_assignment: boolean; needs_squad_assignment: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: ov }, { data: rem }] = await Promise.all([
        supabase.rpc("admin_get_overview"),
        supabase.rpc("get_admin_reminders"),
      ]);
      setOverview(ov ?? null);
      setReminders(rem ?? null);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;

  const cards = [
    { label: "สมาชิกทั้งหมด", value: overview?.participants ?? 0, unit: "คน", icon: Users, bg: "bg-pastel-green", fg: "text-us" },
    { label: "กำลังทำกิจกรรม", value: overview?.active_today ?? 0, unit: "คนวันนี้", icon: Activity, bg: "bg-pastel-blue", fg: "text-blue-500" },
    { label: "คะแนนรวม", value: (overview?.growth_points_total ?? 0).toLocaleString(), unit: "แต้ม", icon: Star, bg: "bg-pastel-purple", fg: "text-purple-500" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-400">⚙️ Admin</p>
        <h1 className="text-xl font-bold text-gray-800">จัดการระบบ และดูแลสมาชิก</h1>
        {overview?.campaign_name && <p className="text-xs text-gray-400 mt-0.5">แคมเปญ: {overview.campaign_name}</p>}
      </div>

      {(reminders?.needs_buddy_assignment || reminders?.needs_squad_assignment) && (
        <Link href="/admin/members" className="block rounded-card bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-amber-800">
              {reminders.needs_buddy_assignment && <p>ถึงช่วง WE แล้ว ยังไม่ได้สุ่มจับคู่ Buddy</p>}
              {reminders.needs_squad_assignment && <p>ถึงช่วง US แล้ว ยังไม่ได้สุ่มจัดกลุ่ม Squad</p>}
            </div>
            <ChevronRight size={16} className="text-amber-400 shrink-0" />
          </div>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-card bg-white shadow-soft p-3 space-y-1.5">
              <div className={`w-8 h-8 rounded-full ${c.bg} flex items-center justify-center ${c.fg}`}>
                <Icon size={16} />
              </div>
              <p className="text-lg font-bold text-gray-800 leading-tight">{c.value}</p>
              <p className="text-[11px] text-gray-400 leading-tight">
                {c.label}
                <br />
                {c.unit}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-card bg-white shadow-soft p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">ความคืบหน้าเฉลี่ยแต่ละเฟส</h2>
        {[
          { label: "🌱 ME", value: overview?.avg_me ?? 0, color: "bg-me" },
          { label: "🌿 WE", value: overview?.avg_we ?? 0, color: "bg-we" },
          { label: "🌳 US", value: overview?.avg_us ?? 0, color: "bg-us" },
        ].map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{row.label}</span>
              <span>{row.value}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${row.color} rounded-full`} style={{ width: `${row.value}%` }} />
            </div>
          </div>
        ))}
        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
          <span>Check-in สัปดาห์นี้</span>
          <span className="font-semibold text-gray-600">{overview?.checkin_rate ?? 0}%</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Kindness ที่ส่งไปแล้ว</span>
          <span className="font-semibold text-gray-600">{overview?.kindness_total ?? 0} ครั้ง</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { href: "/admin/members", label: "👥 สมาชิก" },
          { href: "/admin/checkins", label: "✅ ตรวจ Check-in" },
          { href: "/admin/proposals", label: "📢 กิจกรรม" },
          { href: "/admin/badges", label: "🏅 Badges" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="rounded-card bg-white shadow-soft p-3 text-sm font-medium text-gray-700 text-center min-h-[44px] flex items-center justify-center">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
