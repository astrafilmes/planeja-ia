function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCSV(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[],
) {
  if (!rows.length) {
    const blob = new Blob(["\uFEFF"], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, filename);
    return;
  }
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCsv).join(";");
  const body = rows
    .map((r) => cols.map((c) => escapeCsv(r[c])).join(";"))
    .join("\n");
  // BOM para Excel reconhecer UTF-8.
  const blob = new Blob(["\uFEFF" + header + "\n" + body], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
