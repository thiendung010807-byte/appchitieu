import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';

import { PAYMENT_BANKS, RECEIVING_BANKS, bankFromBin } from './src/banks';
import { calculateBalanceSnapshot } from './src/balance';
import { calculateBudgetSnapshot, dailySummaryText } from './src/budget';
import {
  deleteTransaction,
  getRememberedCategory,
  getSettings,
  initDb,
  insertTransaction,
  listTransactions,
  merchantKey,
  rememberCategory,
  setSetting,
  setSettings,
  updateTransaction,
  updateTransactionStatus
} from './src/db';
import {
  cancelDailySummaryNotification,
  getScheduledDailySummaryCount,
  requestNotificationPermission,
  scheduleDailySummaryNotification,
  sendTestNotification
} from './src/notifications';
import { buildVietQrDeeplink, buildVietQrImageUrl, parsePaymentQr } from './src/qr';
import type {
  BalanceSnapshot,
  ThemeMode,
  TimeFilter,
  Transaction,
  TransactionStatus
} from './src/types';
import {
  CATEGORIES,
  TIME_FILTERS,
  categoryById,
  filterTransactionsByTime,
  formatDateTime,
  formatMoneyInput,
  formatVnd,
  parseMoneyInput
} from './src/utils';

type Tab = 'home' | 'history' | 'stats' | 'settings';

type PaymentDraft = {
  qr: ReturnType<typeof parsePaymentQr>;
  amountText: string;
  transactionName: string;
  category: string;
  note: string;
};

type ScanOutcome = { accepted: boolean; message?: string };

type ManualDraft = {
  amountText: string;
  category: string;
  note: string;
  merchant: string;
};

type ReceiveDraft = {
  bankBin: string;
  accountNo: string;
  amountText: string;
  transactionName: string;
  note: string;
};

type ReceiveQrSession = {
  transactionId: number;
  imageUrl: string;
  amount: number;
  bankBin: string;
  bankName: string;
  accountNo: string;
  transactionName: string;
  note: string;
};

type EditDraft = {
  amountText: string;
  transactionName: string;
  category: string;
  note: string;
  status: TransactionStatus;
};

type Palette = ReturnType<typeof makePalette>;
type AppStyles = ReturnType<typeof createAppStyles>;

const DEFAULT_MANUAL: ManualDraft = {
  amountText: '',
  category: 'other',
  note: '',
  merchant: ''
};

const DEFAULT_RECEIVE: ReceiveDraft = {
  bankBin: '',
  accountNo: '',
  amountText: '',
  transactionName: '',
  note: ''
};

const ThemeContext = createContext<{ styles: AppStyles; colors: Palette; isDark: boolean } | null>(null);

function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeContext missing');
  return value;
}

export default function App() {
  return (
    <SQLiteProvider databaseName="chi-tieu-qr.db" onInit={initDb}>
      <ExpenseApp />
    </SQLiteProvider>
  );
}

