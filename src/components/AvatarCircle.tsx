"use client";

export default function AvatarCircle({
  avatarUrl,
  name,
  size = 36,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  size?: number;
}) {
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
      className="rounded-full bg-bg overflow-hidden shrink-0 flex items-center justify-center text-gray-400 border border-gray-100"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (name ?? "?").charAt(0).toUpperCase()
      )}
    </div>
  );
}
