import ExcelJS from "exceljs";

export async function exportToXlsx(data: Record<string, unknown>[], filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  if (data.length > 0) {
    ws.columns = Object.keys(data[0]).map((key) => ({ header: key, key }));
    data.forEach((row) => ws.addRow(row));
  }
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `${filename}.xlsx`);
}

export async function exportMultiSheetXlsx(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    const rows = sheet.data.length > 0 ? sheet.data : [{}];
    if (rows.length > 0 && Object.keys(rows[0]).length > 0) {
      ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
      rows.forEach((row) => ws.addRow(row));
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `${filename}.xlsx`);
}

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
