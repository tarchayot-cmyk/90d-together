"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Camera, Check, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import type { Mission } from "@/lib/types";
import LinkifiedText from "@/components/LinkifiedText";
import { STICKER_EMOJI, targetPeriodLabel, limitSummary } from "@/lib/missionDisplay";
import { compressImage } from "@/lib/compressImage";

interface Props {
  mission: Mission;
  onClose: () => void;
  onSuccess: (result: {
    points: number;
    sticker: { color: string; amount: number } | null;
    message: string;
    pending_review?: boolean;
    capped?: boolean;
  }) => void;
}

const MAX_PROOF_IMAGES = 3;
// คลิปกับ Buddy: 1 ไฟล์ ยาวไม่เกิน ~12 วินาที (เผื่อเวลา) ขนาดไม่เกิน 40 MB
const MAX_CLIP_MB = 40;
const MAX_CLIP_SECONDS = 12;

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null); // เบราว์เซอร์อ่านไม่ได้ (เช่น HEVC) — ข้ามการเช็คความยาว เหลือเช็คขนาดไฟล์
    setTimeout(() => done(null), 4000);
    v.src = url;
  });
}

// Human-readable messages for the exceptions raised by complete_mission()
// (see supabase/migrations/0068_multi_proof_images.sql for the current version).
function friendlyError(raw: string): string {
  if (raw.includes("already_checked_in_this_week")) return "คุณทำภารกิจนี้ไปแล้วในสัปดาห์นี้ ✓";
  if (raw.includes("weekly_limit_reached")) return "ทำภารกิจนี้ครบจำนวนครั้งสูงสุดของสัปดาห์นี้แล้ว";
  if (raw.includes("round_limit_reached")) return "ภารกิจนี้ทำได้ 1 ครั้งต่อรอบการจับคู่ Buddy และคุณทำไปแล้ว ✓ ได้ Buddy ใหม่เมื่อไหร่ ทำได้อีกครั้ง";
  if (raw.includes("total_limit_reached")) return "ภารกิจนี้ทำได้ครั้งเดียวตลอดช่วงนี้ และคุณทำไปแล้ว ✓";
  if (raw.includes("daily_limit_reached")) return "ทำภารกิจนี้ครบจำนวนครั้งสูงสุดของวันนี้แล้ว ลองใหม่พรุ่งนี้นะ";
  if (raw.includes("target_not_reached")) return "ยังไม่ถึงเป้าหมาย ลองกรอกค่าที่มากขึ้นอีกนิด";
  if (raw.includes("text_answer_required")) return "กรุณาพิมพ์คำตอบก่อน Check-in";
  if (raw.includes("campaign_not_active")) return "แคมเปญนี้ยังไม่เริ่ม หรือสิ้นสุดแล้ว";
  if (raw.includes("mission_not_in_current_phase")) return "ภารกิจนี้ยังไม่เปิดหรือปิดไปแล้ว (พ้นช่วงของภารกิจนี้)";
  if (raw.includes("mission_not_found")) return "ไม่พบภารกิจนี้";
  if (raw.includes("too_many_proof_images")) return `แนบรูปได้สูงสุด ${MAX_PROOF_IMAGES} รูปเท่านั้น`;
  if (raw.includes("clip_already_submitted")) return "กลุ่มของคุณส่งคลิปในรอบนี้ไปแล้ว ✓ (1 คลิปต่อกลุ่มต่อรอบ)";
  if (raw.includes("clip_required")) return "ต้องแนบคลิปวิดีโอ 1 ไฟล์ก่อน Check-in";
  if (raw.includes("buddy_group_required")) return "ภารกิจนี้ใช้ได้เมื่อจับคู่ Buddy แล้วเท่านั้น";
  if (raw.includes("buddy_required")) return "เลือกชื่อ Buddy ที่ทำกิจกรรมด้วยกันก่อน Check-in นะ";
  if (raw.includes("buddy_invalid")) return "Buddy ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่";
  if (raw.includes("not_authenticated")) return "กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function CheckInModal({ mission, onClose, onSuccess }: Props) {
  const isCheckbox = mission.input_type === "checkbox";
  const isText = mission.input_type === "text";
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsBuddy = !!mission.requires_buddy;
  const isBuddyWalk = mission.category === "buddy_walk";
  const isClip = mission.category === "buddy_clip";
  const [buddyId, setBuddyId] = useState("");
  const [buddyOptions, setBuddyOptions] = useState<{ id: string; name: string }[]>([]);
  const [hasGroup, setHasGroup] = useState(true);
  const [buddyLoading, setBuddyLoading] = useState(needsBuddy);
  const [clipStatus, setClipStatus] = useState<{ submitted?: boolean; by_name?: string; by_me?: boolean; status?: string } | null>(null);

  // คลิปกับ Buddy: เช็กก่อนว่ากลุ่มส่งในรอบนี้ไปแล้วหรือยัง จะได้ไม่ต้องอัปโหลดเสียเปล่า
  useEffect(() => {
    if (!isClip) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_my_group_clip_status", { p_mission_id: mission.id });
      if (!cancelled) setClipStatus(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isClip, mission.id]);
  const clipBlocked = isClip && !!clipStatus?.submitted;

  useEffect(() => {
    if (!needsBuddy) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_my_buddy_options");
      if (cancelled) return;
      const opts = (data?.options ?? []) as { id: string; name: string }[];
      setBuddyOptions(opts);
      setHasGroup(!!data?.has_group);
      if (opts.length === 1) setBuddyId(opts[0].id);
      setBuddyLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsBuddy]);

  async function addClip(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("video/")) {
      setError("กรุณาเลือกไฟล์วิดีโอ");
      return;
    }
    if (file.size > MAX_CLIP_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_CLIP_MB} MB — ถ่ายให้สั้นลง (5–10 วินาที) หรือเลือกความละเอียดต่ำลงแล้วลองใหม่`);
      return;
    }
    const dur = await readVideoDuration(file);
    if (dur !== null && dur > MAX_CLIP_SECONDS) {
      setError(`คลิปยาว ${Math.round(dur)} วินาที — ต้องไม่เกิน 10 วินาที กรุณาตัดให้สั้นลง`);
      return;
    }
    setError(null);
    setProofFiles([file]);
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);

    setProofFiles((prev) => {
      const availableSlots = MAX_PROOF_IMAGES - prev.length;

      if (incoming.length > availableSlots) {
        setError(
          availableSlots === 0
            ? `แนบครบ ${MAX_PROOF_IMAGES} รูปแล้ว ลบรูปเดิมออกก่อนถึงจะเพิ่มได้`
            : `เลือกได้อีกแค่ ${availableSlots} รูป (สูงสุดรวม ${MAX_PROOF_IMAGES} รูป) — เพิ่มให้ ${availableSlots} รูปแรกเท่านั้น`
        );
      } else {
        setError(null);
      }

      return [...prev, ...incoming.slice(0, availableSlots)];
    });
  }

  function removeFile(index: number) {
    setProofFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let numericValue: number;
    if (isCheckbox) {
      if (!checked) {
        setError("ติ๊กยืนยันว่าทำแล้วก่อนนะ");
        return;
      }
      numericValue = mission.target_value; // checkbox missions always submit their own target as-is
    } else if (isText) {
      if (!note.trim()) {
        setError("กรุณาพิมพ์คำตอบก่อน Check-in");
        return;
      }
      numericValue = mission.target_value; // text missions submit their own target as-is; the note is the answer
    } else {
      numericValue = Number(value);
      if (!value || Number.isNaN(numericValue) || numericValue < 0) {
        setError("กรุณากรอกตัวเลขที่ถูกต้อง");
        return;
      }
    }

    if (needsBuddy && !buddyId) {
      setError("เลือกชื่อ Buddy ที่ทำกิจกรรมด้วยกันก่อน Check-in นะ");
      return;
    }

    if (mission.requires_proof && !isText && proofFiles.length === 0) {
      setError(isClip ? "ภารกิจนี้ต้องแนบคลิปวิดีโอก่อน Check-in" : "ภารกิจนี้ต้องแนบรูปหลักฐานก่อน Check-in");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    let proofUrls: string[] | null = null;
    if (proofFiles.length > 0) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        setLoading(false);
        setError("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
        return;
      }

      const uploadedUrls: string[] = [];
      for (let i = 0; i < proofFiles.length; i++) {
        const file = isClip ? proofFiles[i] : await compressImage(proofFiles[i]);
        const ext = file.name.split(".").pop() || (isClip ? "mp4" : "jpg");
        const path = `${user.id}/${mission.id}-${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("proofs").upload(path, file, {
          cacheControl: "31536000",
          upsert: false,
        });

        if (uploadError) {
          setLoading(false);
          setError(isClip ? "อัปโหลดคลิปไม่สำเร็จ ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่" : "แนบรูปไม่สำเร็จ กรุณาลองใหม่");
          return;
        }

        uploadedUrls.push(supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl);
      }
      proofUrls = uploadedUrls;
    }

    const { data, error: rpcError } = await supabase.rpc("complete_mission_with_buddy", {
      p_mission_id: mission.id,
      p_value: numericValue,
      p_note: note || null,
      p_proof_urls: proofUrls,
      p_buddy_member_id: needsBuddy ? buddyId : null,
    });
    setLoading(false);

    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }

    onSuccess(data);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-card sm:rounded-card bg-white p-5 space-y-4 animate-bounce-once max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{mission.name}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {mission.description && <LinkifiedText text={mission.description} className="text-sm text-gray-500" />}

        {!isCheckbox && !isText && !isBuddyWalk && (
          <p className="text-sm text-gray-400">
            เป้าหมาย {mission.target_value.toLocaleString()} {mission.unit} / {targetPeriodLabel(mission.max_per_day)}
          </p>
        )}
        {isBuddyWalk && (
          <p className="text-sm text-gray-400">
            กรอกก้าวของ <b>วันนี้</b> ระบบรวมก้าวทั้งสัปดาห์ของทุกคนในกลุ่มให้เอง · เป้ากลุ่ม 2 คน 80,000 ก้าว / กลุ่ม 3 คน 110,000 ก้าว
          </p>
        )}

        <div className="flex items-center gap-3 text-sm">
          <span className="text-us font-semibold">
            ⭐ +{mission.points} คะแนน{isBuddyWalk ? " (ได้เมื่อก้าวรวมของกลุ่มถึงเป้า)" : ""}
          </span>
          {mission.sticker_color && mission.sticker_amount > 0 && (
            <span className="text-gray-500">
              {STICKER_EMOJI[mission.sticker_color]} +{mission.sticker_amount}
            </span>
          )}
        </div>

        {limitSummary(mission.max_per_week, mission.max_per_day) && (
          <p className="text-xs text-gray-400">{limitSummary(mission.max_per_week, mission.max_per_day)}</p>
        )}

        {mission.requires_proof && isBuddyWalk && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            แนบภาพหน้าจอก้าวของวันนี้ (สูงสุด {MAX_PROOF_IMAGES} รูป) — บันทึกได้ทันทีไม่ต้องรอ Admin คะแนนทุกคนในกลุ่มจะเข้าอัตโนมัติเมื่อก้าวรวมของกลุ่มถึงเป้า
          </p>
        )}
        {isClip && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            อัปโหลดคลิป 5–10 วินาที (ไม่เกิน {MAX_CLIP_MB} MB) · 1 คนอัปโหลดแทนทั้งกลุ่ม · ทุกคนในกลุ่มได้คะแนนพร้อมกันเมื่อ Admin ตรวจสอบและอนุมัติ
          </p>
        )}
        {mission.requires_proof && !isBuddyWalk && !isClip && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            {isText
              ? "ภารกิจนี้ต้องรอ Admin ตรวจคำตอบก่อน — คะแนน/สติ๊กเกอร์จะได้หลัง Admin ตรวจสอบและอนุมัติ"
              : `ภารกิจนี้ต้องแนบรูปหลักฐาน (สูงสุด ${MAX_PROOF_IMAGES} รูป) — คะแนน/สติ๊กเกอร์จะได้หลัง Admin ตรวจสอบและอนุมัติ`}
          </p>
        )}

        {clipBlocked && (
          <p className="text-sm text-us bg-us/10 rounded-lg px-3 py-3">
            {clipStatus?.by_me ? "คุณ" : clipStatus?.by_name}ส่งคลิปของกลุ่มในรอบนี้แล้ว ✓{" "}
            {clipStatus?.status === "pending"
              ? "รอ Admin ตรวจสอบ — เมื่ออนุมัติ ทุกคนในกลุ่มจะได้คะแนนพร้อมกัน ไม่ต้องอัปโหลดซ้ำ"
              : "ทุกคนในกลุ่มได้คะแนนแล้ว ไม่ต้องอัปโหลดซ้ำ"}
          </p>
        )}

        <form onSubmit={handleSubmit} className={clipBlocked ? "hidden" : "space-y-3"}>
          {needsBuddy && (
            <div>
              <label className="text-xs font-medium text-gray-500">ทำกิจกรรมนี้กับ Buddy คนไหน</label>
              <select
                value={buddyId}
                onChange={(e) => setBuddyId(e.target.value)}
                disabled={buddyLoading}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-us/40"
              >
                <option value="">{buddyLoading ? "กำลังโหลด..." : "— เลือกชื่อ Buddy —"}</option>
                {buddyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {!buddyLoading && !hasGroup && (
                <p className="mt-1 text-[11px] text-gray-400">
                  คุณยังไม่ได้จับคู่ Buddy — เลือกเพื่อนที่ทำด้วยกันได้เลย (โบนัสคู่/ไฟ Buddy จะนับเมื่อแอดมินจับคู่แล้ว)
                </p>
              )}
            </div>
          )}

          {isCheckbox ? (
            <button
              type="button"
              onClick={() => setChecked((v) => !v)}
              className={`w-full flex items-center gap-3 rounded-xl border p-4 min-h-[44px] text-left ${
                checked ? "border-us bg-us/5" : "border-gray-200"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  checked ? "bg-us border-us" : "border-gray-300"
                }`}
              >
                {checked && <Check size={16} className="text-white" />}
              </span>
              <span className={`text-sm font-medium ${checked ? "text-us" : "text-gray-600"}`}>ทำแล้ว</span>
            </button>
          ) : isText ? (
            <div>
              <label className="text-xs font-medium text-gray-500">คำตอบ</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="พิมพ์คำตอบของคุณที่นี่"
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500">ค่าที่ทำได้ ({mission.unit})</label>
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`เช่น ${mission.target_value}`}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
              />
            </div>
          )}

          {!isText && (
          <div>
            <label className="text-xs font-medium text-gray-500">โน้ต (ไม่บังคับ)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เดินตอนเช้า"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-us/40"
            />
          </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500">
              {isClip ? "แนบคลิปวิดีโอ (1 ไฟล์)" : `แนบรูปหลักฐาน ${mission.requires_proof && !isText ? "" : "(ไม่บังคับ)"} (${proofFiles.length}/${MAX_PROOF_IMAGES})`}
            </label>

              {proofFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {proofFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      <Camera size={14} className="shrink-0 text-gray-400" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label="ลบไฟล์นี้"
                        className="shrink-0 text-red-400 p-1 min-h-[28px] min-w-[28px] flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {proofFiles.length < (isClip ? 1 : MAX_PROOF_IMAGES) && (
                <label className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 cursor-pointer min-h-[44px]">
                  <Camera size={18} />
                  {isClip ? "แตะเพื่อถ่ายคลิป/เลือกคลิป" : proofFiles.length === 0 ? "แตะเพื่อถ่ายรูป/เลือกรูป" : "เพิ่มรูปอีก"}
                  <input
                    type="file"
                    accept={isClip ? "video/*" : "image/*"}
                    multiple={!isClip}
                    className="hidden"
                    onChange={(e) => {
                      if (isClip) addClip(e.target.files);
                      else addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-us py-3 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "กำลังบันทึก..." : "CHECK-IN"}
          </button>
        </form>
      </div>
    </div>
  );
}
