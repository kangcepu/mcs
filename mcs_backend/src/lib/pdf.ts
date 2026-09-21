import { HttpError } from '../http.js';

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3001';

export async function htmlToPdf(html: string, options: { landscape?: boolean; paperWidth?: number; paperHeight?: number } = {}): Promise<Buffer> {
  const form = new FormData();
  form.append('index.html', new Blob([html], { type: 'text/html' }), 'index.html');
  if (options.landscape) form.append('landscape', 'true');
  form.append('paperWidth', String(options.paperWidth ?? 8.27));
  form.append('paperHeight', String(options.paperHeight ?? 11.7));
  form.append('marginTop', '0.3');
  form.append('marginBottom', '0.3');
  form.append('marginLeft', '0.3');
  form.append('marginRight', '0.3');
  form.append('printBackground', 'true');

  let response: Response;
  try {
    response = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, { method: 'POST', body: form });
  } catch {
    throw new HttpError(503, `Gotenberg tidak dapat dihubungi di ${GOTENBERG_URL}. Pastikan service Gotenberg berjalan (lihat README) atau set env GOTENBERG_URL.`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new HttpError(502, `Gagal generate PDF via Gotenberg (${response.status}): ${text.slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function reportPdfShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 700; }
  .summary { display: flex; gap: 16px; margin-bottom: 10px; }
  .summary div { border: 1px solid #ddd; border-radius: 4px; padding: 6px 10px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: #eee; font-size: 10px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
