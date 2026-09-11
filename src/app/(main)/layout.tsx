"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { useSession } from "@/hooks/useSession";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading } = useSession();

  // Auto-redirect to /login whenever there's no active session — spec
  // section 5's "no fake authentication" requirement, enforced on
  // every protected route via this shared layout.
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  if (loading || !session) {
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="max-w-md mx-auto w-full flex justify-end px-4 pt-3">
        <NotificationBell />
      </div>
      <main className="flex-1 pb-24 pt-1 px-4 max-w-md mx-auto w-full">{children}</main>
      <BottomNav />
    </div>
  );
}
