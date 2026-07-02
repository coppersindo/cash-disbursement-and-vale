import type * as XLSXTypes from "xlsx";
import type { DisbRequest } from "../data/disbursement";

// SheetJS is ~900 kB; only the approver ever generates .xls, so load it on
// demand to keep it out of the main bundle.
let xlsxPromise: Promise<typeof XLSXTypes> | null = null;
function xlsx(): Promise<typeof XLSXTypes> {
  if (!xlsxPromise) xlsxPromise = import("xlsx");
  return xlsxPromise;
}

// ============================================================================
// Bank-file generation
//
//   Maya  → .csv   (header "Mobile Number,Amount"; 639 mobiles; no thousands)
//   BPI   → .xls   (BizLink, BIFF8) with an H totals row + detail rows
//
// CRITICAL (per spec): the BizLink .xls is a strict bank template. For
// production you should drop the real, bank-accepted file into
// /public/bpi-bizlink-template.xls and let generateBizLink() inject rows into
// it (preserving sheet name + metadata). The from-scratch BIFF8 builder below
// is the fallback + the one-time validation/test path.
// ============================================================================

export const BPI_FUNDING_ACCOUNT = "3531008226";

/** One payee line on a bank file (already rail-correct). */
export type PayeeLine = {
  name: string;
  account: string; // BPI digits OR 639XXXXXXXXX
  amount: number;
  remarks: string;
};

/** Aggregate a batch's requests into one line per driver, for a given rail. */
export function linesForRail(requests: DisbRequest[], rail: "BPI" | "MAYA"): PayeeLine[] {
  const byDriver = new Map<string, PayeeLine & { types: Set<string> }>();
  for (const r of requests) {
    if (r.rail !== rail || !r.number) continue;
    const existing = byDriver.get(r.driverId);
    if (existing) {
      existing.amount += r.amount;
      existing.types.add(r.type);
    } else {
      byDriver.set(r.driverId, {
        name: r.driverName,
        account: r.number,
        amount: r.amount,
        remarks: "",
        types: new Set([r.type]),
      });
    }
  }
  return [...byDriver.values()].map((l) => ({
    name: l.name,
    account: l.account,
    amount: l.amount,
    remarks: [...l.types].join(", "),
  }));
}

// ---- Maya CSV ---------------------------------------------------------------

/** Plain number, no thousands commas: integer if whole, else 2 decimals. */
function mayaAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function mayaCsv(lines: PayeeLine[]): string {
  const rows = ["Mobile Number,Amount"];
  for (const l of lines) rows.push(`${l.account},${mayaAmount(l.amount)}`);
  return rows.join("\r\n") + "\r\n";
}

export function mayaCsvBlob(lines: PayeeLine[]): Blob {
  return new Blob([mayaCsv(lines)], { type: "text/csv;charset=utf-8" });
}

// ---- BPI BizLink .xls (BIFF8) ----------------------------------------------

