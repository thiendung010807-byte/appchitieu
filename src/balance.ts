import type { BalanceSnapshot, Transaction } from './types';

function localStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function effectiveDate(item: Transaction) {
  return new Date(item.completedAt ?? item.createdAt);
}

export function calculateBalanceSnapshot(
  transactions: Transaction[],
  anchorAmount: number,
  anchorAt: string,
  configured: boolean,
  now = new Date()
): BalanceSnapshot {
  const anchorDate = new Date(anchorAt);
  const validAnchor = Number.isFinite(anchorDate.getTime()) ? anchorDate : new Date(0);
  const todayStart = localStartOfDay(now);
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const completed = transactions.filter((item) => item.status === 'completed');
  const afterAnchor = completed.filter((item) => effectiveDate(item) >= validAnchor);

  const incomeSinceAnchor = afterAnchor
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const expenseSinceAnchor = afterAnchor
    .filter((item) => item.direction !== 'income')
    .reduce((sum, item) => sum + item.amount, 0);

  const todayItems = completed.filter((item) => {
    const date = effectiveDate(item);
    return date >= todayStart && date < tomorrowStart;
  });
  const todayIncome = todayItems
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const todayExpense = todayItems
    .filter((item) => item.direction !== 'income')
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    anchorAmount,
    anchorAt,
    configured,
    incomeSinceAnchor,
    expenseSinceAnchor,
    currentBalance: anchorAmount + incomeSinceAnchor - expenseSinceAnchor,
    todayIncome,
    todayExpense
  };
}
