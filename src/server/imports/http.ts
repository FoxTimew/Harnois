import "server-only";
import { getServerEnv } from "@/server/env";
import { ServiceError } from "@/server/services/errors";
import { actionMessage } from "@/lib/action-result";
import { maxImportFileBytes } from "./csv";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function importError(error: unknown) {
  const code = error instanceof ServiceError ? error.code : "INVALID_REQUEST";
  return Response.json(
    { error: actionMessage(code), code },
    {
      status: error instanceof ServiceError ? error.status : 400,
      headers: privateHeaders,
    },
  );
}
export async function readImportBody(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(getServerEnv().BETTER_AUTH_URL).origin
  )
    throw new ServiceError("FORBIDDEN", 403);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new ServiceError("INVALID_REQUEST");
  const maxBytes = 3 * 1024 * 1024;
  const claimed = Number(request.headers.get("content-length"));
  if (claimed > maxBytes) throw new ServiceError("IMPORT_TOO_LARGE", 413);
  if (!request.body) throw new ServiceError("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ServiceError("IMPORT_TOO_LARGE", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  // Parse only after the hard streaming bound; no filesystem or unbounded formData().
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": contentType },
  }).formData();
  if (
    form.getAll("file").length !== 1 ||
    form.getAll("metadata").length !== 1 ||
    [...form.keys()].some((key) => key !== "file" && key !== "metadata")
  )
    throw new ServiceError("INVALID_REQUEST");
  const file = form.get("file"),
    metadata = form.get("metadata");
  if (!(file instanceof File) || !file.size || file.size > maxImportFileBytes)
    throw new ServiceError("IMPORT_TOO_LARGE", 413);
  if (typeof metadata !== "string" || Buffer.byteLength(metadata) > 64 * 1024)
    throw new ServiceError("INVALID_REQUEST");
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    metadata: JSON.parse(metadata) as unknown,
  };
}
