"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { Member } from "@/lib/types";

interface MemberContextValue {
  member: Member | null;
  loading: boolean;
}

const MemberContext = createContext<MemberContextValue>({ member: null, loading: true });

// Fetches the member profile ONCE per app session (at the root
// layout) instead of every page re-fetching it on every navigation.
// Login/logout elsewhere in the app is picked up automatically via
// onAuthStateChange.
export function MemberProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession(); // local read, no network round-trip in the common case

      if (!session?.user) {
        if (!cancelled) {
          setMember(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.from("members").select("*").eq("auth_user_id", session.user.id).single();
      if (!cancelled) {
        setMember(data);
        setLoading(false);
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <MemberContext.Provider value={{ member, loading }}>{children}</MemberContext.Provider>;
}

// Same name/shape as before (`{ member, loading }`) — every existing
// call site (`useMember()`) keeps working unchanged, it just now
// reads from the shared context instead of fetching independently.
export function useMember() {
  return useContext(MemberContext);
}
