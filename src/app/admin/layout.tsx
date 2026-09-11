"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { useSession } from "@/hooks/useSession";
import { useMember } from "@/hooks/useMember";

const TABS = [
  { href: "/admin/members", label: "👥 Members" },
  { href: "/admin/groups", label: "🤝 Groups" },
  { href: "/admin/missions", label: "🎯 Missions" },
  { href: "/admin/proposals", label: "📢 Proposals" },
  { href: "/admin/checkins", label: "✅ Check-ins" },
  { href: "/admin/reports", label: "📊 Reports" },
  { href: "/admin/campaign", label: "📅 Campaign" },
  { href: "/admin/audit", label: "📋 Audit" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading: sessionLoading } = useSession();
  const { member, loading: memberLoading } = useMember();

  // No session at all -> straight to /login, same as the main app shell.
  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace("/login");
    }
  }, [sessionLoading, session, router]);

  if (sessionLoading || memberLoading || !session) {
    return <p className="text-sm text-gray-400 text-center py-10 px-4">กำลังตรวจสอบสิทธิ์...</p>;
  }

  // Logged in, but not an admin — this is a real access-denied state,
  // not a login problem, so it stays here rather than redirecting.
  // Every admin_* RPC checks is_admin() itself server-side regardless.
  if (!member || (member.role !== "admin" && member.role !== "super_admin")) {
    return (
      <div className="px-4 py-10 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="text-sm text-gray-500">หน้านี้สำหรับ Admin เท่านั้น</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <h1 className="text-lg font-bold text-gray-800">⚙️ Admin</h1>

        <div className="flex gap-1 rounded-full bg-white shadow-sm p-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                "rounded-full px-3.5 py-2 text-xs sm:text-sm font-semibold min-h-[40px] flex items-center whitespace-nowrap shrink-0",
                pathname?.startsWith(t.href) ? "bg-us text-white" : "text-gray-400"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
