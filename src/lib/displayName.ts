// Display name without title (นาย/นาง/นางสาว/ภก./ภญ. ...): given name +
// first consonant of the surname, e.g. "จิรพร ล.". Mirrors the SQL function
// public.short_name() so names look the same whether they come from an RPC
// or from this file. Admin pages keep showing members.full_name as-is.
const TITLE_PREFIX = /^(ภญ\.|ภก\.|นางสาว|นาง|นาย|ว่าที่ร้อยตรี|ดร\.)\s*/;
const THAI_CONSONANT = /[ก-ฮ]/; // skips leading vowels like เ แ โ ไ ใ

export function shortName(name: string | null | undefined): string {
  if (!name) return "";
  const stripped = name.trim().replace(/\s+/g, " ").replace(TITLE_PREFIX, "");
  const [first = "", last = ""] = stripped.split(" ");
  const initial = last ? (last.match(THAI_CONSONANT)?.[0] ?? last.charAt(0)) : "";
  const out = `${first}${initial ? ` ${initial}.` : ""}`.trim();
  return out || name;
}
