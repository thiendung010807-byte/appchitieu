import type { SQLiteDatabase } from 'expo-sqlite';
import type { Transaction, TransactionDirection, TransactionSource, TransactionStatus } from './types';

export async function initDb(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      transaction_name TEXT,
      receiver_name TEXT,
      receiver_account TEXT,
      receiver_bank_bin TEXT,
      receiver_bank_name TEXT,
      category TEXT NOT NULL,
      note TEXT,
      raw_qr TEXT,
      payment_bank TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'qr',
      direction TEXT NOT NULL DEFAULT 'expense',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_categories (
      merchant_key TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const transactionColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
  if (!transactionColumns.some((column) => column.name === 'transaction_name')) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN transaction_name TEXT');
  }
  if (!transactionColumns.some((column) => column.name === 'direction')) {
    await db.execAsync("ALTER TABLE transactions ADD COLUMN direction TEXT NOT NULL DEFAULT 'expense'");
  }

  const now = new Date().toISOString();
  const defaults: Array<[string, string]> = [
    ['paymentBank', 'mb'],
    ['monthlyBudget', '0'],
    ['notificationsEnabled', '0'],
    ['notificationHour', '22'],
    ['notificationMinute', '0'],
    ['themeMode', 'system'],
    ['balanceAnchorAmount', '0'],
    ['balanceAnchorAt', now],
    ['balanceConfigured', '0'],
    ['receiveBankBin', ''],
    ['receiveAccountNo', ''],
    ['receiveNote', '']
  ];
  for (const [key, value] of defaults) {
    await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }
}

type DbTransaction = {
  id: number;
  amount: number;
  transaction_name: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  receiver_bank_bin: string | null;
  receiver_bank_name: string | null;
  category: string;
  note: string | null;
  raw_qr: string | null;
  payment_bank: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  direction: TransactionDirection | null;
  created_at: string;
  completed_at: string | null;
};

function mapTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    amount: row.amount,
    transactionName: row.transaction_name,
    receiverName: row.receiver_name,
    receiverAccount: row.receiver_account,
    receiverBankBin: row.receiver_bank_bin,
    receiverBankName: row.receiver_bank_name,
    category: row.category,
    note: row.note,
    rawQr: row.raw_qr,
    paymentBank: row.payment_bank,
    status: row.status,
    source: row.source,
    direction: row.direction === 'income' ? 'income' : 'expense',
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

export async function insertTransaction(db: SQLiteDatabase, input: Omit<Transaction, 'id'>): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO transactions (
      amount, transaction_name, receiver_name, receiver_account, receiver_bank_bin, receiver_bank_name,
      category, note, raw_qr, payment_bank, status, source, direction, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.amount,
    input.transactionName,
    input.receiverName,
    input.receiverAccount,
    input.receiverBankBin,
    input.receiverBankName,
    input.category,
    input.note,
    input.rawQr,
    input.paymentBank,
    input.status,
    input.source,
    input.direction,
    input.createdAt,
    input.completedAt
  );
  return Number(result.lastInsertRowId);
}

export async function updateTransactionStatus(db: SQLiteDatabase, id: number, status: TransactionStatus) {
  const current = await db.getFirstAsync<{ completed_at: string | null }>(
    'SELECT completed_at FROM transactions WHERE id = ?',
    id
  );
  const completedAt = status === 'completed' ? (current?.completed_at ?? new Date().toISOString()) : null;
  await db.runAsync('UPDATE transactions SET status = ?, completed_at = ? WHERE id = ?', status, completedAt, id);
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: number,
  input: Pick<Transaction, 'amount' | 'transactionName' | 'category' | 'note' | 'status'>
) {
  const current = await db.getFirstAsync<{ completed_at: string | null }>(
    'SELECT completed_at FROM transactions WHERE id = ?',
    id
  );
  const completedAt = input.status === 'completed' ? (current?.completed_at ?? new Date().toISOString()) : null;
  await db.runAsync(
    `UPDATE transactions
     SET amount = ?, transaction_name = ?, category = ?, note = ?, status = ?, completed_at = ?
     WHERE id = ?`,
    input.amount,
    input.transactionName,
    input.category,
    input.note,
    input.status,
    completedAt,
    id
  );
}

export async function deleteTransaction(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function listTransactions(db: SQLiteDatabase, limit = 5000) {
  const rows = await db.getAllAsync<DbTransaction>(
    'SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?',
    limit
  );
  return rows.map(mapTransaction);
}

export async function getSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value;
}

export async function getSettings(db: SQLiteDatabase, keys: string[]) {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = await getSetting(db, key);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}

export async function setSettings(db: SQLiteDatabase, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await setSetting(db, key, value);
  }
}

export function merchantKey(bankBin?: string, accountNo?: string) {
  if (!bankBin || !accountNo) return undefined;
  return `${bankBin}:${accountNo}`;
}

export async function getRememberedCategory(db: SQLiteDatabase, key?: string) {
  if (!key) return undefined;
  const row = await db.getFirstAsync<{ category: string }>(
    'SELECT category FROM merchant_categories WHERE merchant_key = ?',
    key
  );
  return row?.category;
}

export async function rememberCategory(db: SQLiteDatabase, key: string, category: string) {
  await db.runAsync(
    `INSERT INTO merchant_categories (merchant_key, category, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(merchant_key) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at`,
    key,
    category,
    new Date().toISOString()
  );
}
