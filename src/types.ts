export type TransactionStatus = 'pending' | 'completed' | 'cancelled';
export type TransactionSource = 'qr' | 'manual' | 'receive_qr';
export type TransactionDirection = 'expense' | 'income';
export type ThemeMode = 'system' | 'light' | 'dark';
export type TimeFilter = 'today' | '7days' | 'month' | 'lastMonth' | 'year' | 'all';

export type Category = {
  id: string;
  label: string;
  icon: string;
};

export type Transaction = {
  id: number;
  amount: number;
  transactionName: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  receiverBankBin: string | null;
  receiverBankName: string | null;
  category: string;
  note: string | null;
  rawQr: string | null;
  paymentBank: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  direction: TransactionDirection;
  createdAt: string;
  completedAt: string | null;
};

export type ParsedQr = {
  kind: 'vietqr' | 'momo' | 'url' | 'unknown';
  raw: string;
  bankBin?: string;
  bankName?: string;
  bankCode?: string;
  accountNo?: string;
  receiverName?: string;
  amount?: number;
  note?: string;
  serviceCode?: string;
  url?: string;
  crcValid?: boolean;
};

export type PaymentBank = {
  appId: string;
  appName: string;
  bankName: string;
  autofill: boolean;
};

export type BudgetSnapshot = {
  monthlyLimit: number;
  monthSpent: number;
  monthRemaining: number;
  spentBeforeToday: number;
  spentToday: number;
  daysRemainingIncludingToday: number;
  dailyAllowance: number;
  canSpendToday: number;
  todayDifference: number;
  progress: number;
};

export type BalanceSnapshot = {
  anchorAmount: number;
  anchorAt: string;
  configured: boolean;
  incomeSinceAnchor: number;
  expenseSinceAnchor: number;
  currentBalance: number;
  todayIncome: number;
  todayExpense: number;
};
