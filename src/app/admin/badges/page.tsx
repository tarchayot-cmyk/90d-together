"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Upload } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";
import { getFieldOptions, THEMES } from "@/lib/badgeFields";

interface Badge {
  id: string;
  family_code: string;
  tier: "bulk" | "lean" | "smart";
  theme: "move" | "fuel" | "rest" | "mind" | "connect";
  name: string;
  description: string | null;
  icon: string | null;
  icon_url?: string | null;
  condition_field: string; // full path e.g. "move.streak_weeks"
  target_value: number;
}

const TIER_LABEL: Record<string, string> = { bulk: "🥉 Bulk", lean: "🥈 Lean", smart: "🥇 Smart" };
const THEME_LABEL: Record<string, string> = Object.fromEntries(THEMES.map((t) => [t.value, t.label]));

function emptyForm(theme: string = "move") {
  return {
    id: null as string | null,
    family_code: "",
    tier: "bulk" as "bulk" | "lean" | "smart",
    theme,
    name: "",
    description: "",
    icon: "🏅",
    icon_url: "",
    condition_field: "",
    target_value: "" as string | number,
  };
}

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string>("all");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("badges")
      .select("id, family_code, tier, theme, name, description, icon, icon_url, condition_field, target_value")
      .order("theme")
      .order("family_code")
      .order("target_value");
    setBadges(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setError(null);
    setEditing(emptyForm(filterTheme === "all" ? "move" : filterTheme));
  }

  function openEdit(b: Badge) {
    setError(null);
    setEditing({
      id: b.id,
      family_code: b.family_code,
      tier: b.tier,
      theme: b.theme,
      name: b.name,
      description: b.description ?? "",
      icon: b.icon ?? "🏅",
      icon_url: b.icon_url ?? "",
      condition_field: `${b.theme}.${b.condition_field.split(".")[1]}`,
      target_value: b.target_value,
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;

    setUploading(true);
    setError(null);
    const supabase = createClient();

    const ext = file.name.split(".").pop() || "png";
    const path = `${editing.family_code || "badge"}-${editing.tier}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("badge-icons").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadError) {
      setUploading(false);
      setError("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const publicUrl = supabase.storage.from("badge-icons").getPublicUrl(path).data.publicUrl;
    setEditing({ ...editing, icon_url: publicUrl });
    setUploading(false);
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.family_code.trim() || !editing.name.trim() || !editing.condition_field || !editing.target_value) {
      setError("กรอกให้ครบทุกช่องที่จำเป็น");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_upsert_badge", {
      p_id: editing.id,
      p_family_code: editing.family_code.trim(),
      p_tier: editing.tier,
      p_theme: editing.theme,
      p_name: editing.name.trim(),
      p_description: editing.description.trim() || null,
      p_icon: editing.icon || "🏅",
      p_icon_url: editing.icon_url?.trim() || null,
      p_condition_field: editing.condition_field,
      p_target_value: Number(editing.target_value),
    });
    setSaving(false);

    if (rpcError) {
      setError(
        rpcError.message.includes("invalid_condition_field")
          ? "เงื่อนไขที่เลือกไม่ตรงกับธีม"
          : rpcError.message.includes("not_authorized")
          ? "คุณไม่มีสิทธิ์ทำรายการนี้"
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }

    setBanner(editing.id ? "แก้ไข Badge เรียบร้อย" : "สร้าง Badge ใหม่เรียบร้อย");
    setEditing(null);
    load();
  }

  async function handleDelete(b: Badge) {
    const confirmed = window.confirm(`ลบ Badge "${b.name}" ถาวร?\n\nสมาชิกที่เคยปลดล็อกเหรียญนี้จะไม่มีเหรียญนี้อีก`);
    if (!confirmed) return;

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_delete_badge", { p_id: b.id });
    if (rpcError) {
      setBanner("ลบไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("ลบ Badge เรียบร้อย");
    load();
  }

  const filtered = filterTheme === "all" ? badges : badges.filter((b) => b.theme === filterTheme);

  // Group by family for a compact table-like display
  const families = new Map<string, Badge[]>();
  for (const b of filtered) {
    const key = `${b.theme}:${b.family_code}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key)!.push(b);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all", ...THEMES.map((t) => t.value)] as const).map((th) => (
          <button
            key={th}
            onClick={() => setFilterTheme(th)}
            className={clsx(
              "rounded-full px-4 py-2 text-xs font-semibold min-h-[36px] shrink-0",
              filterTheme === th ? "bg-us text-white" : "bg-white text-gray-500 border border-gray-200"
            )}
          >
            {th === "all" ? "ทั้งหมด" : THEME_LABEL[th]}
          </button>
        ))}
      </div>

      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      <button
        onClick={openCreate}
        className="w-full rounded-card bg-us/10 border border-us/30 text-us p-3 flex items-center justify-center gap-2 text-sm font-semibold min-h-[44px]"
      >
        <Plus size={16} /> เพิ่ม Badge ใหม่
      </button>

      {loading && <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>}

      <div className="space-y-3">
        {Array.from(families.entries()).map(([key, tiers]) => (
          <div key={key} className="rounded-card bg-white shadow-soft p-3 space-y-2">
            <p className="text-xs text-gray-400">
              {THEME_LABEL[tiers[0].theme]} · {tiers[0].family_code}
            </p>
            {tiers.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 py-1 border-t border-gray-50 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    {TIER_LABEL[b.tier]} — {b.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {b.condition_field} ≥ {b.target_value}
                  </p>
                </div>
                <button onClick={() => openEdit(b)} className="text-gray-400 p-2 min-h-[36px] min-w-[36px] flex items-center justify-center">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(b)} className="text-red-400 p-2 min-h-[36px] min-w-[36px] flex items-center justify-center">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
        {!loading && families.size === 0 && <p className="text-sm text-gray-400 text-center py-8">ไม่พบ Badge</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-t-card sm:rounded-card bg-white p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{editing.id ? "แก้ไข Badge" : "สร้าง Badge ใหม่"}</h2>
              <button onClick={() => setEditing(null)} className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">ธีม</label>
              <select
                value={editing.theme}
                onChange={(e) => setEditing({ ...editing, theme: e.target.value, condition_field: "" })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              >
                {THEMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">ระดับเหรียญ (Tier)</label>
              <select
                value={editing.tier}
                onChange={(e) => setEditing({ ...editing, tier: e.target.value as "bulk" | "lean" | "smart" })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              >
                <option value="bulk">🥉 Bulk</option>
                <option value="lean">🥈 Lean</option>
                <option value="smart">🥇 Smart</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">รหัสชุด Badge (family_code) — ต้องตรงกันทั้ง 3 tier</label>
              <input
                value={editing.family_code}
                onChange={(e) => setEditing({ ...editing, family_code: e.target.value })}
                placeholder="เช่น move_extra"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">ชื่อ Badge</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">คำอธิบาย</label>
              <input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">ไอคอน (emoji)</label>
              <input
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">รูปไอคอน (ไม่บังคับ — ถ้าใส่จะใช้แทน emoji)</label>
              <div className="mt-1 flex items-center gap-3">
                {editing.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editing.icon_url} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-xl">
                    {editing.icon || "🏅"}
                  </div>
                )}
                <label className="flex-1 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 text-center cursor-pointer min-h-[44px] flex items-center justify-center gap-2">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
              {editing.icon_url && (
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, icon_url: "" })}
                  className="text-xs text-red-400 mt-1"
                >
                  ลบรูป (กลับไปใช้ emoji)
                </button>
              )}
              <input
                value={editing.icon_url}
                onChange={(e) => setEditing({ ...editing, icon_url: e.target.value })}
                placeholder="หรือวาง URL รูปภายนอกที่นี่"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">เงื่อนไข (เลือกจากรายการเท่านั้น)</label>
              <select
                value={editing.condition_field}
                onChange={(e) => setEditing({ ...editing, condition_field: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              >
                <option value="">-- เลือกเงื่อนไข --</option>
                {getFieldOptions(editing.theme).map((opt) => (
                  <option key={opt.field} value={`${editing.theme}.${opt.field}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">เกณฑ์ (ตัวเลขที่ต้องถึง)</label>
              <input
                type="number"
                value={editing.target_value}
                onChange={(e) => setEditing({ ...editing, target_value: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
