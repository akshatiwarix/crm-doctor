"use client";

/**
 * The CSV is built on the server and handed here as a string. Building it in
 * the browser would need the whole diagnosis client-side for a button nobody
 * presses twice.
 */
export function DownloadCsv({ csv, filename }: { csv: string; filename: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }}
      className="rounded-xs border border-rule px-2 py-1 text-[11px] text-slate hover:border-rule-strong"
    >
      Findings CSV
    </button>
  );
}
