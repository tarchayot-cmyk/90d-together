"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { getNotificationCategory } from "@/lib/notificationCategories";

interface NotificationRow {
  id: string;
  type: string;
  message: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unreadCount = items.filter((n) => !n.is_read).length;

  async function load() {
    setLoading(true);
    const supabase = createClient();
    // RLS (notifications_select_own) already scopes this to the
    // caller's own rows — no need to filter by member id here.
    const { data } = await supabase
      .from("notifications")
      .select("id, type, message, link_path, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Light polling instead of realtime — keeps Task 1 scope minimal
    // while still surfacing new notifications without a manual refresh.
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function handleClick(n: NotificationRow) {
    if (!n.is_read) {
      const supabase = createClient();
      const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
      if (!error) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      }
    }
    setOpen(false);
    if (n.link_path) router.push(n.link_path);
  }

  async function handleDelete(e: React.MouseEvent, n: NotificationRow) {
    e.stopPropagation(); // don't also trigger the row's navigate-on-tap
    setActionError(null);
    setDeletingId(n.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_notification", { p_notification_id: n.id });
    setDeletingId(null);
    if (!error) {
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } else {
      setActionError("ลบไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  async function handleMarkAllRead() {
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (!error) {
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="การแจ้งเตือน"
        className="relative w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center min-h-[44px] min-w-[44px]"
      >
        <Bell size={18} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-kindness text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-outside backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div className="absolute right-0 mt-2 w-80 max-w-[85vw] bg-white rounded-card shadow-lg z-40 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <p className="font-semibold text-sm text-gray-800">การแจ้งเตือน</p>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-xs text-us font-medium">
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            {actionError && <p className="text-xs text-red-500 text-center py-2 border-b border-gray-50">{actionError}</p>}

            {loading && <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">ยังไม่มีการแจ้งเตือน</p>
            )}

            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-b border-gray-50">
                  <div
                    onClick={() => handleClick(n)}
                    className={clsx(
                      "w-full text-left px-4 py-3 text-sm flex gap-2 min-h-[44px] cursor-pointer",
                      !n.is_read && "bg-us/5"
                    )}
                  >
                    {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-us shrink-0" />}
                    <span className={clsx("flex-1", n.is_read ? "text-gray-500" : "text-gray-800 font-medium")}>
                      <span className="mr-1">{getNotificationCategory(n.type).icon}</span>
                      {n.message}
                      <span className="block text-xs text-gray-300 mt-0.5">
                        {new Date(n.created_at).toLocaleString("th-TH")}
                      </span>
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, n)}
                      disabled={deletingId === n.id}
                      aria-label="ลบการแจ้งเตือน"
                      className="shrink-0 text-gray-300 hover:text-red-400 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-us py-3 border-t border-gray-50"
            >
              ดูการแจ้งเตือนทั้งหมด
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