/** 'MM/dd/yyyy' from a Date (local components) — the BizLink portal's format. */
function payrollDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${y}`;
}

/**
 * Build the BizLink worksheet rows.
 * Row 1 (H): H, Payroll Date, <date>, Payroll Time, "", Total Amount, <sum>,
 *            Total Count, <count>, FUNDING ACCOUNT, <funding>
 * Row 2    : DETAIL CONSTANT, EMPLOYEE NAME, EMPLOYEE ACCOUNT, AMOUNT, REMARKS
 * Row 3+   : D, <name>, <account>, <amount>, <remarks>
 */
function bizLinkAoa(lines: PayeeLine[], payrollDate: Date) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const aoa: (string | number)[][] = [
    [
      "H",
      "Payroll Date",
      payrollDateStr(payrollDate),
      "Payroll Time",
      "",
      "Total Amount",
      Number(total.toFixed(2)),
      "Total Count",
      lines.length,
      "FUNDING ACCOUNT",
      BPI_FUNDING_ACCOUNT,
    ],
    [
      "DETAIL CONSTANT",
      "EMPLOYEE NAME",
      "EMPLOYEE ACCOUNT",
      "AMOUNT",
      "REMARKS",
    ],
    ...lines.map((l) => [
      "D",
      l.name,
      l.account,
      Number(l.amount.toFixed(2)),
      l.remarks,
    ]),
  ];
  return aoa;
}

/** Force the EMPLOYEE ACCOUNT cells (col C) of detail rows to text. */
function forceAccountCellsText(
  XLSX: typeof XLSXTypes,
  ws: XLSXTypes.WorkSheet,
  detailStartRow: number,
  count: number
) {
  for (let i = 0; i < count; i++) {
    const ref = XLSX.utils.encode_cell({ c: 2, r: detailStartRow + i });
    const cell = ws[ref];
    if (cell) {
      cell.t = "s";
      cell.z = "@";
      cell.v = String(cell.v);
    }
  }
  // Funding account on the H row too (col K, row 0) — keep as text.
  const fund = ws[XLSX.utils.encode_cell({ c: 10, r: 0 })];
  if (fund) {
    fund.t = "s";
    fund.z = "@";
    fund.v = String(fund.v);
  }
}

/**
 * Generate the BPI BizLink .xls (BIFF8) as an ArrayBuffer.
 *  - With `templateBuffer`: inject H-row totals + detail rows into the real
 *    bank template, preserving its sheet name + workbook metadata.
 *  - Without: build the shell from scratch (test / fallback path).
 */
export async function generateBizLink(
  lines: PayeeLine[],
  payrollDate: Date,
  templateBuffer?: ArrayBuffer
): Promise<ArrayBuffer> {
  const XLSX = await xlsx();
  const aoa = bizLinkAoa(lines, payrollDate);

  let wb: XLSXTypes.WorkBook | null = null;

  // Try to inject into the real template; if it won't parse (e.g. a stray
  // HTML/SPA response slipped through), silently fall back to from-scratch.
  if (templateBuffer) {
    try {
      const t = XLSX.read(templateBuffer, { type: "array", cellStyles: true });
      const ws = t.Sheets[t.SheetNames[0]];
      if (!ws) throw new Error("template has no sheet");
      XLSX.utils.sheet_add_aoa(ws, aoa, { origin: "A1" });
      forceAccountCellsText(XLSX, ws, 2, lines.length);
      wb = t;
    } catch {
      wb = null; // fall through to the from-scratch builder
    }
  }

  if (!wb) {
    wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    forceAccountCellsText(XLSX, ws, 2, lines.length);
    XLSX.utils.book_append_sheet(wb, ws, "BizLink");
  }

  const out = XLSX.write(wb, { bookType: "biff8", type: "array" });
  return out as ArrayBuffer;
}

/** One-time validation file: 1–2 dummy ₱1 rows for a test upload to the bank. */
export function bizLinkTestFile(templateBuffer?: ArrayBuffer): Promise<ArrayBuffer> {
  const lines: PayeeLine[] = [
    { name: "TEST ONE", account: "1234567890", amount: 1, remarks: "TEST" },
    { name: "TEST TWO", account: "0987654321", amount: 1, remarks: "TEST" },
  ];
  return generateBizLink(lines, new Date(), templateBuffer);
}

// ---- Weekly vale list (.xlsx) ----------------------------------------------

export type ValeRow = {
  driver: string;
  date: string; // yyyy-mm-dd
  type: string;
  justification: string;
  amount: number;
};

/**
 * Build the weekly vale list workbook:
 *  - "Vale" sheet: itemized detail grouped by driver (Driver, Date, Type,
 *    Justification, Amount) with a per-driver subtotal and a grand total.
 *  - "Per driver" sheet: one total per driver.
 */
export async function generateValeList(
  weekLabel: string,
  rows: ValeRow[]
): Promise<ArrayBuffer> {
  const XLSX = await xlsx();

  // group by driver, preserving sorted driver order
  const byDriver = new Map<string, ValeRow[]>();
  for (const r of [...rows].sort((a, b) => a.driver.localeCompare(b.driver))) {
    (byDriver.get(r.driver) ?? byDriver.set(r.driver, []).get(r.driver)!).push(r);
  }

  const detail: (string | number)[][] = [
    [`Weekly vale list — ${weekLabel}`],
    [],
    ["Driver", "Date", "Type", "Justification", "Amount"],
  ];
  let grand = 0;
  for (const [driver, list] of byDriver) {
    let sub = 0;
    for (const r of list) {
      detail.push([driver, r.date, r.type, r.justification, r.amount]);
      sub += r.amount;
    }
    detail.push(["", "", "", `${driver} total`, sub]);
    detail.push([]);
    grand += sub;
  }
  detail.push(["", "", "", "GRAND TOTAL", grand]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(detail);
  ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 34 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Vale");

  const summary: (string | number)[][] = [["Driver", "Total"]];
  for (const [driver, list] of byDriver)
    summary.push([driver, list.reduce((s, r) => s + r.amount, 0)]);
  summary.push(["GRAND TOTAL", grand]);
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2["!cols"] = [{ wch: 22 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Per driver");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

// ---- download helper --------------------------------------------------------

export function downloadFile(filename: string, data: Blob | ArrayBuffer) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * True if the bytes look like a real spreadsheet: OLE2/.xls (D0 CF 11 E0) or
 * ZIP/.xlsx (PK\x03\x04). A SPA serves index.html (200, starts with '<') for a
 * missing path, so a status/size check isn't enough — we must sniff the bytes.
 */
function looksLikeSpreadsheet(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf).subarray(0, 4);
  const ole2 = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  const zip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  return ole2 || zip;
}

/** Try to load the real BizLink template from /public; undefined if absent. */
export async function loadBizLinkTemplate(): Promise<ArrayBuffer | undefined> {
  for (const name of ["bpi-bizlink-template.xls", "bpi-bizlink-template.xlsx"]) {
    try {
      const res = await fetch(`/${name}`);
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) continue; // SPA fallback, not a file
      const buf = await res.arrayBuffer();
      if (looksLikeSpreadsheet(buf)) return buf;
    } catch {
      /* ignore — fall through to from-scratch builder */
    }
  }
  return undefined; // build BizLink from scratch
}
