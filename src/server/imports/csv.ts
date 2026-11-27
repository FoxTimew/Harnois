import "server-only";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ServiceError } from "@/server/services/errors";

export const maxImportFileBytes = 2 * 1024 * 1024;
export const maxImportRows = 1000;
export const csvOptionsSchema = z
  .object({
    encoding: z.enum(["auto", "utf-8", "windows-1252"]).default("auto"),
  })
  .strict();
export type CsvOptions = z.infer<typeof csvOptionsSchema>;
export type CsvRecord<T extends string> = {
  line: number;
  cells: Partial<Record<T, string>>;
  invalidLength: boolean;
};
export function readCsv<T extends string>(
  bytes: Uint8Array,
  columns: readonly T[],
  required: readonly T[],
  input: unknown = {},
) {
  const options = csvOptionsSchema.parse(input);
  if (!bytes.length || bytes.length > maxImportFileBytes)
    throw new ServiceError("IMPORT_TOO_LARGE", 413);
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  )
    throw new ServiceError("INVALID_CSV");
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let encoding = options.encoding === "windows-1252" ? "windows-1252" : "utf-8";
  let content: string;
  try {
    content = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    if (options.encoding !== "auto" || bom)
      throw new ServiceError("INVALID_CSV");
    encoding = "windows-1252";
    content = new TextDecoder(encoding).decode(bytes);
  }
  if (content.includes("\0") || content.includes("\uFFFD"))
    throw new ServiceError("INVALID_CSV");
  const candidates = [";", ","].flatMap((delimiter) => {
    try {
      const parsed = parse(content, {
        delimiter,
        bom: true,
        info: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: 16 * 1024,
      }) as unknown as { record: string[]; info: { lines: number } }[];
      const header =
        parsed[0]?.record.map((value) => value.trim().toLowerCase()) ?? [];
      if (!required.every((key) => header.includes(key))) return [];
      return [{ parsed, header, delimiter }];
    } catch {
      return [];
    }
  });
  if (candidates.length !== 1) throw new ServiceError("INVALID_CSV");
  const { parsed, header, delimiter } = candidates[0];
  if (
    new Set(header).size !== header.length ||
    header.some((key) => !(columns as readonly string[]).includes(key))
  )
    throw new ServiceError("INVALID_CSV");
  if (parsed.length - 1 > maxImportRows)
    throw new ServiceError("IMPORT_TOO_LARGE", 413);
  if (parsed.length < 2) throw new ServiceError("INVALID_CSV");
  const records: CsvRecord<T>[] = parsed.slice(1).map(({ record, info }) => ({
    line: info.lines,
    invalidLength: record.length !== header.length,
    cells: Object.fromEntries(
      header.map((key, index) => [key, (record[index] ?? "").trim()]),
    ) as Partial<Record<T, string>>,
  }));
  return { records, encoding, delimiter, options };
}
