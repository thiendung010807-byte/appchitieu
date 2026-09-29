import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { BalanceSnapshot, BudgetSnapshot } from './types';

const DAILY_SUMMARY_KIND = 'daily-summary';
const TEST_NOTIFICATION_KIND = 'test-notification';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

function iosPermissionAllowsNotifications(status: Notifications.NotificationPermissionsStatus) {
  const iosStatus = status.ios?.status;
  return (
    status.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

export async function requestNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (Platform.OS !== 'ios' ? current.granted : iosPermissionAllowsNotifications(current)) return true;

  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true }
  });
  return Platform.OS !== 'ios' ? next.granted : iosPermissionAllowsNotifications(next);
}

export async function cancelDailySummaryNotification() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const targets = scheduled.filter((item) => item.content.data?.kind === DAILY_SUMMARY_KIND);
  await Promise.all(targets.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

function buildBody(budget: BudgetSnapshot, balance: BalanceSnapshot) {
  const parts: string[] = [];
  parts.push(`Đã chi ${Math.round(balance.todayExpense).toLocaleString('vi-VN')} ₫ hôm nay`);
  parts.push(`đã nhận ${Math.round(balance.todayIncome).toLocaleString('vi-VN')} ₫`);

  if (budget.monthlyLimit > 0) {
    if (budget.canSpendToday >= 0) {
      parts.push(`còn ${Math.round(budget.canSpendToday).toLocaleString('vi-VN')} ₫ có thể chi hôm nay`);
    } else {
      parts.push(`vượt hạn mức hôm nay ${Math.round(Math.abs(budget.canSpendToday)).toLocaleString('vi-VN')} ₫`);
    }
    parts.push(`tháng này ${Math.round(budget.monthSpent).toLocaleString('vi-VN')} / ${Math.round(budget.monthlyLimit).toLocaleString('vi-VN')} ₫`);
  } else {
    parts.push('chưa đặt giới hạn tháng');
  }

  if (balance.configured) {
    parts.push(`số dư hiện tại ${Math.round(balance.currentBalance).toLocaleString('vi-VN')} ₫`);
  } else {
    parts.push('chưa đặt số dư hiện tại');
  }
  return `${parts.join(' · ')}.`;
}

export async function scheduleDailySummaryNotification(
  budget: BudgetSnapshot,
  balance: BalanceSnapshot,
  hour: number,
  minute: number,
  enabled: boolean
) {
  await cancelDailySummaryNotification();
  if (!enabled) return null;

  const safeHour = Math.min(23, Math.max(0, Math.trunc(hour)));
  const safeMinute = Math.min(59, Math.max(0, Math.trunc(minute)));
  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: safeHour,
    minute: safeMinute
  };

  // Validate the trigger before scheduling. This catches invalid date component
  // combinations early instead of silently leaving the user without a summary.
  const nextTrigger = await Notifications.getNextTriggerDateAsync(trigger);
  if (nextTrigger === null) throw new Error('notification_trigger_invalid');

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tổng kết thu chi hôm nay',
      body: buildBody(budget, balance),
      sound: 'default',
      interruptionLevel: 'active',
      data: { kind: DAILY_SUMMARY_KIND }
    },
    trigger
  });

  return { identifier, nextTrigger };
}

export async function sendTestNotification(budget: BudgetSnapshot, balance: BalanceSnapshot) {
  const granted = await requestNotificationPermission();
  if (!granted) throw new Error('notification_permission_denied');

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Thông báo thử • Chi Tiêu QR',
      body: buildBody(budget, balance),
      sound: 'default',
      interruptionLevel: 'active',
      data: { kind: TEST_NOTIFICATION_KIND }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5
    }
  });
}

export async function getScheduledDailySummaryCount() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.filter((item) => item.content.data?.kind === DAILY_SUMMARY_KIND).length;
}
