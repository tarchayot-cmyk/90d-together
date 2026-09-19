"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { KINDNESS_CATEGORIES } from "@/lib/kindness";

interface FeaturedMessage {
  id: string;
  category: string;
  message: string;
}

function categoryEmoji(value: string) {
  return KINDNESS_CATEGORIES.find((c) => c.value === value)?.emoji ?? "🌈";
}

const ROTATE_MS = 5000;

export default function KindnessTicker() {
  const [messages, setMessages] = useState<FeaturedMessage[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_featured_kindness_messages");
      setMessages((data as FeaturedMessage[]) ?? []);
    }
    load();
  }, []);

  useEffect(() => {
    if (messages.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) return null;

  const current = messages[index];

  return (
    <div className="rounded-card bg-kindness/5 border border-kindness/15 px-4 py-3 overflow-hidden">
      <p className="text-xs font-semibold text-kindness mb-1">💚 กำแพงความห่วงใย</p>
      <p key={current.id} className="text-sm text-gray-600">
        {categoryEmoji(current.category)} {current.message}
      </p>
    </div>
  );
}
