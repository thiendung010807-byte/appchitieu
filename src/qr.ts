import { bankFromBin } from './banks';
import type { ParsedQr } from './types';

type TlvMap = Record<string, string>;

export function parseTlv(input: string): TlvMap {
  const result: TlvMap = {};
  let i = 0;

  while (i + 4 <= input.length) {
    const id = input.slice(i, i + 2);
    const lenText = input.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenText)) break;

    const len = Number(lenText);
    const start = i + 4;
    const end = start + len;
    if (end > input.length) break;

    result[id] = input.slice(start, end);
    i = end;
  }

  return result;
}

export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function verifyQrCrc(raw: string): boolean | undefined {
  if (raw.length < 8 || raw.slice(-8, -4) !== '6304') return undefined;
  const expected = raw.slice(-4).toUpperCase();
  return crc16CcittFalse(raw.slice(0, -4)) === expected;
}

function parseMomoUrl(raw: string): ParsedQr | undefined {
  try {
    const url = new URL(raw);
    const scheme = url.protocol.toLowerCase();
    const host = url.hostname.toLowerCase();
    const isMomo = scheme === 'momo:' || host === 'momo.vn' || host.endsWith('.momo.vn');
    if (!isMomo) return undefined;

    const amountText = url.searchParams.get('a') || url.searchParams.get('amount');
    const parsedAmount = amountText ? Number(amountText) : undefined;
    return {
      kind: 'momo',
      raw,
      url: raw,
      bankName: 'MoMo',
      receiverName: 'Thanh toán MoMo',
      amount: Number.isFinite(parsedAmount) && parsedAmount! > 0 ? parsedAmount : undefined
    };
  } catch {
    return undefined;
  }
}

export function parsePaymentQr(rawInput: string): ParsedQr {
  const raw = rawInput.trim();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return parseMomoUrl(raw) ?? { kind: 'url', raw, url: raw };
  }

  if (!raw.startsWith('000201')) {
    return { kind: 'unknown', raw };
  }

  const root = parseTlv(raw);
  const merchantAccount = root['38'];
  if (!merchantAccount) return { kind: 'unknown', raw, crcValid: verifyQrCrc(raw) };

  const provider = parseTlv(merchantAccount);
  if (provider['00'] !== 'A000000727') {
    return { kind: 'unknown', raw, crcValid: verifyQrCrc(raw) };
  }

  const beneficiary = provider['01'] ? parseTlv(provider['01']) : {};
  const bankBin = beneficiary['00'];
  const accountNo = beneficiary['01'];
  const bank = bankFromBin(bankBin);
  const additional = root['62'] ? parseTlv(root['62']) : {};
  const parsedAmount = root['54'] ? Number(root['54']) : undefined;

  return {
    kind: 'vietqr',
    raw,
    bankBin,
    bankName: bank?.name ?? (bankBin ? `Ngân hàng BIN ${bankBin}` : undefined),
    bankCode: bank?.code,
    accountNo,
    receiverName: root['59'] || undefined,
    amount: Number.isFinite(parsedAmount) && parsedAmount! > 0 ? parsedAmount : undefined,
    note: additional['08'] || undefined,
    serviceCode: provider['02'],
    crcValid: verifyQrCrc(raw)
  };
}

export function buildVietQrDeeplink(params: {
  paymentAppId: string;
  accountNo: string;
  receiverBankCode?: string;
  receiverBankBin?: string;
  amount: number;
  note?: string;
  receiverName?: string;
  returnUrl?: string;
}) {
  const query: string[] = [`app=${encodeURIComponent(params.paymentAppId)}`];

  // Autofill của MBBank/BIDV/VietinBank cần `ba` có cả STK và mã ngân hàng.
  // Nếu chưa nhận diện được code, dùng BIN làm fallback thay vì bỏ hẳn `ba`;
  // như vậy link không bị biến thành link chỉ mở app ngân hàng.
  const receiverBankId = params.receiverBankCode?.trim().toLowerCase() || params.receiverBankBin?.trim();
  if (receiverBankId) {
    query.push(`ba=${encodeURIComponent(`${params.accountNo}@${receiverBankId}`)}`);
  }

  query.push(`am=${encodeURIComponent(String(Math.round(params.amount)))}`);
  if (params.note?.trim()) query.push(`tn=${encodeURIComponent(params.note.trim().slice(0, 50))}`);
  if (params.receiverName?.trim()) query.push(`bn=${encodeURIComponent(params.receiverName.trim())}`);

  // MBBank autofill được VietQR công bố với callback `url`. Khi đang thử bằng
  // Expo Go, dùng HTTPS callback ổn định; app vẫn tự phát hiện lúc người dùng quay lại.
  query.push(`url=${encodeURIComponent(params.returnUrl || 'https://vietqr.io')}`);

  return `https://dl.vietqr.io/pay?${query.join('&')}`;
}

export function buildVietQrImageUrl(params: {
  bankBin: string;
  accountNo: string;
  amount: number;
  note?: string;
}) {
  const base = `https://img.vietqr.io/image/${encodeURIComponent(params.bankBin)}-${encodeURIComponent(params.accountNo)}-compact2.png`;
  const query = new URLSearchParams();
  if (params.amount > 0) query.set('amount', String(Math.round(params.amount)));
  if (params.note?.trim()) query.set('addInfo', params.note.trim().slice(0, 50));
  return `${base}?${query.toString()}`;
}
