"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

interface Campaign {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

function friendlyError(raw: string): string {
  if (raw.includes("end_date_before_start_date")) return "วันสิ้นสุดต้องอยู่หลังวันเริ่ม";
  if (raw.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

const PHASE_LABEL: Record<string, string> = {
  me: "🌱 ME (วันที่ 1-30)",
  we: "🌿 WE (วันที่ 31-60)",
  us: "🌳 US (วันที่ 61-90)",
};

export default function AdminCampaignPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<{ current_day: number; current_phase: string | null } | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: phase }] = await Promise.all([
      supabase.from("campaigns").select("*").order("start_date", { ascending: false }),
      supabase.rpc("get_campaign_phase_info"),
    ]);
    setCampaigns(data ?? []);
    setPhaseInfo(phase?.has_campaign ? phase : null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;

  return (
    <div className="space-y-4">
      {phaseInfo && (
        <div className="rounded-card bg-us/5 border border-us/20 p-4 text-center">
          <p className="text-xs text-gray-400">ระยะปัจจุบันของแคมเปญ (คำนวณจากวันที่อัตโนมัติ)</p>
          <p className="font-bold text-us text-lg mt-1">
            {phaseInfo.current_phase ? PHASE_LABEL[phaseInfo.current_phase] : "นอกช่วงแคมเปญ (ก่อนเริ่ม/หลังจบ)"}
          </p>
          <p className="text-xs text-gray-400">วันที่ {phaseInfo.current_day} ของ 90 วัน</p>
        </div>
      )}

      <button
        onClick={() => setCreating(true)}
        className="w-full rounded-card bg-us/10 border border-us/30 text-us p-3 flex items-center justify-center gap-2 text-sm font-semibold min-h-[44px]"
      >
        <Plus size={16} />
        สร้าง Campaign ใหม่
      </button>

      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} onSaved={load} />
      ))}

      {campaigns.length === 0 && <p className="text-sm text-gray-400 text-center py-8">ยังไม่มี Campaign</p>}

      {creating && <CampaignCard campaign={null} onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
    </div>
  );
}

function CampaignCard({
  campaign,
  onSaved,
  onCancel,
}: {
  campaign: Campaign | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(campaign?.name ?? "90 Days Growing Together — Batch");
  const [startDate, setStartDate] = useState(campaign?.start_date ?? "");
  const [endDate, setEndDate] = useState(campaign?.end_date ?? "");
  const [isActive, setIsActive] = useState(campaign?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate) {
      setError("กรอกชื่อ, วันเริ่ม, วันสิ้นสุดให้ครบ");
      return;
    }
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_upsert_campaign", {
      p_campaign_id: campaign?.id ?? null,
      p_name: name.trim(),
      p_start_date: startDate,
      p_end_date: endDate,
      p_is_active: isActive,
    });
    setSaving(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    setSavedBanner(true);
    onSaved();
  }

  // 90 days from start, auto-filled as a convenience — still editable.
  function handleStartChange(value: string) {
    setStartDate(value);
    if (value && !campaign) {
      const d = new Date(value);
      d.setDate(d.getDate() + 89);
      setEndDate(d.toISOString().slice(0, 10));
    }
  }

  return (
    <div className="rounded-card bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">{campaign ? "แก้ไข Campaign" : "Campaign ใหม่"}</h3>
        {campaign && (
          <span className={campaign.is_active ? "text-xs font-semibold text-us" : "text-xs text-gray-400"}>
            {campaign.is_active ? "Active" : "Inactive"}
          </span>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500">ชื่อ Campaign</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500">วันเริ่ม</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">วันสิ้นสุด</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
        Active (มีได้ทีละ 1 campaign ที่ active ในเวลาเดียวกัน — ระบบไม่ได้บังคับ ต้องเช็คเองก่อนเปิดอันใหม่)
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {savedBanner && !error && <p className="text-sm text-us">บันทึกเรียบร้อย</p>}

      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 min-h-[44px]">
            ยกเลิก
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-full bg-us py-2.5 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
