import { createHash } from "crypto";

export async function hashFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const hash = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
  return hash;
}
