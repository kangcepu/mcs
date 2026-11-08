/**
 * Normalisasi input pencarian aset dari teks biasa maupun hasil scan QR.
 * Label lama berisi URL `/Detail_asset/?id=<hex AssetID>`, sedangkan beberapa
 * integrasi mengirim kode aset langsung. Keduanya harus tetap dapat dicari.
 */
export function normalizeAssetLookup(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const id = url.searchParams.get('id')?.trim() ?? '';
    if (id) {
      if (/^[0-9a-f]+$/i.test(id) && id.length % 2 === 0) {
        const decoded = Buffer.from(id, 'hex').toString('utf8').trim();
        if (/^\d+$/.test(decoded)) return decoded;
      }
      return id;
    }

    const asset = url.searchParams.get('asset') ?? url.searchParams.get('asset_code');
    if (asset?.trim()) return asset.trim();

    const match = url.pathname.match(/\/assets\/(.+)$/i);
    if (match?.[1]) return match[1].split('/').map(decodeURIComponent).join('/').trim();
  } catch {
    // Bukan URL; lanjutkan sebagai ID/kode/nama aset biasa.
  }

  return raw;
}
