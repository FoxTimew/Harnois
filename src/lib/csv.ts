export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  // Spreadsheet applications may ignore leading whitespace/control bytes.
  const first = [...text].find(
    (char) => char.charCodeAt(0) > 31 && !/\s/u.test(char),
  );
  const safe = first && "=+@-".includes(first) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(";") + "\r\n";
}
