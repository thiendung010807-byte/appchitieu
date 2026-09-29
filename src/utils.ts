import type { Category, TimeFilter, Transaction } from './types';

export const CATEGORIES: Category[] = [
  { id: 'income', label: 'Tiền nhận', icon: '💰' },
  { id: 'food', label: 'Ăn uống', icon: '🍜' },
  { id: 'coffee', label: 'Cafe', icon: '☕' },
  { id: 'transport', label: 'Đi lại', icon: '🚕' },
  { id: 'shopping', label: 'Mua sắm', icon: '🛍️' },
  { id: 'grocery', label: 'Siêu thị', icon: '🛒' },
  { id: 'entertainment', label: 'Giải trí', icon: '🎬' },
  { id: 'bills', label: 'Hóa đơn', icon: '🧾' },
  { id: 'health', label: 'Sức khỏe', icon: '💊' },
  { id: 'education', label: 'Học tập', icon: '📚' },
  { id: 'other', label: 'Khác', icon: '📦' }
];

export const TIME_FILTERS: Array<{ id: TimeFilter; label: string }> = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7days', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'year', label: 'Năm nay' },
  { id: 'all', label: 'Tất cả' }
];

export function categoryById(id: string) {
  return CATEGORIES.find((item) => item.id === id) ?? CATEGORIES[CATEGORIES.length - 1]!;
}

export function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} ₫`;
}

export function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export function formatMoneyInput(value: string) {
  const amount = parseMoneyInput(value);
  return amount ? new Intl.NumberFormat('vi-VN').format(amount) : '';
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

export function filterTransactionsByTime(transactions: Transaction[], filter: TimeFilter, now = new Date()) {
  let start: Date | null = null;
  let end: Date | null = null;
  if (filter === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (filter === '7days') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (filter === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (filter === 'lastMonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filter === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  }
  if (!start || !end) return transactions;
  return transactions.filter((item) => {
    const date = new Date(item.createdAt);
    return date >= start! && date < end!;
  });
}
