import QRCode from 'qrcode';

/** صورة QR كـ data URL (PNG) — للعرض داخل الصفحة أو الطباعة. */
export async function qrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#153A2BFF', light: '#FFFFFFFF' },
  });
}

/** SVG للـ QR — أخف للطباعة وللتضمين المباشر. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#153A2BFF', light: '#FFFFFFFF' },
  });
}