function ExpenseApp() {
  const db = useSQLiteContext();
  const systemScheme = useColorScheme();
  const [tab, setTab] = useState<Tab>('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentBankId, setPaymentBankId] = useState('mb');
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationHour, setNotificationHour] = useState(22);
  const [notificationMinute, setNotificationMinute] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [balanceAnchorAmount, setBalanceAnchorAmount] = useState(0);
  const [balanceAnchorAt, setBalanceAnchorAt] = useState(() => new Date().toISOString());
  const [balanceConfigured, setBalanceConfigured] = useState(false);
  const [receiveBankBin, setReceiveBankBin] = useState('');
  const [receiveAccountNo, setReceiveAccountNo] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [dayTick, setDayTick] = useState(() => new Date());

  const [scannerVisible, setScannerVisible] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(DEFAULT_MANUAL);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraft>(DEFAULT_RECEIVE);
  const [receiveQrSession, setReceiveQrSession] = useState<ReceiveQrSession | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const pendingReviewId = useRef<number | null>(null);
  const pendingMerchantKey = useRef<string | undefined>(undefined);
  const pendingCategory = useRef('other');
  const wasBackgrounded = useRef(false);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');
  const colors = useMemo(() => makePalette(isDark), [isDark]);
  const styles = useMemo(() => createAppStyles(colors), [colors]);

  const refresh = useCallback(async () => {
    const [items, settings] = await Promise.all([
      listTransactions(db),
      getSettings(db, [
        'paymentBank',
        'monthlyBudget',
        'notificationsEnabled',
        'notificationHour',
        'notificationMinute',
        'themeMode',
        'balanceAnchorAmount',
        'balanceAnchorAt',
        'balanceConfigured',
        'receiveBankBin',
        'receiveAccountNo',
        'receiveNote'
      ])
    ]);
    setTransactions(items);
    setPaymentBankId(settings.paymentBank || 'mb');
    setMonthlyBudget(Number(settings.monthlyBudget || 0));
    setNotificationsEnabled(settings.notificationsEnabled === '1');
    setNotificationHour(Number(settings.notificationHour || 22));
    setNotificationMinute(Number(settings.notificationMinute || 0));
    setBalanceAnchorAmount(Number(settings.balanceAnchorAmount || 0));
    setBalanceAnchorAt(settings.balanceAnchorAt || new Date().toISOString());
    setBalanceConfigured(settings.balanceConfigured === '1');
    setReceiveBankBin(settings.receiveBankBin || '');
    setReceiveAccountNo(settings.receiveAccountNo || '');
    setReceiveNote(settings.receiveNote || '');
    const mode = settings.themeMode;
    setThemeMode(mode === 'light' || mode === 'dark' ? mode : 'system');
    setSettingsLoaded(true);
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onStateChange = (next: AppStateStatus) => {
      if (pendingReviewId.current && next !== 'active') wasBackgrounded.current = true;
      if (next === 'active') {
        setDayTick(new Date());
        void refresh();
        if (pendingReviewId.current && wasBackgrounded.current) {
          setReviewId(pendingReviewId.current);
          wasBackgrounded.current = false;
        }
      }
    };
    const subscription = AppState.addEventListener('change', onStateChange);
    return () => subscription.remove();
  }, [refresh]);

  const completedTransactions = useMemo(
    () => transactions.filter((item) => item.status === 'completed'),
    [transactions]
  );

  const budget = useMemo(
    () => calculateBudgetSnapshot(transactions, monthlyBudget, dayTick),
    [transactions, monthlyBudget, dayTick]
  );

  const balance = useMemo(
    () => calculateBalanceSnapshot(
      transactions,
      balanceAnchorAmount,
      balanceAnchorAt,
      balanceConfigured,
      dayTick
    ),
    [transactions, balanceAnchorAmount, balanceAnchorAt, balanceConfigured, dayTick]
  );

  useEffect(() => {
    if (!settingsLoaded) return;
    void scheduleDailySummaryNotification(
      budget,
      balance,
      notificationHour,
      notificationMinute,
      notificationsEnabled
    ).catch(() => undefined);
  }, [budget, balance, notificationHour, notificationMinute, notificationsEnabled, settingsLoaded]);

  const handleScan = useCallback(async (raw: string): Promise<ScanOutcome> => {
    const parsed = parsePaymentQr(raw);
    if (parsed.kind === 'url') {
      return { accepted: false, message: 'QR này là liên kết thường, chưa phải mã thanh toán được hỗ trợ.' };
    }
    if (parsed.kind === 'momo') {
      setScannerVisible(false);
      setPaymentDraft({
        qr: parsed,
        amountText: parsed.amount ? formatMoneyInput(String(parsed.amount)) : '',
        transactionName: '',
        category: 'other',
        note: parsed.note ?? ''
      });
      return { accepted: true };
    }
    if (parsed.kind !== 'vietqr' || !parsed.accountNo) {
      return { accepted: false, message: 'Chưa hỗ trợ mã này. Hãy đưa QR ngân hàng/VietQR hoặc MoMo vào đúng khung.' };
    }
    const remembered = await getRememberedCategory(db, merchantKey(parsed.bankBin, parsed.accountNo));
    setScannerVisible(false);
    setPaymentDraft({
      qr: parsed,
      amountText: parsed.amount ? formatMoneyInput(String(parsed.amount)) : '',
      transactionName: parsed.receiverName ?? '',
      category: remembered ?? 'other',
      note: parsed.note ?? ''
    });
    return { accepted: true };
  }, [db]);

  const startBankPayment = useCallback(async () => {
    if (!paymentDraft) return;
    const amount = parseMoneyInput(paymentDraft.amountText);
    if (amount <= 0) {
      Alert.alert('Thiếu số tiền', 'Hãy nhập số tiền cần thanh toán.');
      return;
    }
    const isMomo = paymentDraft.qr.kind === 'momo';
    const paymentBank = PAYMENT_BANKS.find((bank) => bank.appId === paymentBankId) ?? PAYMENT_BANKS[0]!;
    const createdAt = new Date().toISOString();
    const id = await insertTransaction(db, {
      amount,
      transactionName: paymentDraft.transactionName.trim() || null,
      receiverName: paymentDraft.qr.receiverName ?? null,
      receiverAccount: paymentDraft.qr.accountNo ?? null,
      receiverBankBin: paymentDraft.qr.bankBin ?? null,
      receiverBankName: paymentDraft.qr.bankName ?? null,
      category: paymentDraft.category,
      note: paymentDraft.note.trim() || null,
      rawQr: paymentDraft.qr.raw,
      paymentBank: isMomo ? 'momo' : paymentBank.appId,
      status: 'pending',
      source: 'qr',
      direction: 'expense',
      createdAt,
      completedAt: null
    });

    pendingReviewId.current = id;
    pendingMerchantKey.current = isMomo ? undefined : merchantKey(paymentDraft.qr.bankBin, paymentDraft.qr.accountNo);
    pendingCategory.current = paymentDraft.category;

    const link = isMomo
      ? (paymentDraft.qr.url || 'momo://')
      : buildVietQrDeeplink({
          paymentAppId: paymentBank.appId,
          accountNo: paymentDraft.qr.accountNo!,
          receiverBankCode: paymentDraft.qr.bankCode,
          receiverBankBin: paymentDraft.qr.bankBin,
          amount,
          note: paymentDraft.note,
          receiverName: paymentDraft.qr.receiverName,
          returnUrl: 'chitieuqr://payment-return'
        });

    setPaymentDraft(null);
    await refresh();
    try {
      await Linking.openURL(link);
    } catch {
      setReviewId(id);
      Alert.alert('Không mở được app thanh toán', 'Giao dịch vẫn được giữ ở trạng thái chờ để bạn xử lý sau.');
    }
  }, [db, paymentBankId, paymentDraft, refresh]);

  const finishReview = useCallback(async (paid: boolean) => {
    if (!reviewId) return;
    await updateTransactionStatus(db, reviewId, paid ? 'completed' : 'cancelled');
    if (paid && pendingMerchantKey.current) {
      await rememberCategory(db, pendingMerchantKey.current, pendingCategory.current);
    }
    pendingReviewId.current = null;
    pendingMerchantKey.current = undefined;
    pendingCategory.current = 'other';
    setReviewId(null);
    await refresh();
  }, [db, refresh, reviewId]);

  const addManual = useCallback(async () => {
    const amount = parseMoneyInput(manualDraft.amountText);
    if (amount <= 0) {
      Alert.alert('Thiếu số tiền', 'Hãy nhập số tiền đã chi.');
      return;
    }
    const now = new Date().toISOString();
    await insertTransaction(db, {
      amount,
      transactionName: manualDraft.merchant.trim() || null,
      receiverName: manualDraft.merchant.trim() || null,
      receiverAccount: null,
      receiverBankBin: null,
      receiverBankName: null,
      category: manualDraft.category,
      note: manualDraft.note.trim() || null,
      rawQr: null,
      paymentBank: null,
      status: 'completed',
      source: 'manual',
      direction: 'expense',
      createdAt: now,
      completedAt: now
    });
    setManualDraft(DEFAULT_MANUAL);
    setManualVisible(false);
    await refresh();
  }, [db, manualDraft, refresh]);

  const openReceive = useCallback(() => {
    setReceiveDraft({
      bankBin: receiveBankBin,
      accountNo: receiveAccountNo,
      amountText: '',
      transactionName: '',
      note: receiveNote
    });
    setReceiveVisible(true);
  }, [receiveAccountNo, receiveBankBin, receiveNote]);

  const saveCurrentBalance = useCallback(async (value: number) => {
    if (value < 0) {
      Alert.alert('Số dư không hợp lệ', 'Số dư hiện tại không được nhỏ hơn 0.');
      return;
    }
    const now = new Date().toISOString();
    await setSettings(db, {
      balanceAnchorAmount: String(Math.round(value)),
      balanceAnchorAt: now,
      balanceConfigured: '1'
    });
    setBalanceAnchorAmount(Math.round(value));
    setBalanceAnchorAt(now);
    setBalanceConfigured(true);
    setBalanceVisible(false);
    Alert.alert('Đã lưu số dư', `Số dư hiện tại đã được đặt thành ${formatVnd(value)}.`);
    await refresh();
  }, [db, refresh]);

  const addManualIncome = useCallback(async () => {
    const amount = parseMoneyInput(receiveDraft.amountText);
    if (amount <= 0) {
      Alert.alert('Thiếu số tiền', 'Hãy nhập số tiền bạn đã nhận.');
      return;
    }
    const now = new Date().toISOString();
    await insertTransaction(db, {
      amount,
      transactionName: receiveDraft.transactionName.trim() || 'Tiền nhận',
      receiverName: null,
      receiverAccount: null,
      receiverBankBin: null,
      receiverBankName: null,
      category: 'income',
      note: receiveDraft.note.trim() || null,
      rawQr: null,
      paymentBank: null,
      status: 'completed',
      source: 'manual',
      direction: 'income',
      createdAt: now,
      completedAt: now
    });
    setReceiveDraft((current) => ({ ...current, amountText: '', transactionName: '' }));
    setReceiveVisible(false);
    await refresh();
    Alert.alert('Đã cộng tiền nhận', `${formatVnd(amount)} đã được cộng vào số dư.`);
  }, [db, receiveDraft, refresh]);

  const generateReceiveQr = useCallback(async () => {
    const amount = parseMoneyInput(receiveDraft.amountText);
    const accountNo = receiveDraft.accountNo.replace(/\s/g, '');
    if (!receiveDraft.bankBin) {
      Alert.alert('Chưa chọn ngân hàng', 'Hãy chọn ngân hàng nhận tiền.');
      return;
    }
    if (!/^\d{6,19}$/.test(accountNo)) {
      Alert.alert('Số tài khoản chưa hợp lệ', 'Hãy nhập số tài khoản từ 6 đến 19 chữ số.');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Thiếu số tiền', 'Hãy nhập số tiền cần nhận.');
      return;
    }

    const bank = bankFromBin(receiveDraft.bankBin);
    const note = receiveDraft.note.trim();
    const imageUrl = buildVietQrImageUrl({
      bankBin: receiveDraft.bankBin,
      accountNo,
      amount,
      note
    });
    const now = new Date().toISOString();
    const transactionId = await insertTransaction(db, {
      amount,
      transactionName: receiveDraft.transactionName.trim() || 'Nhận tiền qua QR',
      receiverName: null,
      receiverAccount: accountNo,
      receiverBankBin: receiveDraft.bankBin,
      receiverBankName: bank?.name ?? `Ngân hàng BIN ${receiveDraft.bankBin}`,
      category: 'income',
      note: note || null,
      rawQr: imageUrl,
      paymentBank: null,
      status: 'pending',
      source: 'receive_qr',
      direction: 'income',
      createdAt: now,
      completedAt: null
    });

    await setSettings(db, {
      receiveBankBin: receiveDraft.bankBin,
      receiveAccountNo: accountNo,
      receiveNote: note
    });
    setReceiveBankBin(receiveDraft.bankBin);
    setReceiveAccountNo(accountNo);
    setReceiveNote(note);
    setReceiveVisible(false);
    setReceiveQrSession({
      transactionId,
      imageUrl,
      amount,
      bankBin: receiveDraft.bankBin,
      bankName: bank?.name ?? `Ngân hàng BIN ${receiveDraft.bankBin}`,
      accountNo,
      transactionName: receiveDraft.transactionName.trim() || 'Nhận tiền qua QR',
      note
    });
    await refresh();
  }, [db, receiveDraft, refresh]);

  const finishReceiveQr = useCallback(async (received: boolean) => {
    if (!receiveQrSession) return;
    await updateTransactionStatus(db, receiveQrSession.transactionId, received ? 'completed' : 'cancelled');
    const amount = receiveQrSession.amount;
    setReceiveQrSession(null);
    setReceiveDraft((current) => ({ ...current, amountText: '', transactionName: '' }));
    await refresh();
    Alert.alert(
      received ? 'Đã nhận tiền' : 'Chưa nhận tiền',
      received
        ? `${formatVnd(amount)} đã được cộng vào số dư.`
        : 'Giao dịch đã được đánh dấu là chưa nhận và không cộng vào số dư.'
    );
  }, [db, receiveQrSession, refresh]);

  const saveTransactionEdit = useCallback(async (item: Transaction, draft: EditDraft) => {
    const amount = parseMoneyInput(draft.amountText);
    if (amount <= 0) {
      Alert.alert('Số tiền không hợp lệ', 'Số tiền phải lớn hơn 0.');
      return;
    }
    await updateTransaction(db, item.id, {
      amount,
      transactionName: draft.transactionName.trim() || null,
      category: draft.category,
      note: draft.note.trim() || null,
      status: draft.status
    });
    setSelectedTransaction(null);
    await refresh();
  }, [db, refresh]);

  const removeTransaction = useCallback(async (item: Transaction) => {
    await deleteTransaction(db, item.id);
    setSelectedTransaction(null);
    await refresh();
  }, [db, refresh]);

  const choosePaymentBank = useCallback(async (appId: string) => {
    setPaymentBankId(appId);
    await setSetting(db, 'paymentBank', appId);
  }, [db]);

  const saveMonthlyBudget = useCallback(async (value: number) => {
    setMonthlyBudget(value);
    await setSetting(db, 'monthlyBudget', String(Math.round(value)));
    Alert.alert(
      'Đã lưu thành công',
      value > 0 ? `Giới hạn chi tiêu tháng là ${formatVnd(value)}.` : 'Đã tắt giới hạn chi tiêu tháng.'
    );
  }, [db]);

  const changeTheme = useCallback(async (mode: ThemeMode) => {
    setThemeMode(mode);
    await setSetting(db, 'themeMode', mode);
  }, [db]);

  const toggleNotifications = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Chưa có quyền thông báo', 'Bạn có thể bật quyền cho Chi Tiêu QR trong Cài đặt iPhone.');
        return;
      }
      try {
        await scheduleDailySummaryNotification(budget, balance, notificationHour, notificationMinute, true);
      } catch {
        Alert.alert('Không thể lên lịch thông báo', 'iOS chưa cho phép app tạo lịch thông báo. Hãy kiểm tra quyền Thông báo rồi thử lại.');
        return;
      }
    } else {
      await cancelDailySummaryNotification().catch(() => undefined);
    }
    setNotificationsEnabled(enabled);
    await setSetting(db, 'notificationsEnabled', enabled ? '1' : '0');
  }, [balance, budget, db, notificationHour, notificationMinute]);

  const changeNotificationTime = useCallback(async (hour: number, minute: number) => {
    setNotificationHour(hour);
    setNotificationMinute(minute);
    await setSettings(db, {
      notificationHour: String(hour),
      notificationMinute: String(minute)
    });
    if (notificationsEnabled) {
      try {
        await scheduleDailySummaryNotification(budget, balance, hour, minute, true);
      } catch {
        Alert.alert('Đã lưu thời gian nhưng chưa lên lịch được', 'Hãy kiểm tra quyền Thông báo của Chi Tiêu QR trong Cài đặt iPhone.');
        return;
      }
    }
    Alert.alert('Đã lưu giờ tổng kết', `Thông báo sẽ được lên lịch hằng ngày lúc ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`);
  }, [balance, budget, db, notificationsEnabled]);

  const testNotification = useCallback(async () => {
    try {
      await sendTestNotification(budget, balance);
      const scheduled = await getScheduledDailySummaryCount();
      Alert.alert(
        'Đã lên lịch thông báo thử',
        `Thông báo thử sẽ xuất hiện sau khoảng 5 giây. Lịch tổng kết hằng ngày hiện có ${scheduled} thông báo đã lên lịch.`
      );
    } catch {
      Alert.alert('Không gửi được thông báo', 'Hãy bật quyền Thông báo cho Chi Tiêu QR trong Cài đặt iPhone rồi thử lại.');
    }
  }, [balance, budget]);

  return (
    <ThemeContext.Provider value={{ styles, colors, isDark }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.app}>
        <View style={styles.screen}>
          {tab === 'home' && (
            <HomeScreen
              budget={budget}
              balance={balance}
              transactions={transactions.slice(0, 6)}
              onScan={() => setScannerVisible(true)}
              onManual={() => setManualVisible(true)}
              onReceive={openReceive}
              onEditBalance={() => setBalanceVisible(true)}
              onOpenTransaction={setSelectedTransaction}
              onOpenBudget={() => setTab('settings')}
            />
          )}
          {tab === 'history' && (
            <HistoryScreen transactions={transactions} onOpenTransaction={setSelectedTransaction} />
          )}
          {tab === 'stats' && <StatsScreen transactions={completedTransactions} />}
          {tab === 'settings' && (
            <SettingsScreen
              paymentBankId={paymentBankId}
              monthlyBudget={monthlyBudget}
              notificationsEnabled={notificationsEnabled}
              notificationHour={notificationHour}
              notificationMinute={notificationMinute}
              themeMode={themeMode}
              onChooseBank={choosePaymentBank}
              onSaveBudget={saveMonthlyBudget}
              onToggleNotifications={toggleNotifications}
              onChangeNotificationTime={changeNotificationTime}
              onTestNotification={testNotification}
              onChangeTheme={changeTheme}
            />
          )}
        </View>

        <BottomTabs tab={tab} onChange={setTab} onScan={() => setScannerVisible(true)} />
        <ScannerModal visible={scannerVisible} onClose={() => setScannerVisible(false)} onScanned={handleScan} />
        <PaymentModal draft={paymentDraft} paymentBankId={paymentBankId} onChange={setPaymentDraft} onClose={() => setPaymentDraft(null)} onPay={startBankPayment} />
        <ManualModal visible={manualVisible} draft={manualDraft} onChange={setManualDraft} onClose={() => setManualVisible(false)} onSave={addManual} />
        <BalanceModal
          visible={balanceVisible}
          currentBalance={balance.currentBalance}
          onClose={() => setBalanceVisible(false)}
          onSave={saveCurrentBalance}
        />
        <ReceiveMoneyModal
          visible={receiveVisible}
          draft={receiveDraft}
          onChange={setReceiveDraft}
          onClose={() => setReceiveVisible(false)}
          onGenerateQr={generateReceiveQr}
          onSaveManual={addManualIncome}
        />
        <ReceiveQrModal
          session={receiveQrSession}
          onClose={() => setReceiveQrSession(null)}
          onFinish={finishReceiveQr}
        />
        <ReviewModal visible={reviewId !== null} onFinish={finishReview} />
        <TransactionDetailModal
          item={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onSave={saveTransactionEdit}
          onDelete={removeTransaction}
        />
      </View>
    </ThemeContext.Provider>
  );
}

