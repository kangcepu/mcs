/**
 * Normalisasi input pencarian aset dari teks biasa maupun hasil scan QR.
 * Label lama berisi URL `/Detail_asset/?id=<hex AssetID>`, sedangkan beberapa
 * integrasi mengirim kode aset langsung. Keduanya harus tetap dapat dicari.
 */
function decodeLegacyHex(value: string): string | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  const decoded = Buffer.from(value, 'hex').toString('utf8').trim();
  if (!decoded || decoded.includes('\uFFFD') || /[\u0000-\u001F\u007F]/.test(decoded)) return null;
  return decoded;
}

export function normalizeAssetLookup(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const id = url.searchParams.get('id')?.trim() ?? '';
    if (id) {
      // QR legacy pernah memakai bin2hex(AssetID), sedangkan versi lain
      // memakai bin2hex(AssetCode). Keduanya harus diterima.
      const decoded = decodeLegacyHex(id);
      if (decoded) return decoded;
      return id;
    }

    const asset = url.searchParams.get('asset') ?? url.searchParams.get('asset_code');
    if (asset?.trim()) return asset.trim();

    const match = url.pathname.match(/\/assets\/(.+)$/i);
    if (match?.[1]) return match[1].split('/').map(decodeURIComponent).join('/').trim();
  } catch {
    // Bukan URL; lanjutkan sebagai ID/kode/nama aset biasa.
  }

  return decodeLegacyHex(raw) ?? raw;
}
