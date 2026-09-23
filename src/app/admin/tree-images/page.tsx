"use client";

import { useEffect, useState } from "react";
import { Upload, Trash2, Loader2, Save } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabaseClient";

const PARTS = [
  { color: "rainbow", label: "ลำต้น", theme: "Kindness" },
  { color: "pink", label: "ราก", theme: "พัก" },
  { color: "yellow", label: "กิ่งก้าน", theme: "กาย" },
  { color: "orange", label: "ใบ", theme: "สังคม" },
  { color: "purple", label: "ดอก", theme: "ใจ" },
  { color: "red", label: "ผล", theme: "กิน" },
];
const LEVELS = [0, 1, 2, 3];

export default function AdminTreeImagesPage() {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [personalThresholds, setPersonalThresholds] = useState(["3", "7", "15"]);
  const [collectiveThresholds, setCollectiveThresholds] = useState(["50", "150", "400"]);
  const [savingThresholds, setSavingThresholds] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: imagesData }, { data: settingsData }] = await Promise.all([
      supabase.rpc("get_tree_images"),
      supabase.rpc("get_tree_settings"),
    ]);
    setImages((imagesData as Record<string, string>) ?? {});
    if (settingsData?.personal_thresholds) setPersonalThresholds(settingsData.personal_thresholds.map(String));
    if (settingsData?.collective_thresholds) setCollectiveThresholds(settingsData.collective_thresholds.map(String));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveThresholds() {
    const personalNums = personalThresholds.map(Number);
    const collectiveNums = collectiveThresholds.map(Number);

    if (personalNums.some((n) => Number.isNaN(n) || n < 0) || collectiveNums.some((n) => Number.isNaN(n) || n < 0)) {
      setBanner("กรอกตัวเลขให้ครบและถูกต้อง");
      return;
    }
    if (personalNums[0] >= personalNums[1] || personalNums[1] >= personalNums[2]) {
      setBanner("เกณฑ์ต้นไม้ส่วนตัวต้องเรียงจากน้อยไปมาก");
      return;
    }
    if (collectiveNums[0] >= collectiveNums[1] || collectiveNums[1] >= collectiveNums[2]) {
      setBanner("เกณฑ์ต้นไม้รวมทีมต้องเรียงจากน้อยไปมาก");
      return;
    }

    setSavingThresholds(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_update_tree_settings", {
      p_personal_thresholds: personalNums,
      p_collective_thresholds: collectiveNums,
    });
    setSavingThresholds(false);

    if (error) {
      setBanner("บันทึกเกณฑ์ไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setBanner("บันทึกเกณฑ์เรียบร้อย");
  }

  async function handleUpload(key: string, file: File) {
    setBusyKey(key);
    const supabase = createClient();

    const ext = file.name.split(".").pop() || "png";
    const path = `${key}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("tree-images").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
    });

    if (uploadError) {
      setBusyKey(null);
      setBanner("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const publicUrl = supabase.storage.from("tree-images").getPublicUrl(path).data.publicUrl;

    const { error: rpcError } = await supabase.rpc("admin_upsert_tree_image", {
      p_key: key,
      p_image_url: publicUrl,
    });
    setBusyKey(null);

    if (rpcError) {
      setBanner("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setImages((prev) => ({ ...prev, [key]: publicUrl }));
  }

  async function handleRemove(key: string) {
    setBusyKey(key);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_tree_image", { p_key: key });
    setBusyKey(null);

    if (error) {
      setBanner("ลบรูปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    setImages((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function Slot({ imgKey, label }: { imgKey: string; label: string }) {
    const url = images[imgKey];
    const busy = busyKey === imgKey;

    return (
      <div className="rounded-xl border border-gray-200 p-2 flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-lg bg-bg flex items-center justify-center overflow-hidden">
          {busy ? (
            <Loader2 size={20} className="animate-spin text-gray-400" />
          ) : url ? (
            <img src={url} alt={label} className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-gray-300 text-center px-1">ค่าเริ่มต้น</span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 text-center">{label}</p>
        <div className="flex gap-1">
          <label
            className={clsx(
              "text-[10px] font-semibold rounded-full px-2.5 py-1 cursor-pointer flex items-center gap-1",
              "bg-us/10 text-us"
            )}
          >
            <Upload size={10} />
            {url ? "เปลี่ยน" : "อัปโหลด"}
            <input
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(imgKey, file);
                e.target.value = "";
              }}
            />
          </label>
          {url && (
            <button
              onClick={() => handleRemove(imgKey)}
              disabled={busy}
              aria-label="ลบรูป กลับไปใช้ค่าเริ่มต้น"
              className="text-[10px] font-semibold rounded-full px-2 py-1 bg-red-50 text-red-500 flex items-center"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    );
  }

  function ThresholdRow({
    label,
    unit,
    values,
    onChange,
  }: {
    label: string;
    unit: string;
    values: string[];
    onChange: (next: string[]) => void;
  }) {
    return (
      <div className="rounded-card bg-white shadow-soft p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">{label}</p>
        <div className="flex items-center gap-2">
          {["ระดับ 0→1", "ระดับ 1→2", "ระดับ 2→3"].map((lvlLabel, i) => (
            <div key={i} className="flex-1">
              <label className="text-[10px] text-gray-400">{lvlLabel}</label>
              <input
                type="number"
                min={0}
                value={values[i]}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">หน่วย: {unit}</p>
      </div>
    );
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด...</p>;

  return (
    <div className="space-y-6">
      {banner && <p className="text-sm text-center text-gray-500 bg-white rounded-card p-2 shadow-soft">{banner}</p>}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🎚️ เกณฑ์ระดับ</h2>
        <div className="space-y-3">
          <ThresholdRow
            label="ต้นไม้ส่วนตัว (ต่อคน)"
            unit="จำนวนสติ๊กเกอร์สีนั้นที่สะสม"
            values={personalThresholds}
            onChange={setPersonalThresholds}
          />
          <ThresholdRow
            label="ต้นไม้รวมทีม (รวมทุกคน)"
            unit="จำนวนสติ๊กเกอร์สีนั้นรวมทั้งทีม"
            values={collectiveThresholds}
            onChange={setCollectiveThresholds}
          />
          <button
            onClick={handleSaveThresholds}
            disabled={savingThresholds}
            className="w-full rounded-card bg-us text-white p-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {savingThresholds ? "กำลังบันทึก..." : "บันทึกเกณฑ์"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🖼️ รูป — ต้นไม้ส่วนตัว (6 ส่วน × 4 ระดับ)</h2>
        <p className="text-xs text-gray-400 mb-3">
          อัปโหลดรูป PNG/WebP พื้นหลังโปร่งใส แทนที่รูปวาด SVG เริ่มต้น — ช่องไหนไม่อัปโหลด จะใช้รูปเริ่มต้นแทน
        </p>
        <div className="space-y-4">
          {PARTS.map((part) => (
            <div key={part.color} className="rounded-card bg-white shadow-soft p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {part.label} <span className="text-gray-300">· {part.theme}</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {LEVELS.map((lvl) => (
                  <Slot key={lvl} imgKey={`part_${part.color}_${lvl}`} label={`ระดับ ${lvl}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🖼️ รูป — ต้นไม้รวมทีม (6 ส่วน × 4 ระดับ)</h2>
        <p className="text-xs text-gray-400 mb-3">โครงสร้างเดียวกับต้นไม้ส่วนตัว แต่ใช้สติ๊กเกอร์รวมของทั้งทีม</p>
        <div className="space-y-4">
          {PARTS.map((part) => (
            <div key={part.color} className="rounded-card bg-white shadow-soft p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {part.label} <span className="text-gray-300">· {part.theme}</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {LEVELS.map((lvl) => (
                  <Slot key={lvl} imgKey={`collective_part_${part.color}_${lvl}`} label={`ระดับ ${lvl}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
