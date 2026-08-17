/**
 * 日期工具函数（纯函数，无副作用）
 */

const MAX_FUTURE_DAYS = 30;

/**
 * 获取上海时区（UTC+8）的当前 Date 对象
 */
function getShanghaiDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}

/**
 * 获取上海时区今天的日期字符串
 */
export function getToday(): string {
  const shanghaiDate = getShanghaiDate();
  return formatDate(shanghaiDate);
}

/**
 * 将 Date 对象格式化为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 将 YYYY-MM-DD 字符串解析为 Date 对象（上海时区本地时间 00:00:00）
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * 检查日期是否在允许范围内（今天至未来 30 天）
 */
export function isDateInRange(dateStr: string): boolean {
  const today = getToday();
  const date = parseDate(dateStr);
  const todayDate = parseDate(today);
  const maxDate = new Date(todayDate);
  maxDate.setDate(maxDate.getDate() + MAX_FUTURE_DAYS);

  return date >= todayDate && date <= maxDate;
}

/**
 * 检查日期是否是过去日期
 */
export function isPastDate(dateStr: string): boolean {
  const today = getToday();
  const date = parseDate(dateStr);
  const todayDate = parseDate(today);
  return date < todayDate;
}

/**
 * 生成日期选择器列表（今天至未来 30 天）
 */
export function generateDateOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const today = new Date();

  for (let i = 0; i <= MAX_FUTURE_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = formatDate(d);
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayName = dayNames[d.getDay()];
    const month = d.getMonth() + 1;
    const day = d.getDate();

    let label = `${month}月${day}日 ${dayName}`;
    if (i === 0) label = `今天 ${month}/${day}`;
    else if (i === 1) label = `明天 ${month}/${day}`;
    else if (i === 2) label = `后天 ${month}/${day}`;

    options.push({ value: dateStr, label });
  }

  return options;
}

/**
 * 根据时间推断建议的餐次
 * 早餐 5:00-10:00，午餐 10:00-14:00，晚餐 17:00-22:00
 */
export function inferMealTypeFromTime(): 'breakfast' | 'lunch' | 'dinner' {
  const shanghaiNow = getShanghaiDate();
  const hour = shanghaiNow.getHours();

  if (hour < 10) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}

/**
 * 获取两个日期之间的天数差
 */
export function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = parseDate(dateStr1);
  const d2 = parseDate(dateStr2);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}