/**
 * Resize + re-encode an image on the client before uploading, to keep
 * Supabase Storage egress usage down (phone camera photos are often
 * 3-5MB+ each; this typically brings them under ~300-500KB with no
 * visible quality loss for check-in proof / icon purposes).
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.8): Promise<File> {
  // Only compress actual raster images; leave anything else (e.g. a
  // .heic that failed to decode, or a non-image somehow selected) as-is
  // rather than risk breaking the upload.
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);

    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    // Don't swap in a "compressed" file that's actually bigger (can
    // happen with already-small or already-compressed source images).
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    // If anything about compression fails (unsupported format, etc.),
    // fall back to uploading the original rather than blocking the user.
    return file;
  }
}
