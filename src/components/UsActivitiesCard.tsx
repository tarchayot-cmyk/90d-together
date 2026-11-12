"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabaseClient";
import { THEME_LABEL } from "@/lib/groupEvents";

interface Activity {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  source: string;
  done_this_round: boolean;
  pending_this_round: boolean;
}
interface UsData {
  round_no: number | null;
  round_end: string | null;
  has_group: boolean;
  activities: Activity[];
  theme_used: Record<string, number>;
  my_proposals: { id: string; title: string; status: string }[];
  my_logs: { id: string; title: string; status: string; created_at: string; points: number; reason: string | null }[];
}
interface Cand {
  id: string;
  name: string;
  group: string | null;
  same_group: boolean;
}

const THEME_CAP = 1000;
const MAX_CLIP_MB = 40;
const MAX_CLIP_SECONDS = 12;
const STATUS_TH: Record<string, string> = { pending: "รอแอดมินตรวจ", approved: "อนุมัติแล้ว", rejected: "ไม่ผ่าน" };

async function fetchUs(): Promise<UsData> {
  const { data } = await createClient().rpc("get_us_activities");
  return data as UsData;
}

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
    v.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    v.src = url;
  });
}

function friendly(raw: string): string {
  if (raw.includes("duplicate_participant")) return "มีคนในรายชื่อที่ถูกบันทึกกิจกรรมนี้ในวันนี้ไปแล้ว (" + (raw.split(":").pop() ?? "").trim() + ")";
  if (raw.includes("min_participants")) return "ต้องมีผู้ร่วมกิจกรรมอย่างน้อย 3 คน (รวมคุณ)";
  if (raw.includes("videos_required")) return "ต้องแนบวิดีโออย่างน้อย 1 คลิป";
  if (raw.includes("too_many_videos")) return "แนบวิดีโอได้ไม่เกิน 3 คลิป";
  if (raw.includes("us_not_started")) return "ช่วง US ยังไม่เริ่ม";
  return "ส่งไม่สำเร็จ กรุณาลองใหม่";
}

