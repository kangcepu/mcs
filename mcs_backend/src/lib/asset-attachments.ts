import { rows } from '../db.js';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'jfif']);
const FILE_EXT = /\.[A-Za-z0-9]{2,5}$/;

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

export function splitAssetAttachmentFilenames(filename: string): string[] {
  const trimmed = String(filename ?? '').trim();
  if (!trimmed) return [];
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => FILE_EXT.test(p))) return parts;
  return [trimmed];
}

export interface AssetAttachmentItem {
  id: number;
  name: string;
  filename: string;
  original_filename: string | null;
  mime: string | null;
  url: string;
  type: 'image' | 'document';
  extension: string;
  category_id: number;
  category_name: string;
  created_by: string;
}

export async function getAssetAttachmentRows(assetCode: string): Promise<AssetAttachmentItem[]> {
  if (!assetCode) return [];
  const list = await rows<Record<string, unknown>>(
    `SELECT a.id, a.filename, a.original_filename, a.mime, a.created_by, a.id_attachment_asset_category AS category_id, c.category_name
     FROM tb_attachment_asset a
     LEFT JOIN tb_attachment_asset_category c ON c.id = a.id_attachment_asset_category
     WHERE a.AssetCode = ? AND a.part_id IS NULL
     ORDER BY CASE WHEN a.sort_order IS NULL OR a.sort_order = 0 THEN 1 ELSE 0 END, a.sort_order, a.id`,
    [assetCode],
  );
  const out: AssetAttachmentItem[] = [];
  for (const r of list) {
    const files = splitAssetAttachmentFilenames(String(r.filename ?? ''));
    for (const file of files) {
      const extension = (file.split('.').pop() ?? '').toLowerCase();
      const original = r.original_filename ? String(r.original_filename) : null;
      out.push({
        id: Number(r.id),
        name: files.length === 1 && original ? original : file,
        filename: file,
        original_filename: files.length === 1 ? original : null,
        mime: r.mime ? String(r.mime) : null,
        url: resolveAssetAttachmentUrl(file),
        type: IMAGE_EXT.has(extension) ? 'image' : 'document',
        extension,
        category_id: Number(r.category_id ?? 0),
        category_name: String(r.category_name ?? ''),
        created_by: String(r.created_by ?? ''),
      });
    }
  }
  return out;
}
