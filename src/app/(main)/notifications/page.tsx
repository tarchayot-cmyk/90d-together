"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Bell } from "lucide-react";
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

export default function AllNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unreadCount = items.filter((n) => !n.is_read).length;

  async function load() {
    setLoading(true);
    const supabase = createClient();
    // RLS (notifications_select_own) already scopes this to the
    // caller's own rows. Higher limit than the bell dropdown (30)
    // since this is the full "view all" page.
    const { data } = await supabase
      .from("notifications")
      .select("id, type, message, link_path, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClick(n: NotificationRow) {
    if (!n.is_read) {
      const supabase = createClient();
      const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
      if (!error) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      }
    }
    if (n.link_path) router.push(n.link_path);
  }

  async function handleDelete(e: React.MouseEvent, n: NotificationRow) {
    e.stopPropagation();
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
    <div className="space-y-4 pt-2">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">🔔 ทั้งหมด</p>
          <h1 className="text-xl font-bold text-gray-800">การแจ้งเตือน</h1>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="text-xs font-semibold text-us border border-us/30 rounded-full px-3 py-1.5 min-h-[36px]">
            อ่านทั้งหมด
          </button>
        )}
      </header>

      {actionError && <p className="text-sm text-red-500 text-center bg-white rounded-card p-2 shadow-soft">{actionError}</p>}

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <Bell size={32} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((n) => {
          const category = getNotificationCategory(n.type);
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={clsx(
                "rounded-card bg-white shadow-soft p-3 flex gap-3 cursor-pointer min-h-[44px]",
                !n.is_read && "border border-us/20"
              )}
            >
              <span className="text-lg shrink-0">{category.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{category.label}</p>
                <p className={clsx("text-sm break-words", n.is_read ? "text-gray-500" : "text-gray-800 font-medium")}>
                  {n.message}
                </p>
                <p className="text-xs text-gray-300 mt-1">{new Date(n.created_at).toLocaleString("th-TH")}</p>
              </div>
              <div className="flex flex-col items-end justify-between shrink-0">
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-us" />}
                <button
                  onClick={(e) => handleDelete(e, n)}
                  disabled={deletingId === n.id}
                  aria-label="ลบการแจ้งเตือน"
                  className="text-gray-300 hover:text-red-400 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
