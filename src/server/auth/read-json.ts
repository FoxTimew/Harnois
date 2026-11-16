import "server-only";
/** Bound public request bodies even when Content-Length is absent or dishonest. */
export async function readJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  if (!request.body) throw new Error("Invalid request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Invalid request");
    }
    chunks.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
