"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { employeeCodeToEmail, friendlyAuthError } from "@/lib/auth";
import { useSession } from "@/hooks/useSession";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();

  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already logged in — no reason to see the login screen.
  useEffect(() => {
    if (!sessionLoading && session) {
      router.replace("/home");
    }
  }, [sessionLoading, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!employeeCode.trim() || !pin.trim()) {
      setError("กรุณากรอกรหัสบุคลากรและ PIN ให้ครบ");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: employeeCodeToEmail(employeeCode),
      password: pin,
    });
    setSubmitting(false);

    if (authError) {
      setError(friendlyAuthError(authError.message));
      return;
    }

    router.replace("/home");
  }

  if (sessionLoading || session) {
    // Avoids a flash of the login form before the redirect effect fires.
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-6xl">🌱</div>
          <h1 className="text-lg font-bold text-gray-800 tracking-wide">90 DAYS</h1>
          <p className="text-sm text-gray-500">GROWING TOGETHER</p>
          <p className="text-xs text-us font-semibold pt-1">ME → WE → US</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">รหัสบุคลากร</label>
            <input
              type="text"
              autoCapitalize="none"
              autoComplete="username"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="เช่น EMP001"
              className="mt-1 w-full rounded-xl border border-[#E4DED2] bg-white px-4 py-3 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="••••"
              className="mt-1 w-full rounded-xl border border-[#E4DED2] bg-white px-4 py-3 text-base tracking-[0.3em] text-gray-800 focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-us py-3.5 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          ลืม PIN หรือยังไม่มีบัญชี ติดต่อ Admin ของหน่วยงาน
        </p>
      </div>
    </div>
  );
}
