export function resolveAssetAttachmentUrl(filename: string): string {
  const trimmed = String(filename ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return `/uploads/${trimmed}`;
  return `/uploads/assets/docs/masterAsset/${trimmed}`;
}

export function assetAttachmentFallbackKey(key: string): string | null {
  if (key.startsWith('assets/docs/masterAsset/')) return `masterAsset/${key.slice('assets/docs/masterAsset/'.length)}`;
  if (key.startsWith('masterAsset/')) return `assets/docs/masterAsset/${key.slice('masterAsset/'.length)}`;
  return null;
}
