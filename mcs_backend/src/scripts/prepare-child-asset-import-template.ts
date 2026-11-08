import fs from 'node:fs';
import ExcelJS from 'exceljs';

const file = process.argv[2] ?? 'Form Preventive Audit - Siap Import.xlsx';

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(file) as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Sheet template tidak ditemukan.');

  const merges = Object.values((worksheet as unknown as { _merges: Record<string, { range: string }> })._merges)
    .map((merge) => merge.range)
    .filter((range) => /^A\d+:A\d+$/i.test(range));

  for (const range of merges) {
    const match = range.match(/^A(\d+):A(\d+)$/i);
    if (!match) continue;
    const firstRow = Number(match[1]);
    const lastRow = Number(match[2]);
    if (firstRow <= 9) continue; // Header A8:A9 tetap digabung.

    const style = JSON.parse(JSON.stringify(worksheet.getCell(firstRow, 1).style)) as ExcelJS.Style;
    worksheet.unMergeCells(range);
    for (let row = firstRow; row <= lastRow; row++) {
      const cell = worksheet.getCell(row, 1);
      cell.value = null;
      cell.style = JSON.parse(JSON.stringify(style)) as ExcelJS.Style;
    }
  }

  worksheet.getColumn(1).width = Math.max(worksheet.getColumn(1).width ?? 0, 22);
  await workbook.xlsx.writeFile(file);
  console.log(`Template diperbarui: ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
