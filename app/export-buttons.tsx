"use client";

type ExportData = { title: string; municipalityName?: string; columns: string[]; rows: Record<string, unknown>[] };

function complete(data: ExportData): Required<ExportData> {
  const visibleName = document.querySelector<HTMLElement>(".municipality-chip")?.textContent?.trim();
  return { ...data, municipalityName: data.municipalityName || visibleName || "Município ativo" };
}

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
function cell(value: unknown) { const text = value == null ? "" : String(value); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
function safeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80) || "relatorio"; }
function download(content: BlobPart, mime: string, filename: string) { const url = URL.createObjectURL(new Blob([content], { type: mime })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function csv(data: ExportData) {
  const quote = (value: unknown) => `"${cell(value).replaceAll('"', '""')}"`;
  const content = [data.columns.map((column) => quote(label(column))).join(";"), ...data.rows.map((row) => data.columns.map((column) => quote(row[column])).join(";"))].join("\r\n");
  download(`\uFEFF${content}`, "text/csv;charset=utf-8", `${safeName(data.title)}.csv`);
}

function xml(value: unknown) { return cell(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function xls(data: ExportData) {
  const rows = [data.columns.map(label), ...data.rows.map((row) => data.columns.map((column) => row[column]))];
  const sheetRows = rows.map((row, index) => `<Row>${row.map((value) => `<Cell ss:StyleID="${index ? "Data" : "Header"}"><Data ss:Type="String">${xml(value)}</Data></Cell>`).join("")}</Row>`).join("");
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${xml(data.title)}</Title><Company>CBAItyhy</Company></DocumentProperties><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B3768" ss:Pattern="Solid"/></Style><Style ss:ID="Data"><Alignment ss:Vertical="Top"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5EAF1"/></Borders></Style></Styles><Worksheet ss:Name="Relatório"><Table>${sheetRows}</Table></Worksheet></Workbook>`;
  download(`\uFEFF${workbook}`, "application/vnd.ms-excel;charset=utf-8", `${safeName(data.title)}.xls`);
}

async function pdf(data: ExportData) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: data.columns.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  doc.setTextColor(11, 55, 104); doc.setFontSize(15); doc.text(data.title, 14, 16);
  doc.setTextColor(95, 113, 134); doc.setFontSize(9); doc.text(`${data.municipalityName} | Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 23);
  autoTable(doc, { startY: 29, head: [data.columns.map(label)], body: data.rows.map((row) => data.columns.map((column) => cell(row[column]))), theme: "grid", styles: { fontSize: data.columns.length > 6 ? 6.5 : 7.5, cellPadding: 2, overflow: "linebreak" }, headStyles: { fillColor: [11, 55, 104], textColor: 255 }, alternateRowStyles: { fillColor: [246, 249, 252] }, margin: { top: 29, right: 10, bottom: 12, left: 10 } });
  doc.save(`${safeName(data.title)}.pdf`);
}

export function ExportButtons({ data }: { data: ExportData }) {
  if (!data.rows.length) return null;
  return <div className="export-actions" aria-label="Exportar resultado"><span>Exportar:</span><button type="button" onClick={() => void pdf(complete(data))}>PDF</button><button type="button" onClick={() => csv(complete(data))}>CSV</button><button type="button" onClick={() => xls(complete(data))}>XLS</button></div>;
}
