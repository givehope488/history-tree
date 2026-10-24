import type { TimePrecision, TimeValue } from '../types';

/**
 * 时间规范化。
 * 支持：'2012-11-08' / '2012-11' / '2012' / '2012/11/8' / '2012年11月8日'
 * 以及公元前：'-500' / '公元前500' / '公元前500-3-1'
 * 不依赖 Date 解析（Date 对负年份与不补零字符串的行为不可靠）。
 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
  /** 输入里实际出现的粒度 */
  precision: TimePrecision;
}

const pad2 = (n: number): string => String(Math.abs(n)).padStart(2, '0');

/** 把任意输入清洗成 'YYYY-MM-DD' 形态的片段数组 */
function splitRaw(raw: string): { sign: number; parts: string[] } | null {
  let s = raw.trim();
  if (!s) return null;

  let sign = 1;
  if (/^公元前/.test(s)) {
    sign = -1;
    s = s.replace(/^公元前/, '');
  }
  if (/^\(.*\)$/.test(s)) s = s.slice(1, -1);

  s = s
    .replace(/[./]/g, '-')
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-');

  // 必须在清理首尾连字符之前取符号，否则 '-500'（公元前500）会被当成公元500年
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  }
  s = s.replace(/-+$/, '');
  if (!s) return null;

  const parts = s.split('-').filter((p) => p.length > 0);
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d{1,6}$/.test(p))) return null;
  return { sign, parts };
}

/** 解析失败返回 null */
export function parseDateParts(raw: string | undefined | null): DateParts | null {
  if (!raw) return null;
  const split = splitRaw(raw);
  if (!split) return null;

  const [ys, ms, ds] = split.parts;
  const year = split.sign * Number(ys);
  const monthRaw = ms ? Number(ms) : 1;
  const dayRaw = ds ? Number(ds) : 1;
  if (monthRaw < 1 || monthRaw > 12) return null;
  if (dayRaw < 1 || dayRaw > 31) return null;

  const precision: TimePrecision = split.parts.length === 1 ? 'year' : split.parts.length === 2 ? 'month' : 'day';
  return { year, month: monthRaw, day: dayRaw, precision };
}

export function isValidDateInput(raw: string | undefined | null): boolean {
  return parseDateParts(raw) !== null;
}

/**
 * 可排序数值：越大越晚。
 * 公元前后均成立（公元前年份为负数，天然排在公元之前）。
 */
export function toSortable(raw: string | undefined | null): number {
  const p = parseDateParts(raw);
  if (!p) return Number.POSITIVE_INFINITY;
  return p.year * 10000 + p.month * 100 + p.day;
}

/** 同一时间点的合并键（补零到 年-月-日） */
export function timeKey(time: TimeValue | undefined | null): string {
  const p = parseDateParts(time?.start);
  if (!p) return `raw:${(time?.start ?? '').trim()}`;
  const y = p.year < 0 ? `-${pad2(p.year)}` : String(p.year).padStart(4, '0');
  return `${y}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function isSameTimePoint(a: TimeValue, b: TimeValue): boolean {
  return timeKey(a) === timeKey(b);
}

/** 把单个时间串按精度格式化 */
function formatDateAt(raw: string | undefined, precision: TimePrecision): string {
  const p = parseDateParts(raw);
  if (!p) return (raw ?? '').trim();
  const y = p.year < 0 ? `公元前${Math.abs(p.year)}年` : `${p.year}年`;
  if (precision === 'year' || p.precision === 'year') return y;
  if (precision === 'month' || p.precision === 'month') return `${y}${p.month}月`;
  return `${y}${p.month}月${p.day}日`;
}

/** 由 start + precision 生成展示文本 */
export function formatDisplay(time: TimeValue): string {
  const explicit = (time.display ?? '').trim();
  const head = formatDateAt(time.start, time.precision);

  if (time.precision === 'range' && time.end) {
    return explicit || `${head} — ${formatDateAt(time.end, 'day')}`;
  }
  return explicit || head;
}

/** 表单里用户填的字符串 → TimeValue */
export function timeFromInput(start: string, end?: string): TimeValue {
  const p = parseDateParts(start);
  const precision: TimePrecision = p ? p.precision : 'day';
  const value: TimeValue = { start: (start ?? '').trim(), display: '', precision };
  if (precision === 'range' || (end && end.trim())) {
    value.precision = 'range';
    value.end = (end ?? '').trim();
  }
  return { ...value, display: formatDisplay(value) };
}

/** 规范化整条时间（补齐 display；区间方向写反时自动交换） */
export function normalizeTime(time: TimeValue): TimeValue {
  let start = (time.start ?? '').trim();
  let end = (time.end ?? '').trim();
  if (time.precision === 'range' && end && toSortable(end) < toSortable(start)) {
    const swap = start;
    start = end;
    end = swap;
  }
  const normalized: TimeValue = {
    start,
    precision: time.precision,
    display: (time.display ?? '').trim(),
  };
  if (end) normalized.end = end;
  return { ...normalized, display: normalized.display || formatDisplay(normalized) };
}

/** 排序用主键：区间取起点 */
export function sortValueOf(time: TimeValue): number {
  return toSortable(time.start);
}

/**
 * 公历日期 → 距 1970-01-01 的天数（Howard Hinnant 的 days_from_civil，负年份也成立）。
 * 排布要用它，不能用 toSortable：toSortable 是 year*10000+month*100+day 的复合数，
 * 「1 天」和「1 个月」在它上面差 100 倍，按它做比例会把时间轴拉得极长。
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 真实经过的天数（可为负）；无法解析时返回 null */
export function toDayNumber(raw: string | undefined | null): number | null {
  const parts = parseDateParts(raw);
  if (!parts) return null;
  return daysFromCivil(parts.year, parts.month, parts.day);
}

/** 用于 <input type="date"> 的取值；无法映射（年/月精度、公元前）时返回 '' */
export function toDateInputValue(time: TimeValue | undefined): string {
  const p = parseDateParts(time?.start);
  if (!p || p.year < 1 || p.year > 9999) return '';
  const y = String(p.year).padStart(4, '0');
  return `${y}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 从 date input 取值写回 TimeValue（保留原精度语义：日精度） */
export function timeFromDateInput(value: string): TimeValue {
  const time = timeFromInput(value);
  return time;
}
