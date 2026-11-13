import QRCode from 'qrcode';

export async function qrPngDataUrl(
  text: string,
  options: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; margin?: number; scale?: number } = {},
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
    margin: options.margin ?? 1,
    scale: options.scale ?? 8,
  });
}