export default function UsActivitiesCard() {
  const { data, mutate } = useSWR("us-activities", fetchUs, { revalidateOnFocus: false });
  const [openAct, setOpenAct] = useState<Activity | null>(null);
  const [showPropose, setShowPropose] = useState(false);

  if (!data || data.round_no == null) return null;
  const used = data.theme_used ?? {};

  return (
    <section className="rounded-card bg-white shadow-soft p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-gray-800 text-sm">🌳 กิจกรรมร่วม (ช่วง US) · รอบที่ {data.round_no}</h2>
        <p className="text-xs text-gray-500">
          ทำกิจกรรมกับเพื่อนอย่างน้อย 3 คน แล้วเช็กอินคนเดียว ติ๊กชื่อทุกคน แนบวิดีโอสั้นๆ · คนกลุ่มเดียวกันได้ 50 ต่อคน คนต่างกลุ่มได้ 20 ต่อคน (สูงสุด 300 ต่อครั้ง)
          · แต่ละกิจกรรมได้คะแนนครั้งแรกของรอบเท่านั้น · เพดาน {THEME_CAP} ต่อธีมต่อรอบ
        </p>
      </div>

      <div className="space-y-2">
        {data.activities.map((a) => {
          const t = THEME_LABEL[a.theme];
          return (
            <div key={a.id} className="rounded-xl border border-gray-100 p-3 space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                {t?.icon} {a.title}
                {a.source === "member" && <span className="ml-1 text-[10px] text-gray-400">(เพื่อนเสนอ)</span>}
              </p>
              {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setOpenAct(a)} className="rounded-full bg-us text-white text-sm font-semibold px-4 min-h-[40px]">
                  เช็กอินกิจกรรมนี้
                </button>
                {a.done_this_round && <span className="text-xs text-us">✓ ได้คะแนนแล้วในรอบนี้</span>}
                {!a.done_this_round && a.pending_this_round && <span className="text-xs text-amber-600">⏳ รอแอดมินตรวจ</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(THEME_LABEL).map(([k, v]) => (
          <span key={k}>
            {v.icon} {used[k] ?? 0}/{THEME_CAP}
          </span>
        ))}
      </div>

      <button onClick={() => setShowPropose(true)} className="w-full rounded-full border border-us/40 text-us text-sm font-semibold py-2.5 min-h-[44px]">
        + เสนอกิจกรรมใหม่
      </button>

      {data.my_proposals.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs text-gray-400">กิจกรรมที่คุณเสนอ</p>
          {data.my_proposals.map((p) => (
            <p key={p.id} className="text-xs text-gray-600">
              {p.title} · {p.status === "pending" ? "รอแอดมินอนุมัติ" : "ไม่ผ่านการอนุมัติ"}
            </p>
          ))}
        </div>
      )}

      {data.my_logs.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs text-gray-400">ประวัติล่าสุดของคุณ</p>
          {data.my_logs.slice(0, 6).map((l) => (
            <p key={l.id} className="text-xs text-gray-600">
              {l.title} · {STATUS_TH[l.status] ?? l.status}
              {l.status === "approved" && <span className="font-semibold text-us"> +{l.points}</span>}
              {l.status === "rejected" && l.reason ? ` (${l.reason})` : ""}
            </p>
          ))}
        </div>
      )}

      {openAct && <CheckinModal activity={openAct} onClose={() => setOpenAct(null)} onDone={() => { setOpenAct(null); mutate(); }} />}
      {showPropose && <ProposeModal onClose={() => setShowPropose(false)} onDone={() => { setShowPropose(false); mutate(); }} />}
    </section>
  );
}

function CheckinModal({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: () => void }) {
  const { data: cands } = useSWR<Cand[]>("us-cands", async () => ((await createClient().rpc("list_us_candidates")).data as Cand[]) ?? [], { revalidateOnFocus: false });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [videos, setVideos] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const all = cands ?? [];
    return all.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.same_group) - Number(a.same_group));
  }, [cands, q]);
  const total = picked.size + 1;
  const sameCnt = 1 + (cands ?? []).filter((c) => picked.has(c.id) && c.same_group).length; // ตัวเองอยู่กลุ่มเดียวกับตัวเอง
  const myEstimate = Math.min(50 * sameCnt + 20 * (total - sameCnt), 300);

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function addVideo(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("video/")) return setError("กรุณาเลือกไฟล์วิดีโอ");
    if (f.size > MAX_CLIP_MB * 1024 * 1024) return setError(`ไฟล์ใหญ่เกิน ${MAX_CLIP_MB} MB — ถ่ายให้สั้นลงแล้วลองใหม่`);
    const dur = await readVideoDuration(f);
    if (dur !== null && dur > MAX_CLIP_SECONDS) return setError(`คลิปยาว ${Math.round(dur)} วินาที — ต้องไม่เกิน 10 วินาที`);
    if (videos.length >= 3) return setError("แนบได้สูงสุด 3 คลิป");
    setError(null);
    setVideos((v) => [...v, f]);
  }

  async function submit() {
    if (busy) return;
    if (total < 3) return setError("ต้องติ๊กเพื่อนอย่างน้อย 2 คน (รวมคุณเป็น 3 คน)");
    if (videos.length < 1) return setError("ต้องแนบวิดีโออย่างน้อย 1 คลิป");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: s } = await supabase.auth.getSession();
    const user = s.session?.user;
    if (!user) {
      setBusy(false);
      return setError("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }
    const urls: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const ext = videos[i].name.split(".").pop() || "mp4";
      const path = `${user.id}/us-${activity.id.slice(0, 8)}-${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from("proofs").upload(path, videos[i], { cacheControl: "31536000", upsert: false });
      if (upErr) {
        setBusy(false);
        return setError("อัปโหลดวิดีโอไม่สำเร็จ ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่");
      }
      urls.push(supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl);
    }
    const { error: err } = await supabase.rpc("submit_us_activity", { p_activity: activity.id, p_members: Array.from(picked), p_videos: urls, p_note: note || null });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 space-y-2">
          <p className="font-semibold text-gray-800 text-sm">
            {THEME_LABEL[activity.theme]?.icon} {activity.title}
          </p>
          <p className="text-xs text-gray-500">
            ติ๊กเพื่อนที่ทำกิจกรรมด้วยกัน (ไม่ต้องติ๊กตัวเอง) · ตอนนี้ {total} คน · คุณจะได้ประมาณ <b>{myEstimate}</b> คะแนน (ถ้าเป็นครั้งแรกของรอบ)
          </p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ" className="w-full rounded-full border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div className="overflow-y-auto flex-1">
          <ul className="divide-y divide-gray-50">
            {list.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  {c.same_group && <span className="text-[10px] rounded-full bg-pastel-green text-us px-2 py-0.5">กลุ่มเดียวกัน</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="p-4 space-y-2">
            <p className="text-xs font-medium text-gray-500">วิดีโอ 10 วินาที (1–3 คลิป)</p>
            {videos.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate">🎬 {v.name}</span>
                <button onClick={() => setVideos((x) => x.filter((_, j) => j !== i))} className="text-red-400 px-2">
                  ลบ
                </button>
              </div>
            ))}
            {videos.length < 3 && (
              <label className="block rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-500 py-3 cursor-pointer">
                + เพิ่มวิดีโอ
                <input type="file" accept="video/*" className="hidden" onChange={(e) => { addVideo(e.target.files); e.target.value = ""; }} />
              </label>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
          </div>
        </div>
        {error && <p className="px-4 pb-2 text-xs text-red-500">{error}</p>}
        <div className="p-3 border-t border-gray-100 flex gap-2">
          <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50">
            {busy ? "กำลังอัปโหลด..." : "ส่งให้แอดมินตรวจ"}
          </button>
          <button onClick={onClose} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function ProposeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [theme, setTheme] = useState("connect");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (title.trim().length < 3) return setError("ใส่ชื่อกิจกรรมก่อน");
    setBusy(true);
    const { error: err } = await createClient().rpc("propose_us_activity", { p_title: title, p_description: desc, p_theme: theme });
    setBusy(false);
    if (err) return setError("ส่งไม่สำเร็จ กรุณาลองใหม่");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-gray-800 text-sm">เสนอกิจกรรมใหม่</p>
        <p className="text-xs text-gray-500">แอดมินจะตรวจและเลือกธีมให้ เมื่ออนุมัติแล้วทุกคนเช็กอินกิจกรรมนี้ได้ (ใช้สูตรคะแนนเดียวกัน)</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อกิจกรรม เช่น เดินขึ้นดอยสุเทพ" className="w-full rounded border border-gray-200 px-3 py-2.5 text-sm" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" rows={2} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" />
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2.5 text-sm bg-white">
          {Object.entries(THEME_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label} (ที่คิดว่าใกล้เคียง)
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-us text-white font-semibold py-2.5 min-h-[44px] disabled:opacity-50">
            ส่งให้แอดมิน
          </button>
          <button onClick={onClose} className="rounded-full bg-white text-gray-500 px-4 min-h-[44px] shadow-soft text-sm">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