function HomeScreen(props: {
  budget: ReturnType<typeof calculateBudgetSnapshot>;
  balance: BalanceSnapshot;
  transactions: Transaction[];
  onScan: () => void;
  onManual: () => void;
  onReceive: () => void;
  onEditBalance: () => void;
  onOpenTransaction: (item: Transaction) => void;
  onOpenBudget: () => void;
}) {
  const { styles } = useAppTheme();
  const month = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date());
  const hasBudget = props.budget.monthlyLimit > 0;
  const canSpend = props.budget.canSpendToday;
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>CHI TIÊU CÁ NHÂN</Text>
      <Text style={styles.title}>Tổng quan</Text>

      <View style={styles.balanceCard}>
        <View style={styles.balanceTopRow}>
          <View style={styles.balanceTextWrap}>
            <Text style={styles.balanceLabel}>Số dư hiện tại</Text>
            <Text style={styles.balanceAmount}>{formatVnd(props.balance.currentBalance)}</Text>
          </View>
          <Pressable style={styles.balanceEditButton} onPress={props.onEditBalance}>
            <Text style={styles.balanceEditText}>{props.balance.configured ? 'Cập nhật' : 'Đặt số dư'}</Text>
          </Pressable>
        </View>
        <View style={styles.balanceFlowRow}>
          <Text style={styles.balanceIncome}>+{formatVnd(props.balance.todayIncome)} nhận hôm nay</Text>
          <Text style={styles.balanceExpense}>-{formatVnd(props.balance.todayExpense)} chi hôm nay</Text>
        </View>
        {!props.balance.configured ? (
          <Text style={styles.balanceHint}>Chưa đặt số dư gốc. App đang tính từ mốc 0 ₫ kể từ lần cập nhật này.</Text>
        ) : null}
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>{hasBudget ? `Còn có thể tiêu hôm nay` : `Đã chi trong ${month}`}</Text>
        <Text style={styles.heroAmount}>
          {hasBudget ? formatVnd(Math.max(0, canSpend)) : formatVnd(props.budget.monthSpent)}
        </Text>
        {hasBudget ? (
          <>
            <Text style={styles.heroHint}>
              Hạn mức hôm nay {formatVnd(props.budget.dailyAllowance)} · đã chi {formatVnd(props.budget.spentToday)}
            </Text>
            {canSpend < 0 ? <Text style={styles.overBudgetText}>Đã vượt hạn mức hôm nay {formatVnd(Math.abs(canSpend))}</Text> : null}
          </>
        ) : (
          <Pressable onPress={props.onOpenBudget}><Text style={styles.heroAction}>Đặt giới hạn chi tiêu tháng →</Text></Pressable>
        )}
      </View>

      {hasBudget ? (
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeadingRow}>
            <View>
              <Text style={styles.cardLabel}>Ngân sách tháng</Text>
              <Text style={styles.budgetMain}>{formatVnd(props.budget.monthSpent)} / {formatVnd(props.budget.monthlyLimit)}</Text>
            </View>
            <Text style={styles.budgetRemaining}>{props.budget.monthRemaining >= 0 ? 'Còn ' : 'Vượt '}{formatVnd(Math.abs(props.budget.monthRemaining))}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${props.budget.progress <= 0 ? 0 : Math.min(100, Math.max(2, props.budget.progress * 100))}%` }]} />
          </View>
          <Text style={styles.budgetSummary}>{dailySummaryText(props.budget)}</Text>
        </View>
      ) : null}

      <View style={styles.quickRow}>
        <Pressable style={[styles.quickButton, styles.primaryQuick]} onPress={props.onScan}>
          <Text style={styles.primaryQuickIcon}>▦</Text>
          <Text style={styles.primaryQuickText}>Quét QR</Text>
        </Pressable>
        <Pressable style={styles.quickButton} onPress={props.onManual}>
          <Text style={styles.quickIcon}>＋</Text>
          <Text style={styles.quickText}>Chi thủ công</Text>
        </Pressable>
        <Pressable style={styles.quickButton} onPress={props.onReceive}>
          <Text style={styles.quickIcon}>↓</Text>
          <Text style={styles.quickText}>Nhận tiền</Text>
        </Pressable>
      </View>

      <SectionHeader title="Giao dịch gần đây" />
      {props.transactions.length === 0 ? (
        <EmptyCard text="Chưa có giao dịch. Quét QR đầu tiên để bắt đầu." />
      ) : (
        <View style={styles.listCard}>
          {props.transactions.map((item, index) => (
            <TransactionRow
              key={item.id}
              item={item}
              showDivider={index < props.transactions.length - 1}
              showStatus={item.status !== 'completed'}
              onPress={() => props.onOpenTransaction(item)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function HistoryScreen(props: { transactions: Transaction[]; onOpenTransaction: (item: Transaction) => void }) {
  const { styles } = useAppTheme();
  const [filter, setFilter] = useState<TimeFilter>('month');
  const filtered = useMemo(() => filterTransactionsByTime(props.transactions, filter), [filter, props.transactions]);
  return (
    <View style={styles.pageFlex}>
      <Text style={styles.eyebrow}>LỊCH SỬ</Text>
      <Text style={styles.title}>Giao dịch</Text>
      <TimeFilterBar value={filter} onChange={setFilter} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.historyList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyCard text="Không có giao dịch trong khoảng thời gian này." />}
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <TransactionRow item={item} showStatus onPress={() => props.onOpenTransaction(item)} />
          </View>
        )}
      />
    </View>
  );
}

function StatsScreen({ transactions }: { transactions: Transaction[] }) {
  const { styles } = useAppTheme();
  const [filter, setFilter] = useState<TimeFilter>('month');
  const filtered = useMemo(() => filterTransactionsByTime(transactions, filter), [filter, transactions]);
  const expenses = useMemo(() => filtered.filter((item) => item.direction !== 'income'), [filtered]);
  const incomes = useMemo(() => filtered.filter((item) => item.direction === 'income'), [filtered]);
  const totalExpense = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);
  const totalIncome = useMemo(() => incomes.reduce((sum, item) => sum + item.amount, 0), [incomes]);
  const net = totalIncome - totalExpense;
  const summary = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
    return [...map.entries()].map(([category, value]) => ({ category, total: value })).sort((a, b) => b.total - a.total);
  }, [expenses]);
  const max = Math.max(...summary.map((item) => item.total), 1);
  const average = expenses.length ? totalExpense / expenses.length : 0;
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>THỐNG KÊ</Text>
      <Text style={styles.title}>Thu · chi</Text>
      <TimeFilterBar value={filter} onChange={setFilter} />
      <View style={styles.statTotalCard}>
        <Text style={styles.statTotalLabel}>Dòng tiền trong kỳ</Text>
        <View style={styles.cashFlowGrid}>
          <View style={styles.cashFlowCell}>
            <Text style={styles.cashFlowLabel}>Đã nhận</Text>
            <Text style={styles.cashFlowIncome}>+{formatVnd(totalIncome)}</Text>
          </View>
          <View style={styles.cashFlowCell}>
            <Text style={styles.cashFlowLabel}>Đã chi</Text>
            <Text style={styles.cashFlowExpense}>-{formatVnd(totalExpense)}</Text>
          </View>
        </View>
        <View style={styles.statNetRow}>
          <Text style={styles.statTotalLabel}>Chênh lệch</Text>
          <Text style={[styles.statNetValue, net < 0 && styles.statNetNegative]}>{net >= 0 ? '+' : '-'}{formatVnd(Math.abs(net))}</Text>
        </View>
        <View style={styles.statMiniRow}>
          <View><Text style={styles.miniLabel}>Giao dịch chi</Text><Text style={styles.miniValue}>{expenses.length}</Text></View>
          <View><Text style={styles.miniLabel}>Giao dịch nhận</Text><Text style={styles.miniValue}>{incomes.length}</Text></View>
          <View><Text style={styles.miniLabel}>Chi trung bình</Text><Text style={styles.miniValue}>{formatVnd(average)}</Text></View>
        </View>
      </View>
      <SectionHeader title="Chi theo danh mục" />
      {summary.length === 0 ? (
        <EmptyCard text="Có giao dịch chi hoàn tất thì thống kê theo danh mục sẽ xuất hiện ở đây." />
      ) : (
        <View style={styles.statsCard}>
          {summary.map((item) => {
            const category = categoryById(item.category);
            const pct = totalExpense > 0 ? Math.round((item.total / totalExpense) * 100) : 0;
            return (
              <View key={item.category} style={styles.statRow}>
                <View style={styles.statHeading}>
                  <Text style={styles.statName}>{category.icon} {category.label}</Text>
                  <Text style={styles.statAmount}>{formatVnd(item.total)}</Text>
                </View>
                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, (item.total / max) * 100)}%` }]} /></View>
                <Text style={styles.statPct}>{pct}% tổng chi</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function SettingsScreen(props: {
  paymentBankId: string;
  monthlyBudget: number;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  themeMode: ThemeMode;
  onChooseBank: (id: string) => void;
  onSaveBudget: (value: number) => void;
  onToggleNotifications: (value: boolean) => void;
  onChangeNotificationTime: (hour: number, minute: number) => void;
  onTestNotification: () => void;
  onChangeTheme: (mode: ThemeMode) => void;
}) {
  const { styles, colors } = useAppTheme();
  const [budgetText, setBudgetText] = useState(() => props.monthlyBudget ? formatMoneyInput(String(props.monthlyBudget)) : '');
  const [hourText, setHourText] = useState(() => String(props.notificationHour).padStart(2, '0'));
  const [minuteText, setMinuteText] = useState(() => String(props.notificationMinute).padStart(2, '0'));

  useEffect(() => {
    setBudgetText(props.monthlyBudget ? formatMoneyInput(String(props.monthlyBudget)) : '');
  }, [props.monthlyBudget]);

  useEffect(() => {
    setHourText(String(props.notificationHour).padStart(2, '0'));
    setMinuteText(String(props.notificationMinute).padStart(2, '0'));
  }, [props.notificationHour, props.notificationMinute]);

  const saveNotificationTime = () => {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      Alert.alert('Giờ chưa hợp lệ', 'Giờ phải từ 00–23 và phút phải từ 00–59.');
      return;
    }
    void props.onChangeNotificationTime(hour, minute);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CÀI ĐẶT</Text>
      <Text style={styles.title}>Tùy chỉnh</Text>

      <SettingsSection title="Ngân sách tháng">
        <Text style={styles.settingDescription}>Đặt số tiền tối đa bạn muốn chi trong mỗi tháng. Hạn mức ngày sẽ tự cân bằng theo số tiền còn lại.</Text>
        <TextInput
          value={budgetText}
          onChangeText={(text) => setBudgetText(formatMoneyInput(text))}
          keyboardType="number-pad"
          placeholder="Ví dụ: 5.000.000"
          placeholderTextColor={colors.placeholder}
          style={styles.moneyInput}
        />
        <Pressable style={styles.primaryButton} onPress={() => void props.onSaveBudget(parseMoneyInput(budgetText))}>
          <Text style={styles.primaryButtonText}>Lưu giới hạn tháng</Text>
        </Pressable>
      </SettingsSection>

      <SettingsSection title="Thông báo">
        <View style={styles.settingToggleRow}>
          <View style={styles.settingToggleText}>
            <Text style={styles.settingName}>Tổng kết cuối ngày</Text>
            <Text style={styles.settingDescription}>Thông báo gồm số đã chi, số đã nhận, hạn mức còn lại, chi tiêu tháng và số dư hiện tại.</Text>
          </View>
          <Switch value={props.notificationsEnabled} onValueChange={(value) => void props.onToggleNotifications(value)} />
        </View>
        {props.notificationsEnabled ? (
          <>
            <Text style={styles.settingSubheading}>Thời gian tổng kết</Text>
            <View style={styles.timeInputRow}>
              <View style={styles.timeField}>
                <Text style={styles.timeFieldLabel}>Giờ</Text>
                <TextInput
                  value={hourText}
                  onChangeText={(text) => setHourText(text.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="22"
                  placeholderTextColor={colors.placeholder}
                  style={styles.timeInput}
                  textAlign="center"
                />
              </View>
              <Text style={styles.timeColon}>:</Text>
              <View style={styles.timeField}>
                <Text style={styles.timeFieldLabel}>Phút</Text>
                <TextInput
                  value={minuteText}
                  onChangeText={(text) => setMinuteText(text.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="30"
                  placeholderTextColor={colors.placeholder}
                  style={styles.timeInput}
                  textAlign="center"
                />
              </View>
            </View>
            <Text style={styles.timePreview}>Hiện tại: {String(props.notificationHour).padStart(2, '0')}:{String(props.notificationMinute).padStart(2, '0')} hằng ngày</Text>
            <Pressable style={styles.primaryButton} onPress={saveNotificationTime}>
              <Text style={styles.primaryButtonText}>Lưu giờ tổng kết</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void props.onTestNotification()}>
              <Text style={styles.secondaryButtonText}>Gửi thông báo thử sau 5 giây</Text>
            </Pressable>
            <Text style={styles.notificationHint}>Nếu thông báo thử không xuất hiện, kiểm tra Cài đặt iPhone → Thông báo → Chi Tiêu QR và bảo đảm Cho phép thông báo đang bật.</Text>
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Giao diện">
        <View style={styles.optionRow}>
          <ChoiceChip label="Theo máy" selected={props.themeMode === 'system'} onPress={() => void props.onChangeTheme('system')} />
          <ChoiceChip label="Sáng" selected={props.themeMode === 'light'} onPress={() => void props.onChangeTheme('light')} />
          <ChoiceChip label="Tối" selected={props.themeMode === 'dark'} onPress={() => void props.onChangeTheme('dark')} />
        </View>
      </SettingsSection>

      <SettingsSection title="Ngân hàng thanh toán">
        <Text style={styles.settingDescription}>Chọn app ngân hàng dùng mặc định khi thanh toán QR.</Text>
        <View style={styles.bankList}>
          {PAYMENT_BANKS.map((bank) => {
            const selected = bank.appId === props.paymentBankId;
            return (
              <Pressable key={bank.appId} style={[styles.bankRow, selected && styles.bankRowSelected]} onPress={() => void props.onChooseBank(bank.appId)}>
                <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
                <View style={styles.bankTextWrap}>
                  <Text style={styles.bankAppName}>{bank.appName}</Text>
                  <Text style={styles.bankMeta}>{bank.bankName}</Text>
                </View>
                <Text style={bank.autofill ? styles.autofillBadge : styles.openBadge}>{bank.autofill ? 'Tự điền' : 'Mở app'}</Text>
              </Pressable>
            );
          })}
        </View>
      </SettingsSection>

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>🔒 Local-first</Text>
        <Text style={styles.privacyText}>Lịch sử, số dư, ngân sách và tùy chỉnh nằm trong SQLite trên iPhone. Riêng ảnh VietQR nhận tiền được tải từ dịch vụ ảnh VietQR khi bạn tạo mã.</Text>
      </View>
    </ScrollView>
  );
}

function TimeFilterBar(props: { value: TimeFilter; onChange: (value: TimeFilter) => void }) {
  const { styles } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);

  const centerSelected = useCallback((id: TimeFilter, animated = true) => {
    const layout = chipLayouts.current[id];
    if (!layout || viewportWidth <= 0) return;
    const x = Math.max(0, layout.x + layout.width / 2 - viewportWidth / 2);
    scrollRef.current?.scrollTo({ x, animated });
  }, [viewportWidth]);

  useEffect(() => {
    const timer = setTimeout(() => centerSelected(props.value), 40);
    return () => clearTimeout(timer);
  }, [centerSelected, props.value]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={[styles.filterRow, { paddingHorizontal: viewportWidth / 2 }]}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
    >
      {TIME_FILTERS.map((item) => (
        <View
          key={item.id}
          onLayout={(event) => {
            chipLayouts.current[item.id] = {
              x: event.nativeEvent.layout.x,
              width: event.nativeEvent.layout.width
            };
            if (props.value === item.id) requestAnimationFrame(() => centerSelected(item.id, false));
          }}
        >
          <ChoiceChip
            label={item.label}
            selected={props.value === item.id}
            onPress={() => {
              props.onChange(item.id);
              requestAnimationFrame(() => centerSelected(item.id));
            }}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function ChoiceChip(props: { label: string; selected: boolean; onPress: () => void }) {
  const { styles } = useAppTheme();
  return (
    <Pressable style={[styles.choiceChip, props.selected && styles.choiceChipSelected]} onPress={props.onPress}>
      <Text style={[styles.choiceChipText, props.selected && styles.choiceChipTextSelected]}>{props.label}</Text>
    </Pressable>
  );
}

function SettingsSection(props: { title: string; children: React.ReactNode }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.settingsSection}>
      <Text style={styles.settingsSectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function BottomTabs(props: { tab: Tab; onChange: (tab: Tab) => void; onScan: () => void }) {
  const { styles } = useAppTheme();
  const items: Array<{ id: Tab; icon: string; label: string }> = [
    { id: 'home', icon: '⌂', label: 'Trang chủ' },
    { id: 'history', icon: '≡', label: 'Lịch sử' },
    { id: 'stats', icon: '▥', label: 'Thống kê' },
    { id: 'settings', icon: '⚙', label: 'Cài đặt' }
  ];
  return (
    <View style={styles.tabBar}>
      {items.slice(0, 2).map((item) => <TabButton key={item.id} icon={item.icon} label={item.label} active={props.tab === item.id} onPress={() => props.onChange(item.id)} />)}
      <Pressable style={styles.scanFab} onPress={props.onScan}><Text style={styles.scanFabIcon}>▦</Text></Pressable>
      {items.slice(2).map((item) => <TabButton key={item.id} icon={item.icon} label={item.label} active={props.tab === item.id} onPress={() => props.onChange(item.id)} />)}
    </View>
  );
}

function TabButton(props: { icon: string; label: string; active: boolean; onPress: () => void }) {
  const { styles } = useAppTheme();
  return (
    <Pressable style={styles.tabButton} onPress={props.onPress}>
      <Text style={[styles.tabIcon, props.active && styles.tabActive]}>{props.icon}</Text>
      <Text style={[styles.tabLabel, props.active && styles.tabActive]}>{props.label}</Text>
    </Pressable>
  );
}

function ScannerModal(props: { visible: boolean; onClose: () => void; onScanned: (raw: string) => Promise<ScanOutcome> }) {
  const { styles } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const lockedRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [scanMessage, setScanMessage] = useState('Đưa toàn bộ mã QR vào trong khung');
  const scanSize = 270;
  const scanTop = layout.height ? Math.round(layout.height * 0.28) : 220;
  const scanLeft = layout.width ? Math.round((layout.width - scanSize) / 2) : 0;

  useEffect(() => {
    if (props.visible) {
      lockedRef.current = false;
      setScanMessage('Đưa toàn bộ mã QR vào trong khung');
    }
    return () => { if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current); };
  }, [props.visible]);

  const isInsideScanBox = useCallback((result: BarcodeScanningResult) => {
    if (!layout.width || !layout.height) return false;
    const left = scanLeft;
    const top = scanTop;
    const right = left + scanSize;
    const bottom = top + scanSize;
    const inside = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
    if (result.cornerPoints?.length) return result.cornerPoints.every((point) => inside(point.x, point.y));
    const bounds = result.bounds;
    if (bounds?.size?.width > 0 && bounds?.size?.height > 0) {
      const x2 = bounds.origin.x + bounds.size.width;
      const y2 = bounds.origin.y + bounds.size.height;
      return inside(bounds.origin.x, bounds.origin.y) && inside(x2, y2);
    }
    return false;
  }, [layout.height, layout.width, scanLeft, scanTop]);

  const handleBarcode = useCallback(async (result: BarcodeScanningResult) => {
    if (lockedRef.current || !isInsideScanBox(result)) return;
    lockedRef.current = true;
    const outcome = await props.onScanned(result.data);
    if (outcome.accepted) return;
    setScanMessage(outcome.message || 'Không đọc được mã này.');
    unlockTimerRef.current = setTimeout(() => {
      lockedRef.current = false;
      setScanMessage('Đưa toàn bộ mã QR vào trong khung');
    }, 1500);
  }, [isInsideScanBox, props]);

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose}>
      <View style={styles.scannerRoot} onLayout={(event) => setLayout(event.nativeEvent.layout)}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionTitle}>Cần quyền camera</Text>
            <Text style={styles.permissionText}>Camera chỉ dùng để đọc mã QR thanh toán.</Text>
            <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}><Text style={styles.primaryButtonText}>Cho phép camera</Text></Pressable>
            <Pressable style={styles.textButton} onPress={props.onClose}><Text style={styles.textButtonText}>Đóng</Text></Pressable>
          </View>
        ) : (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(result) => void handleBarcode(result)} />
        )}
        {permission?.granted ? (
          <>
            <View style={styles.scannerTop}>
              <Pressable style={styles.scannerClose} onPress={props.onClose}><Text style={styles.scannerCloseText}>×</Text></Pressable>
              <Text style={styles.scannerTitle}>Quét QR thanh toán</Text><View style={styles.scannerSpacer} />
            </View>
            <View style={[styles.scanShade, { top: 0, height: scanTop }]} pointerEvents="none" />
            <View style={[styles.scanShade, { top: scanTop + scanSize, bottom: 0 }]} pointerEvents="none" />
            <View style={[styles.scanShade, { top: scanTop, left: 0, width: Math.max(0, scanLeft), height: scanSize }]} pointerEvents="none" />
            <View style={[styles.scanShade, { top: scanTop, right: 0, width: Math.max(0, scanLeft), height: scanSize }]} pointerEvents="none" />
            <View style={[styles.scannerGuideWrap, { top: scanTop }]} pointerEvents="none">
              <View style={styles.scannerGuide} /><Text style={styles.scannerHint}>{scanMessage}</Text>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function PaymentModal(props: {
  draft: PaymentDraft | null;
  paymentBankId: string;
  onChange: (draft: PaymentDraft | null) => void;
  onClose: () => void;
  onPay: () => void;
}) {
  const { styles, colors } = useAppTheme();
  const bank = PAYMENT_BANKS.find((item) => item.appId === props.paymentBankId) ?? PAYMENT_BANKS[0]!;
  const draft = props.draft;
  return (
    <Modal visible={draft !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      {draft ? (
        <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <ModalHeader title="Thanh toán" onClose={props.onClose} />
            <View style={styles.receiverCard}>
              <Text style={styles.receiverBank}>{draft.qr.kind === 'momo' ? 'MOMO' : (draft.qr.bankName ?? 'Ngân hàng thụ hưởng')}</Text>
              <Text style={styles.receiverName}>{draft.qr.kind === 'momo' ? 'QR thanh toán MoMo' : (draft.qr.receiverName ?? 'Người nhận từ QR')}</Text>
              {draft.qr.accountNo ? <Text style={styles.receiverAccount}>{draft.qr.accountNo}</Text> : null}
              {draft.qr.crcValid === false ? <Text style={styles.warningText}>⚠ CRC của QR không hợp lệ</Text> : null}
            </View>
            <FieldLabel>Tên giao dịch</FieldLabel>
            <TextInput value={draft.transactionName} onChangeText={(transactionName) => props.onChange({ ...draft, transactionName })} placeholder="Ví dụ: Cà phê Highlands" placeholderTextColor={colors.placeholder} style={styles.input} maxLength={60} />
            <FieldLabel>Số tiền</FieldLabel>
            <TextInput value={draft.amountText} onChangeText={(text) => props.onChange({ ...draft, amountText: formatMoneyInput(text) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.placeholder} style={styles.moneyInput} />
            <FieldLabel>Danh mục</FieldLabel>
            <CategoryPicker selected={draft.category} onSelect={(category) => props.onChange({ ...draft, category })} />
            <FieldLabel>Ghi chú / nội dung chuyển khoản</FieldLabel>
            <TextInput value={draft.note} onChangeText={(note) => props.onChange({ ...draft, note })} placeholder="Ví dụ: An trua" placeholderTextColor={colors.placeholder} style={styles.input} maxLength={100} />
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentInfoTitle}>Sẽ mở {draft.qr.kind === 'momo' ? 'MoMo' : bank.appName}</Text>
              <Text style={styles.paymentInfoText}>
                {draft.qr.kind === 'momo'
                  ? 'App mở QR/link MoMo gốc. Với QR MoMo tĩnh, bạn có thể cần nhập lại số tiền trong MoMo.'
                  : bank.autofill && draft.qr.bankCode
                    ? 'Hãy kiểm tra lại người nhận và số tiền trong app ngân hàng trước khi xác nhận.'
                    : 'Nếu ngân hàng chưa tự điền được, dùng các nút sao chép bên dưới.'}
              </Text>
            </View>
            {draft.qr.kind !== 'momo' && (!bank.autofill || !draft.qr.bankCode) ? (
              <View style={styles.copyPanel}>
                <CopyRow label="Số tài khoản" value={draft.qr.accountNo ?? ''} />
                <CopyRow label="Số tiền" value={String(parseMoneyInput(draft.amountText))} displayValue={draft.amountText ? `${draft.amountText} ₫` : '0 ₫'} />
                {draft.note.trim() ? <CopyRow label="Nội dung" value={draft.note.trim()} /> : null}
              </View>
            ) : null}
            <Pressable style={styles.primaryButton} onPress={props.onPay}><Text style={styles.primaryButtonText}>Mở {draft.qr.kind === 'momo' ? 'MoMo' : bank.appName}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

function ManualModal(props: { visible: boolean; draft: ManualDraft; onChange: (draft: ManualDraft) => void; onClose: () => void; onSave: () => void }) {
  const { styles, colors } = useAppTheme();
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <ModalHeader title="Thêm khoản chi" onClose={props.onClose} />
          <FieldLabel>Số tiền</FieldLabel>
          <TextInput value={props.draft.amountText} onChangeText={(text) => props.onChange({ ...props.draft, amountText: formatMoneyInput(text) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.placeholder} style={styles.moneyInput} />
          <FieldLabel>Tên giao dịch</FieldLabel>
          <TextInput value={props.draft.merchant} onChangeText={(merchant) => props.onChange({ ...props.draft, merchant })} placeholder="Ví dụ: Highlands Coffee" placeholderTextColor={colors.placeholder} style={styles.input} />
          <FieldLabel>Danh mục</FieldLabel>
          <CategoryPicker selected={props.draft.category} onSelect={(category) => props.onChange({ ...props.draft, category })} />
          <FieldLabel>Ghi chú</FieldLabel>
          <TextInput value={props.draft.note} onChangeText={(note) => props.onChange({ ...props.draft, note })} placeholder="Không bắt buộc" placeholderTextColor={colors.placeholder} style={styles.input} />
          <Pressable style={styles.primaryButton} onPress={props.onSave}><Text style={styles.primaryButtonText}>Lưu khoản chi</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}


function BalanceModal(props: {
  visible: boolean;
  currentBalance: number;
  onClose: () => void;
  onSave: (value: number) => void;
}) {
  const { styles, colors } = useAppTheme();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (props.visible) setValue(formatMoneyInput(String(Math.max(0, props.currentBalance))));
  }, [props.currentBalance, props.visible]);

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <ModalHeader title="Số dư hiện tại" onClose={props.onClose} />
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentInfoTitle}>Đặt mốc số dư</Text>
            <Text style={styles.paymentInfoText}>Nhập số tiền thực tế bạn đang có. Từ mốc này, khoản chi hoàn tất sẽ trừ và tiền nhận hoàn tất sẽ cộng vào số dư tự động.</Text>
          </View>
          <FieldLabel>Số dư đang có</FieldLabel>
          <TextInput
            value={value}
            onChangeText={(text) => setValue(formatMoneyInput(text))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.placeholder}
            style={styles.moneyInput}
          />
          <Pressable style={styles.primaryButton} onPress={() => void props.onSave(parseMoneyInput(value))}>
            <Text style={styles.primaryButtonText}>Lưu số dư hiện tại</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReceiveMoneyModal(props: {
  visible: boolean;
  draft: ReceiveDraft;
  onChange: (draft: ReceiveDraft) => void;
  onClose: () => void;
  onGenerateQr: () => void;
  onSaveManual: () => void;
}) {
  const { styles, colors } = useAppTheme();
  const [mode, setMode] = useState<'qr' | 'manual'>('qr');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  const bank = bankFromBin(props.draft.bankBin);

  const filteredBanks = useMemo(() => {
    const needle = bankQuery.trim().toLowerCase();
    if (!needle) return RECEIVING_BANKS;
    return RECEIVING_BANKS.filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle) ||
      item.bin.includes(needle)
    );
  }, [bankQuery]);

  useEffect(() => {
    if (props.visible) {
      setMode('qr');
      setShowBankPicker(false);
      setBankQuery('');
    }
  }, [props.visible]);

  const closeReceive = useCallback(() => {
    // Nếu đang ở danh sách ngân hàng, nút back/close chỉ quay lại form nhận tiền.
    // Điều này tránh để một native Modal ẩn còn giữ lớp chặn touch trên iOS.
    if (showBankPicker) {
      setShowBankPicker(false);
      setBankQuery('');
      return;
    }
    props.onClose();
  }, [props, showBankPicker]);

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeReceive}>
      <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {showBankPicker ? (
          <View style={styles.bankPickerModalContent}>
            <ModalHeader title="Chọn ngân hàng" onClose={() => {
              setShowBankPicker(false);
              setBankQuery('');
            }} />
            <TextInput
              value={bankQuery}
              onChangeText={setBankQuery}
              placeholder="Tìm tên, mã hoặc BIN ngân hàng"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              style={{ flex: 1 }}
              data={filteredBanks}
              keyExtractor={(item) => item.bin}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.bankPickerList}
              ListEmptyComponent={(
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Không tìm thấy ngân hàng phù hợp.</Text>
                </View>
              )}
              renderItem={({ item }) => {
                const selected = item.bin === props.draft.bankBin;
                return (
                  <Pressable
                    style={[styles.bankPickerListRow, selected && styles.bankRowSelected]}
                    onPress={() => {
                      props.onChange({ ...props.draft, bankBin: item.bin });
                      setShowBankPicker(false);
                      setBankQuery('');
                    }}
                  >
                    <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
                    <View style={styles.bankTextWrap}>
                      <Text style={styles.bankAppName}>{item.name}</Text>
                      <Text style={styles.bankMeta}>{item.code} · BIN {item.bin}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <ModalHeader title="Nhận tiền" onClose={props.onClose} />
            <View style={styles.segmentRow}>
              <ChoiceChip label="Tạo mã QR" selected={mode === 'qr'} onPress={() => setMode('qr')} />
              <ChoiceChip label="Nhập thủ công" selected={mode === 'manual'} onPress={() => setMode('manual')} />
            </View>

            {mode === 'qr' ? (
              <>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentInfoTitle}>VietQR nhận tiền</Text>
                  <Text style={styles.paymentInfoText}>Ngân hàng và số tài khoản sẽ được nhớ cho lần sau. Số tiền nhận sẽ luôn được để trống sau mỗi giao dịch.</Text>
                </View>
                <FieldLabel>Ngân hàng nhận</FieldLabel>
                <Pressable
                  style={styles.bankPickerButton}
                  onPress={() => {
                    setBankQuery('');
                    setShowBankPicker(true);
                  }}
                >
                  <View style={styles.bankPickerTextWrap}>
                    <Text style={styles.bankPickerLabel}>{bank?.name ?? 'Chọn ngân hàng'}</Text>
                    {props.draft.bankBin ? <Text style={styles.bankPickerMeta}>BIN {props.draft.bankBin}</Text> : null}
                  </View>
                  <Text style={styles.bankPickerChevron}>›</Text>
                </Pressable>
                <FieldLabel>Số tài khoản</FieldLabel>
                <TextInput
                  value={props.draft.accountNo}
                  onChangeText={(accountNo) => props.onChange({ ...props.draft, accountNo: accountNo.replace(/\D/g, '').slice(0, 19) })}
                  keyboardType="number-pad"
                  placeholder="Nhập số tài khoản"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
                <FieldLabel>Số tiền cần nhận</FieldLabel>
                <TextInput
                  value={props.draft.amountText}
                  onChangeText={(text) => props.onChange({ ...props.draft, amountText: formatMoneyInput(text) })}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  style={styles.moneyInput}
                />
                <FieldLabel>Tên giao dịch</FieldLabel>
                <TextInput
                  value={props.draft.transactionName}
                  onChangeText={(transactionName) => props.onChange({ ...props.draft, transactionName })}
                  placeholder="Ví dụ: Nhận tiền ăn nhóm"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
                <FieldLabel>Nội dung chuyển khoản</FieldLabel>
                <TextInput
                  value={props.draft.note}
                  onChangeText={(note) => props.onChange({ ...props.draft, note })}
                  placeholder="Không bắt buộc"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
                <Pressable style={styles.primaryButton} onPress={() => void props.onGenerateQr()}>
                  <Text style={styles.primaryButtonText}>Tạo mã QR nhận tiền</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentInfoTitle}>Ghi nhận tiền đã nhận</Text>
                  <Text style={styles.paymentInfoText}>Dùng khi bạn nhận tiền mặt hoặc chuyển khoản bên ngoài mã QR của app.</Text>
                </View>
                <FieldLabel>Số tiền đã nhận</FieldLabel>
                <TextInput
                  value={props.draft.amountText}
                  onChangeText={(text) => props.onChange({ ...props.draft, amountText: formatMoneyInput(text) })}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  style={styles.moneyInput}
                />
                <FieldLabel>Tên giao dịch</FieldLabel>
                <TextInput
                  value={props.draft.transactionName}
                  onChangeText={(transactionName) => props.onChange({ ...props.draft, transactionName })}
                  placeholder="Ví dụ: Hoàn tiền, lương, bạn trả nợ"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
                <FieldLabel>Ghi chú</FieldLabel>
                <TextInput
                  value={props.draft.note}
                  onChangeText={(note) => props.onChange({ ...props.draft, note })}
                  placeholder="Không bắt buộc"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
                <Pressable style={styles.primaryButton} onPress={() => void props.onSaveManual()}>
                  <Text style={styles.primaryButtonText}>Cộng vào số dư</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReceiveQrModal(props: {
  session: ReceiveQrSession | null;
  onClose: () => void;
  onFinish: (received: boolean) => void;
}) {
  const { styles } = useAppTheme();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [props.session?.imageUrl]);

  if (!props.session) return null;
  const session = props.session;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
        <ModalHeader title="QR nhận tiền" onClose={props.onClose} />
        <View style={styles.receiveQrCard}>
          {imageError ? (
            <View style={styles.qrErrorBox}>
              <Text style={styles.qrErrorTitle}>Không tải được ảnh QR</Text>
              <Text style={styles.qrErrorText}>Kiểm tra kết nối mạng rồi đóng và tạo lại mã.</Text>
            </View>
          ) : (
            <Image source={{ uri: session.imageUrl }} style={styles.receiveQrImage} resizeMode="contain" onError={() => setImageError(true)} />
          )}
          <Text style={styles.receiveQrAmount}>{formatVnd(session.amount)}</Text>
          <Text style={styles.receiveQrBank}>{session.bankName}</Text>
          <Text style={styles.receiveQrAccount}>STK {session.accountNo}</Text>
          {session.note ? <Text style={styles.receiveQrNote}>Nội dung: {session.note}</Text> : null}
        </View>
        <Text style={styles.receiveQrHelp}>Đưa mã này cho người chuyển tiền quét. Sau khi kiểm tra tài khoản ngân hàng, hãy xác nhận bên dưới để cập nhật số dư.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void props.onFinish(true)}>
          <Text style={styles.primaryButtonText}>Đã nhận tiền</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void props.onFinish(false)}>
          <Text style={styles.secondaryButtonText}>Chưa nhận tiền</Text>
        </Pressable>
        <Pressable style={styles.textButton} onPress={props.onClose}>
          <Text style={styles.textButtonText}>Đóng, xử lý sau</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

function ReviewModal(props: { visible: boolean; onFinish: (paid: boolean) => void }) {
  const { styles } = useAppTheme();
  return (
    <Modal visible={props.visible} transparent animationType="fade">
      <View style={styles.reviewOverlay}>
        <View style={styles.reviewCard}>
          <View style={styles.reviewIcon}>
            <Text style={styles.reviewIconText}>✓</Text>
          </View>
          <Text style={styles.reviewTitle}>Bạn đã thanh toán?</Text>
          <Text style={styles.reviewText}>App không truy cập tài khoản ngân hàng của bạn, nên cần bạn xác nhận kết quả giao dịch.</Text>
          <Pressable style={styles.primaryButton} onPress={() => void props.onFinish(true)}><Text style={styles.primaryButtonText}>Đã thanh toán</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void props.onFinish(false)}><Text style={styles.secondaryButtonText}>Chưa thanh toán</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TransactionDetailModal(props: {
  item: Transaction | null;
  onClose: () => void;
  onSave: (item: Transaction, draft: EditDraft) => void;
  onDelete: (item: Transaction) => void;
}) {
  const { styles, colors } = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({ amountText: '', transactionName: '', category: 'other', note: '', status: 'completed' });

  useEffect(() => {
    if (props.item) {
      setEditing(false);
      setDraft({
        amountText: formatMoneyInput(String(props.item.amount)),
        transactionName: props.item.transactionName ?? '',
        category: props.item.category,
        note: props.item.note ?? '',
        status: props.item.status
      });
    }
  }, [props.item]);

  const item = props.item;
  if (!item) return null;
  const category = categoryById(item.category);
  const title = item.transactionName || item.receiverName || 'Giao dịch';
  const isIncome = item.direction === 'income';
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <ModalHeader title="Chi tiết giao dịch" onClose={props.onClose} />
          {!editing ? (
            <>
              <View style={styles.detailHero}>
                <Text style={styles.detailEmoji}>{category.icon}</Text>
                <Text style={styles.detailTitle}>{title}</Text>
                <Text style={[styles.detailAmount, isIncome && styles.incomeAmount]}>{isIncome ? '+' : '-'}{formatVnd(item.amount)}</Text>
                <StatusBadge status={item.status} direction={item.direction} />
              </View>
              <DetailRow label="Thời gian" value={formatDateTime(item.createdAt)} />
              <DetailRow label="Loại" value={isIncome ? 'Tiền nhận' : 'Khoản chi'} />
              <DetailRow label="Danh mục" value={`${category.icon} ${category.label}`} />
              <DetailRow label="Nguồn" value={item.source === 'qr' ? 'Quét QR thanh toán' : item.source === 'receive_qr' ? 'QR nhận tiền' : 'Thêm thủ công'} />
              {item.receiverName ? <DetailRow label={isIncome ? 'Người gửi / tên gợi nhớ' : 'Người nhận'} value={item.receiverName} /> : null}
              {item.receiverBankName ? <DetailRow label={isIncome ? 'Ngân hàng nhận tiền' : 'Ngân hàng nhận'} value={item.receiverBankName} /> : null}
              {item.receiverAccount ? <DetailRow label="Số tài khoản" value={item.receiverAccount} /> : null}
              {item.paymentBank ? <DetailRow label="App thanh toán" value={item.paymentBank === 'momo' ? 'MoMo' : item.paymentBank.toUpperCase()} /> : null}
              {item.note ? <DetailRow label="Ghi chú" value={item.note} /> : null}
              <Pressable style={styles.primaryButton} onPress={() => setEditing(true)}><Text style={styles.primaryButtonText}>Chỉnh sửa giao dịch</Text></Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => Alert.alert('Xóa giao dịch?', 'Giao dịch sẽ bị xóa khỏi lịch sử và thống kê.', [
                  { text: 'Hủy', style: 'cancel' },
                  { text: 'Xóa', style: 'destructive', onPress: () => void props.onDelete(item) }
                ])}
              >
                <Text style={styles.deleteButtonText}>Xóa giao dịch</Text>
              </Pressable>
            </>
          ) : (
            <>
              <FieldLabel>Tên giao dịch</FieldLabel>
              <TextInput value={draft.transactionName} onChangeText={(transactionName) => setDraft({ ...draft, transactionName })} placeholder="Tên giao dịch" placeholderTextColor={colors.placeholder} style={styles.input} />
              <FieldLabel>Số tiền</FieldLabel>
              <TextInput value={draft.amountText} onChangeText={(text) => setDraft({ ...draft, amountText: formatMoneyInput(text) })} keyboardType="number-pad" style={styles.moneyInput} />
              <FieldLabel>Danh mục</FieldLabel>
              <CategoryPicker selected={draft.category} direction={item.direction} onSelect={(categoryId) => setDraft({ ...draft, category: categoryId })} />
              <FieldLabel>Trạng thái</FieldLabel>
              <View style={styles.optionRow}>
                <ChoiceChip label={isIncome ? 'Đã nhận' : 'Đã thanh toán'} selected={draft.status === 'completed'} onPress={() => setDraft({ ...draft, status: 'completed' })} />
                <ChoiceChip label={isIncome ? 'Chờ nhận' : 'Đang chờ'} selected={draft.status === 'pending'} onPress={() => setDraft({ ...draft, status: 'pending' })} />
                <ChoiceChip label={isIncome ? 'Chưa nhận' : 'Đã hủy'} selected={draft.status === 'cancelled'} onPress={() => setDraft({ ...draft, status: 'cancelled' })} />
              </View>
              <FieldLabel>Ghi chú</FieldLabel>
              <TextInput value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} placeholder="Không bắt buộc" placeholderTextColor={colors.placeholder} style={styles.input} />
              <Pressable style={styles.primaryButton} onPress={() => void props.onSave(item, draft)}><Text style={styles.primaryButtonText}>Lưu thay đổi</Text></Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setEditing(false)}><Text style={styles.secondaryButtonText}>Hủy chỉnh sửa</Text></Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatusBadge({ status, direction = 'expense' }: { status: TransactionStatus; direction?: 'expense' | 'income' }) {
  const { styles } = useAppTheme();
  const text = direction === 'income'
    ? (status === 'completed' ? 'Đã nhận tiền' : status === 'pending' ? 'Đang chờ nhận' : 'Chưa nhận tiền')
    : (status === 'completed' ? 'Đã thanh toán' : status === 'pending' ? 'Đang chờ' : 'Đã hủy');
  return <Text style={[styles.detailStatus, status === 'pending' && styles.detailStatusPending, status === 'cancelled' && styles.detailStatusCancelled]}>{text}</Text>;
}

function DetailRow(props: { label: string; value: string }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{props.label}</Text>
      <Text style={styles.detailValue}>{props.value}</Text>
    </View>
  );
}

function CategoryPicker(props: { selected: string; onSelect: (id: string) => void; direction?: 'expense' | 'income' }) {
  const { styles } = useAppTheme();
  const categories = props.direction === 'income'
    ? CATEGORIES.filter((category) => category.id === 'income')
    : CATEGORIES.filter((category) => category.id !== 'income');
  return (
    <View style={styles.categoryWrap}>
      {categories.map((category) => {
        const selected = props.selected === category.id;
        return (
          <Pressable key={category.id} style={[styles.categoryChip, selected && styles.categoryChipSelected]} onPress={() => props.onSelect(category.id)}>
            <Text style={styles.categoryEmoji}>{category.icon}</Text>
            <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{category.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TransactionRow(props: { item: Transaction; showDivider?: boolean; showStatus?: boolean; onPress?: () => void }) {
  const { styles } = useAppTheme();
  const category = categoryById(props.item.category);
  const isIncome = props.item.direction === 'income';
  const title = props.item.transactionName || props.item.receiverName || props.item.receiverBankName || (isIncome ? 'Tiền nhận' : props.item.source === 'manual' ? 'Khoản chi thủ công' : 'Chuyển khoản');
  const statusLabel = isIncome
    ? (props.item.status === 'completed' ? 'Đã nhận' : props.item.status === 'pending' ? 'Chờ nhận' : 'Chưa nhận')
    : (props.item.status === 'completed' ? 'Đã thanh toán' : props.item.status === 'pending' ? 'Đang chờ' : 'Đã hủy');
  return (
    <Pressable style={[styles.transactionRow, props.showDivider && styles.rowDivider]} onPress={props.onPress} disabled={!props.onPress}>
      <View style={styles.transactionIcon}><Text style={styles.transactionEmoji}>{category.icon}</Text></View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.transactionMeta} numberOfLines={1}>{category.label} · {formatDateTime(props.item.createdAt)}</Text>
        {props.showStatus && props.item.status !== 'completed' ? <Text style={[styles.statusText, props.item.status === 'cancelled' && styles.statusCancelled]}>{statusLabel}</Text> : null}
      </View>
      <Text style={[styles.transactionAmount, isIncome && styles.incomeAmount]}>{isIncome ? '+' : '-'}{formatVnd(props.item.amount)}</Text>
    </Pressable>
  );
}

function ModalHeader(props: { title: string; onClose: () => void }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>{props.title}</Text>
      <Pressable style={styles.modalClose} onPress={props.onClose}><Text style={styles.modalCloseText}>×</Text></Pressable>
    </View>
  );
}

function CopyRow(props: { label: string; value: string; displayValue?: string }) {
  const { styles } = useAppTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.copyRow}>
      <View style={styles.copyTextWrap}><Text style={styles.copyLabel}>{props.label}</Text><Text style={styles.copyValue} numberOfLines={1}>{props.displayValue ?? props.value}</Text></View>
      <Pressable style={styles.copyButton} onPress={async () => {
        await Clipboard.setStringAsync(props.value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}><Text style={styles.copyButtonText}>{copied ? 'Đã chép' : 'Sao chép'}</Text></Pressable>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const { styles } = useAppTheme();
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function SectionHeader({ title }: { title: string }) {
  const { styles } = useAppTheme();
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyCard({ text }: { text: string }) {
  const { styles } = useAppTheme();
  return <View style={styles.emptyCard}><Text style={styles.emptyText}>{text}</Text></View>;
}

function makePalette(dark: boolean) {
  return dark ? {
    bg: '#0D1117', surface: '#151B23', surface2: '#1D2530', text: '#F4F7FB', text2: '#B5BECA', muted: '#8C97A6',
    border: '#27313D', primary: '#6C95FF', primaryStrong: '#3F73FF', primarySoft: '#172446', hero: '#18223A', heroText: '#FFFFFF',
    danger: '#FF7B7B', dangerSoft: '#3A2024', warning: '#F6C76B', success: '#79D6A5', track: '#29323E', overlay: 'rgba(0,0,0,0.62)',
    input: '#151B23', placeholder: '#707B89', white: '#FFFFFF'
  } : {
    bg: '#F5F6F8', surface: '#FFFFFF', surface2: '#F1F3F6', text: '#15171B', text2: '#4F5663', muted: '#7B8290',
    border: '#E7EAF0', primary: '#2F6BFF', primaryStrong: '#2F6BFF', primarySoft: '#EAF0FF', hero: '#111827', heroText: '#FFFFFF',
    danger: '#C83E4D', dangerSoft: '#FFF0F2', warning: '#B7791F', success: '#236244', track: '#EEF0F4', overlay: 'rgba(0,0,0,0.45)',
    input: '#FFFFFF', placeholder: '#A3A9B3', white: '#FFFFFF'
  };
}

function createAppStyles(c: Palette) {
  return StyleSheet.create({
    app: { flex: 1, backgroundColor: c.bg }, screen: { flex: 1 },
    page: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 120 }, pageFlex: { flex: 1, paddingTop: 64, paddingHorizontal: 20 },
    eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: c.muted }, title: { marginTop: 5, fontSize: 32, fontWeight: '800', color: c.text, letterSpacing: -0.8 },
    subtitle: { marginTop: 10, fontSize: 15, lineHeight: 22, color: c.text2 },
    balanceCard: { marginTop: 22, borderRadius: 24, padding: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    balanceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, balanceTextWrap: { flex: 1 }, balanceLabel: { fontSize: 12, fontWeight: '700', color: c.muted },
    balanceAmount: { marginTop: 5, fontSize: 30, fontWeight: '900', letterSpacing: -0.7, color: c.text }, balanceEditButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: c.primarySoft }, balanceEditText: { fontSize: 12, fontWeight: '800', color: c.primary },
    balanceFlowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, balanceIncome: { fontSize: 12, fontWeight: '700', color: c.success }, balanceExpense: { fontSize: 12, fontWeight: '700', color: c.danger }, balanceHint: { marginTop: 10, fontSize: 11, lineHeight: 17, color: c.muted },
    heroCard: { marginTop: 24, borderRadius: 26, padding: 24, backgroundColor: c.hero }, heroLabel: { fontSize: 14, color: '#C9D0DB' },
    heroAmount: { marginTop: 8, fontSize: 36, fontWeight: '800', color: c.heroText, letterSpacing: -1 }, heroHint: { marginTop: 12, fontSize: 13, lineHeight: 19, color: '#AAB3C1' },
    heroAction: { marginTop: 14, fontSize: 13, fontWeight: '800', color: '#9EB8FF' }, overBudgetText: { marginTop: 8, fontSize: 13, fontWeight: '800', color: '#FF9A9A' },
    budgetCard: { marginTop: 14, borderRadius: 22, padding: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    budgetHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, cardLabel: { fontSize: 12, color: c.muted },
    budgetMain: { marginTop: 4, fontSize: 17, fontWeight: '800', color: c.text }, budgetRemaining: { fontSize: 12, fontWeight: '800', color: c.primary },
    progressTrack: { height: 8, borderRadius: 999, backgroundColor: c.track, overflow: 'hidden', marginTop: 14 }, progressFill: { height: '100%', borderRadius: 999, backgroundColor: c.primary },
    budgetSummary: { marginTop: 12, fontSize: 13, lineHeight: 19, color: c.text2 },
    quickRow: { flexDirection: 'row', gap: 12, marginTop: 14 }, quickButton: { flex: 1, minHeight: 96, borderRadius: 22, padding: 16, justifyContent: 'space-between', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    primaryQuick: { backgroundColor: c.primaryStrong, borderColor: c.primaryStrong }, quickIcon: { fontSize: 25, fontWeight: '700', color: c.text }, primaryQuickIcon: { fontSize: 25, fontWeight: '700', color: c.white },
    quickText: { fontSize: 15, fontWeight: '700', color: c.text }, primaryQuickText: { fontSize: 15, fontWeight: '700', color: c.white },
    sectionTitle: { marginTop: 28, marginBottom: 12, fontSize: 18, fontWeight: '800', color: c.text }, listCard: { borderRadius: 22, backgroundColor: c.surface, paddingHorizontal: 16, borderWidth: 1, borderColor: c.border },
    transactionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 }, rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    transactionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }, transactionEmoji: { fontSize: 20 },
    transactionInfo: { flex: 1, marginLeft: 12, marginRight: 10 }, transactionTitle: { fontSize: 15, fontWeight: '700', color: c.text }, transactionMeta: { marginTop: 4, fontSize: 12, color: c.muted },
    transactionAmount: { fontSize: 14, fontWeight: '800', color: c.text }, incomeAmount: { color: c.success }, statusText: { marginTop: 4, fontSize: 11, fontWeight: '700', color: c.warning }, statusCancelled: { color: c.danger },
    emptyCard: { borderRadius: 20, padding: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, emptyText: { fontSize: 14, lineHeight: 21, color: c.muted },
    historyList: { paddingTop: 12, paddingBottom: 120 }, emptyList: { flexGrow: 1, paddingTop: 12 }, historyItem: { marginBottom: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    filterScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 64 }, filterRow: { gap: 8, paddingTop: 18, paddingBottom: 10, alignItems: 'center' }, choiceChip: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    choiceChipSelected: { backgroundColor: c.primarySoft, borderColor: c.primary }, choiceChipText: { fontSize: 12, fontWeight: '700', color: c.text2 }, choiceChipTextSelected: { color: c.primary },
    statTotalCard: { marginTop: 12, padding: 22, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, statTotalLabel: { fontSize: 13, color: c.muted },
    statTotalValue: { marginTop: 6, fontSize: 30, fontWeight: '800', color: c.text }, statMiniRow: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, flexDirection: 'row', justifyContent: 'space-between' },
    cashFlowGrid: { flexDirection: 'row', gap: 10, marginTop: 12 }, cashFlowCell: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: c.surface2 }, cashFlowLabel: { fontSize: 11, color: c.muted }, cashFlowIncome: { marginTop: 5, fontSize: 17, fontWeight: '900', color: c.success }, cashFlowExpense: { marginTop: 5, fontSize: 17, fontWeight: '900', color: c.danger },
    statNetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, statNetValue: { fontSize: 18, fontWeight: '900', color: c.success }, statNetNegative: { color: c.danger },
    miniLabel: { fontSize: 11, color: c.muted }, miniValue: { marginTop: 4, fontSize: 14, fontWeight: '800', color: c.text },
    statsCard: { borderRadius: 22, padding: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, statRow: { marginBottom: 22 }, statHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    statName: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text }, statAmount: { fontSize: 13, fontWeight: '700', color: c.text2 }, barTrack: { height: 8, borderRadius: 999, backgroundColor: c.track, overflow: 'hidden', marginTop: 10 },
    barFill: { height: '100%', borderRadius: 999, backgroundColor: c.primary }, statPct: { marginTop: 7, fontSize: 11, color: c.muted },
    settingsSection: { marginTop: 20, padding: 18, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, settingsSectionTitle: { fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 12 },
    settingDescription: { fontSize: 13, lineHeight: 19, color: c.text2 }, settingToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, settingToggleText: { flex: 1 }, settingName: { fontSize: 14, fontWeight: '800', color: c.text, marginBottom: 4 },
    settingSubheading: { marginTop: 18, marginBottom: 10, fontSize: 12, fontWeight: '800', color: c.muted }, optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    timeInputRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10 }, timeField: { width: 92 }, timeFieldLabel: { marginBottom: 6, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.muted }, timeInput: { minHeight: 54, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, fontSize: 22, fontWeight: '900', color: c.text }, timeColon: { paddingBottom: 13, fontSize: 24, fontWeight: '900', color: c.text2 }, timePreview: { marginTop: 10, textAlign: 'center', fontSize: 12, color: c.text2 }, notificationHint: { marginTop: 10, fontSize: 11, lineHeight: 17, color: c.muted },
    bankList: { marginTop: 14, gap: 10 }, bankRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 14, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border },
    bankRowSelected: { borderColor: c.primary, backgroundColor: c.primarySoft }, radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' }, radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary },
    bankTextWrap: { flex: 1, marginLeft: 12 }, bankAppName: { fontSize: 14, fontWeight: '800', color: c.text }, bankMeta: { marginTop: 3, fontSize: 11, color: c.muted }, autofillBadge: { fontSize: 10, fontWeight: '800', color: c.success, backgroundColor: c.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
    openBadge: { fontSize: 10, fontWeight: '800', color: c.text2, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 }, privacyCard: { marginTop: 18, padding: 18, borderRadius: 20, backgroundColor: c.primarySoft },
    privacyTitle: { fontSize: 15, fontWeight: '800', color: c.text }, privacyText: { marginTop: 6, fontSize: 13, lineHeight: 20, color: c.text2 },
    tabBar: { height: 88, paddingBottom: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    tabIcon: { fontSize: 20, color: c.muted }, tabLabel: { fontSize: 10, fontWeight: '700', color: c.muted }, tabActive: { color: c.primary }, scanFab: { width: 58, height: 58, marginHorizontal: 7, marginTop: -28, borderRadius: 29, backgroundColor: c.primaryStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: c.bg }, scanFabIcon: { fontSize: 25, fontWeight: '800', color: c.white },
    scannerRoot: { flex: 1, backgroundColor: '#000' }, scannerTop: { position: 'absolute', top: 58, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 }, scannerClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' }, scannerCloseText: { color: '#FFF', fontSize: 30, lineHeight: 32 }, scannerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' }, scannerSpacer: { width: 42 },
    scanShade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.53)' }, scannerGuideWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' }, scannerGuide: { width: 270, height: 270, borderWidth: 3, borderRadius: 28, borderColor: '#FFF' }, scannerHint: { marginTop: 18, maxWidth: 320, textAlign: 'center', color: '#FFF', fontSize: 14, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.46)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
    permissionBox: { flex: 1, paddingHorizontal: 30, alignItems: 'stretch', justifyContent: 'center', backgroundColor: c.bg }, permissionTitle: { textAlign: 'center', fontSize: 25, fontWeight: '800', color: c.text }, permissionText: { marginTop: 9, marginBottom: 22, textAlign: 'center', color: c.text2 },
    modalScreen: { flex: 1, backgroundColor: c.bg }, modalContent: { padding: 20, paddingTop: 24, paddingBottom: 50 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }, modalTitle: { fontSize: 26, fontWeight: '800', color: c.text }, modalClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }, modalCloseText: { fontSize: 26, color: c.text2, lineHeight: 28 },
    segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
    bankPickerButton: { minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 }, bankPickerTextWrap: { flex: 1 }, bankPickerLabel: { fontSize: 15, fontWeight: '800', color: c.text }, bankPickerMeta: { marginTop: 3, fontSize: 11, color: c.muted }, bankPickerChevron: { fontSize: 30, color: c.muted },
    bankPickerModalContent: { flex: 1, paddingHorizontal: 20, paddingTop: 24 }, bankPickerList: { paddingTop: 12, paddingBottom: 40 }, bankPickerListRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    receiverCard: { padding: 18, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, marginBottom: 8 }, receiverBank: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: c.primary }, receiverName: { marginTop: 7, fontSize: 17, fontWeight: '800', color: c.text }, receiverAccount: { marginTop: 5, fontSize: 14, color: c.text2 }, warningText: { marginTop: 10, fontSize: 12, color: c.warning },
    fieldLabel: { marginTop: 18, marginBottom: 8, fontSize: 13, fontWeight: '800', color: c.text2 }, input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, paddingHorizontal: 15, fontSize: 15, color: c.text }, moneyInput: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, paddingHorizontal: 15, fontSize: 22, fontWeight: '800', color: c.text },
    categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, categoryChipSelected: { borderColor: c.primary, backgroundColor: c.primarySoft }, categoryEmoji: { fontSize: 15 }, categoryText: { fontSize: 12, fontWeight: '700', color: c.text2 }, categoryTextSelected: { color: c.primary },
    paymentInfo: { marginTop: 20, padding: 15, borderRadius: 17, backgroundColor: c.primarySoft }, paymentInfoTitle: { fontSize: 13, fontWeight: '800', color: c.text }, paymentInfoText: { marginTop: 5, fontSize: 12, lineHeight: 18, color: c.text2 }, copyPanel: { marginTop: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 }, copyRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, copyTextWrap: { flex: 1 }, copyLabel: { fontSize: 10, color: c.muted }, copyValue: { marginTop: 3, fontSize: 13, fontWeight: '700', color: c.text }, copyButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: c.surface2 }, copyButtonText: { fontSize: 11, fontWeight: '800', color: c.primary },
    receiveQrCard: { alignItems: 'center', padding: 18, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, receiveQrImage: { width: 300, maxWidth: '100%', aspectRatio: 1, backgroundColor: '#FFFFFF', borderRadius: 16 }, receiveQrAmount: { marginTop: 16, fontSize: 30, fontWeight: '900', color: c.text }, receiveQrBank: { marginTop: 8, fontSize: 15, fontWeight: '800', color: c.text }, receiveQrAccount: { marginTop: 4, fontSize: 13, color: c.text2 }, receiveQrNote: { marginTop: 8, textAlign: 'center', fontSize: 12, color: c.muted }, receiveQrHelp: { marginTop: 14, fontSize: 13, lineHeight: 20, textAlign: 'center', color: c.text2 }, qrErrorBox: { width: 280, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 18, backgroundColor: c.surface2 }, qrErrorTitle: { fontSize: 16, fontWeight: '800', color: c.danger }, qrErrorText: { marginTop: 8, textAlign: 'center', fontSize: 12, lineHeight: 18, color: c.text2 },
    primaryButton: { minHeight: 54, marginTop: 20, borderRadius: 16, backgroundColor: c.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, primaryButtonText: { fontSize: 15, fontWeight: '800', color: c.white }, secondaryButton: { minHeight: 52, marginTop: 10, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }, secondaryButtonText: { fontSize: 14, fontWeight: '800', color: c.text }, textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, textButtonText: { fontSize: 14, fontWeight: '800', color: c.primary }, deleteButton: { minHeight: 52, marginTop: 10, borderRadius: 16, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }, deleteButtonText: { fontSize: 14, fontWeight: '800', color: c.danger },
    reviewOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.overlay }, reviewCard: { padding: 24, borderRadius: 26, backgroundColor: c.surface }, reviewIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }, reviewIconText: { color: c.primary, fontSize: 25, lineHeight: 30, fontWeight: '900', textAlign: 'center' }, reviewTitle: { marginTop: 18, fontSize: 24, fontWeight: '800', color: c.text }, reviewText: { marginTop: 8, fontSize: 14, lineHeight: 21, color: c.text2 },
    detailHero: { alignItems: 'center', padding: 22, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, marginBottom: 14 }, detailEmoji: { fontSize: 34 }, detailTitle: { marginTop: 10, fontSize: 20, fontWeight: '800', color: c.text, textAlign: 'center' }, detailAmount: { marginTop: 8, fontSize: 28, fontWeight: '900', color: c.text }, detailStatus: { marginTop: 10, fontSize: 11, fontWeight: '800', color: c.success, backgroundColor: c.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }, detailStatusPending: { color: c.warning }, detailStatusCancelled: { color: c.danger },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, detailLabel: { fontSize: 13, color: c.muted }, detailValue: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: c.text }
  });
}
