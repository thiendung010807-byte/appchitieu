import type { BudgetSnapshot, Transaction } from './types';

function localStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calculateBudgetSnapshot(transactions: Transaction[], monthlyLimit: number, now = new Date()): BudgetSnapshot {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = localStartOfDay(now);
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const completedExpenses = transactions.filter(
    (item) => item.status === 'completed' && item.direction !== 'income'
  );

  const monthItems = completedExpenses.filter((item) => {
    const d = new Date(item.createdAt);
    return d >= monthStart && d < nextMonth;
  });
  const monthSpent = monthItems.reduce((sum, item) => sum + item.amount, 0);
  const spentBeforeToday = monthItems
    .filter((item) => new Date(item.createdAt) < todayStart)
    .reduce((sum, item) => sum + item.amount, 0);
  const spentToday = monthItems
    .filter((item) => {
      const d = new Date(item.createdAt);
      return d >= todayStart && d < tomorrowStart;
    })
    .reduce((sum, item) => sum + item.amount, 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemainingIncludingToday = Math.max(1, daysInMonth - now.getDate() + 1);
  const availableAtStartOfToday = monthlyLimit - spentBeforeToday;
  const dailyAllowance = monthlyLimit > 0 ? availableAtStartOfToday / daysRemainingIncludingToday : 0;
  const canSpendToday = dailyAllowance - spentToday;
  const monthRemaining = monthlyLimit - monthSpent;
  const progress = monthlyLimit > 0 ? monthSpent / monthlyLimit : 0;

  return {
    monthlyLimit,
    monthSpent,
    monthRemaining,
    spentBeforeToday,
    spentToday,
    daysRemainingIncludingToday,
    dailyAllowance,
    canSpendToday,
    todayDifference: dailyAllowance - spentToday,
    progress
  };
}

export function dailySummaryText(snapshot: BudgetSnapshot) {
  if (snapshot.monthlyLimit <= 0) return 'Bạn chưa đặt giới hạn chi tiêu tháng.';
  if (snapshot.todayDifference >= 0) {
    return `Hôm nay bạn còn dư ${Math.round(snapshot.todayDifference).toLocaleString('vi-VN')} ₫ so với hạn mức ngày.`;
  }
  return `Hôm nay bạn đã dùng quá ${Math.round(Math.abs(snapshot.todayDifference)).toLocaleString('vi-VN')} ₫ so với hạn mức ngày.`;
}
