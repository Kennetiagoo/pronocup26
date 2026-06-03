import "server-only";

import { put } from "@vercel/blob";

import { ApiError } from "@/lib/http";

function assertBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "BLOB_READ_WRITE_TOKEN no está configurado en el entorno.",
    );
  }
}

export async function uploadBlob(path: string, data: Blob | Buffer, contentType?: string) {
  assertBlobToken();
  const result = await put(path, data, {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });
  return result;
}

