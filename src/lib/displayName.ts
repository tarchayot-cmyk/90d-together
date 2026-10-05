// Display name without title (นาย/นาง/นางสาว/ภก./ภญ. ...): given name +
// first word of the surname. Mirrors the SQL function public.short_name()
// so names look the same whether they come from an RPC or from this file.
// Admin pages keep showing members.full_name as-is.
const TITLE_PREFIX = /^(ภญ\.|ภก\.|นางสาว|นาง|นาย|ว่าที่ร้อยตรี|ดร\.)\s*/;

export function shortName(name: string | null | undefined): string {
  if (!name) return "";
  const stripped = name.trim().replace(/\s+/g, " ").replace(TITLE_PREFIX, "");
  const [first = "", last = ""] = stripped.split(" ");
  const out = `${first}${last ? ` ${last}` : ""}`.trim();
  return out || name;
}
