import type { PaymentBank } from './types';

// Mã ngân hàng lấy theo Bank Database của VietQR. `code` là MA_NGAN_HANG
// dùng trong tham số deeplink `ba=SO_TAI_KHOAN@MA_NGAN_HANG`.
export const BANKS_BY_BIN: Record<string, { name: string; code: string }> = {
  '970415': { name: 'VietinBank', code: 'ICB' },
  '970436': { name: 'Vietcombank', code: 'VCB' },
  '970418': { name: 'BIDV', code: 'BIDV' },
  '970405': { name: 'Agribank', code: 'VBA' },
  '970448': { name: 'OCB', code: 'OCB' },
  '970422': { name: 'MBBank', code: 'MB' },
  '970407': { name: 'Techcombank', code: 'TCB' },
  '970416': { name: 'ACB', code: 'ACB' },
  '970432': { name: 'VPBank', code: 'VPB' },
  '970423': { name: 'TPBank', code: 'TPB' },
  '970403': { name: 'Sacombank', code: 'STB' },
  '970437': { name: 'HDBank', code: 'HDB' },
  '970454': { name: 'VietCapitalBank', code: 'VCCB' },
  '970429': { name: 'SCB', code: 'SCB' },
  '970441': { name: 'VIB', code: 'VIB' },
  '970443': { name: 'SHB', code: 'SHB' },
  '970431': { name: 'Eximbank', code: 'EIB' },
  '970426': { name: 'MSB', code: 'MSB' },
  '546034': { name: 'CAKE by VPBank', code: 'CAKE' },
  '546035': { name: 'Ubank by VPBank', code: 'Ubank' },
  '963388': { name: 'Timo', code: 'TIMO' },
  '970400': { name: 'SaigonBank', code: 'SGICB' },
  '970409': { name: 'BacABank', code: 'BAB' },
  '971025': { name: 'MoMo', code: 'momo' },
  '971133': { name: 'PVcomBank Pay', code: 'PVDB' },
  '970412': { name: 'PVcomBank', code: 'PVCB' },
  '970414': { name: 'MBV', code: 'MBV' },
  '970419': { name: 'NCB', code: 'NCB' },
  '970424': { name: 'ShinhanBank', code: 'SHBVN' },
  '970425': { name: 'ABBANK', code: 'ABB' },
  '970427': { name: 'VietABank', code: 'VAB' },
  '970428': { name: 'NamABank', code: 'NAB' },
  '970430': { name: 'PGBank', code: 'PGB' },
  '970433': { name: 'VietBank', code: 'VIETBANK' },
  '970438': { name: 'BaoVietBank', code: 'BVB' },
  '970440': { name: 'SeABank', code: 'SEAB' },
  '970446': { name: 'COOPBANK', code: 'COOPBANK' },
  '970449': { name: 'LPBank', code: 'LPB' },
  '970452': { name: 'KienLongBank', code: 'KLB' },
  '668888': { name: 'KBank', code: 'KBank' },
  '422589': { name: 'CIMB', code: 'CIMB' },
  '970457': { name: 'Woori', code: 'WVN' },

  // Một số ngân hàng vẫn có thể xuất hiện trong QR dù trạng thái chuyển khoản
  // trên Bank Database không được đánh dấu đầy đủ. Giữ mã để deeplink có đủ `ba`.
  '970406': { name: 'Vikki', code: 'Vikki' },
  '970408': { name: 'GPBank', code: 'GPB' },
  '970410': { name: 'Standard Chartered', code: 'SCVN' },
  '970421': { name: 'VRB', code: 'VRB' },
  '970434': { name: 'IndovinaBank', code: 'IVB' },
  '970439': { name: 'PublicBank', code: 'PBVN' },
  '970442': { name: 'HongLeong', code: 'HLBVN' },
  '970444': { name: 'CBBank', code: 'CBB' },
  '970455': { name: 'IBK Hà Nội', code: 'IBK - HN' },
  '970456': { name: 'IBK TP.HCM', code: 'IBK - HCM' },
  '970458': { name: 'UOB', code: 'UOB' },
  '970462': { name: 'Kookmin Hà Nội', code: 'KBHN' },
  '970463': { name: 'Kookmin TP.HCM', code: 'KBHCM' },
  '970466': { name: 'KEB Hana TP.HCM', code: 'KEBHANAHCM' },
  '970467': { name: 'KEB Hana Hà Nội', code: 'KEBHANAHN' },
  '458761': { name: 'HSBC', code: 'HSBC' },
  '533948': { name: 'Citibank', code: 'CITIBANK' },
  '796500': { name: 'DBSBank', code: 'DBS' },
  '801011': { name: 'Nonghyup', code: 'NHB HN' },
  '999888': { name: 'VBSP', code: 'VBSP' }
};

// `autofill` theo API deeplink iOS của VietQR tại thời điểm 29/09/2026.
export const PAYMENT_BANKS: PaymentBank[] = [
  { appId: 'mb', appName: 'MB Bank', bankName: 'Ngân hàng TMCP Quân đội', autofill: true },
  { appId: 'bidv', appName: 'BIDV SmartBanking', bankName: 'BIDV', autofill: true },
  { appId: 'icb', appName: 'VietinBank iPay', bankName: 'VietinBank', autofill: true },
  { appId: 'acb', appName: 'ACB One', bankName: 'ACB', autofill: true },
  { appId: 'ocb', appName: 'OCB OMNI', bankName: 'OCB', autofill: true },
  { appId: 'vcb', appName: 'Vietcombank', bankName: 'Vietcombank', autofill: false },
  { appId: 'tcb', appName: 'Techcombank Mobile', bankName: 'Techcombank', autofill: false },
  { appId: 'vpb', appName: 'VPBank NEO', bankName: 'VPBank', autofill: false },
  { appId: 'vib-2', appName: 'MyVIB 2.0', bankName: 'VIB', autofill: false },
  { appId: 'tpb', appName: 'TPBank Mobile', bankName: 'TPBank', autofill: false },
  { appId: 'vba', appName: 'Agribank E-Mobile Banking', bankName: 'Agribank', autofill: false },
  { appId: 'hdb', appName: 'HDBank', bankName: 'HDBank', autofill: false },
  { appId: 'shb', appName: 'SHB SAHA', bankName: 'SHB', autofill: false },
  { appId: 'seab', appName: 'SeAMobile', bankName: 'SeABank', autofill: false },
  { appId: 'eib', appName: 'Eximbank EDigi', bankName: 'Eximbank', autofill: false }
];

export function bankFromBin(bin?: string) {
  if (!bin) return undefined;
  return BANKS_BY_BIN[bin];
}

export const RECEIVING_BANKS = Object.entries(BANKS_BY_BIN)
  .filter(([bin]) => /^\d{6}$/.test(bin))
  .map(([bin, bank]) => ({ bin, name: bank.name, code: bank.code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
