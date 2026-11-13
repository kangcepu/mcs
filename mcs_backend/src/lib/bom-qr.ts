/** Decode seluruh format identifier QR BOM / Part yang pernah dicetak. */
export function parseBomQrPartId(input: unknown): number | null {
  const raw = String(input ?? '').trim();
  if (raw === '') return null;

  let token = raw;
  const compact = /^MCS:B:([0-9A-Z]+)$/i.exec(raw);
  if (compact) token = compact[1]!;
  else {
    const toolCode = /^BOM-(\d+)$/i.exec(raw);
    if (toolCode) {
      const id = Number(toolCode[1]);
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    try {
      const url = new URL(raw);
      const segments = url.pathname.split('/').filter(Boolean);
      const marker = segments.findIndex((segment) => segment.toLowerCase() === 'b');
      if (marker >= 0 && segments[marker + 1]) token = decodeURIComponent(segments[marker + 1]!);
      else return null;
    } catch {
      return null;
    }
  }

  if (!/^[0-9A-Z]+$/i.test(token)) return null;
  const id = Number.parseInt(token, 36);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function bomQrToken(partId: number): string {
  return partId.toString(36).toUpperCase();
}
