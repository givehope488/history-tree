import { seedCountries, seedEvents } from '../data/seed';
import type {
  Country,
  EventLink,
  EventSource,
  PersistedData,
  TimePrecision,
  TimeValue,
  TimelineEvent,
} from '../types';
import { normalizeTime } from './time';

// v3：种子数据改成「每个事件用自己真实的日期」（v2 是把同一小节的事件压在同一天），
// 因此换一个键，让浏览器里存的旧副本自动失效、重新读取新种子。
export const STORAGE_KEY = 'ch10-history-tree:v3';
export const DATA_VERSION = 3;

/* ------------------------------- 种子数据 ------------------------------- */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSeedData(): PersistedData {
  return {
    version: DATA_VERSION,
    countries: clone(seedCountries),
    events: clone(seedEvents),
  };
}

/* ------------------------------- 守卫解析 ------------------------------- */

const PRECISIONS: TimePrecision[] = ['year', 'month', 'day', 'range'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return list.length > 0 ? list : undefined;
}

function parseLinks(value: unknown): EventLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const links = value
    .filter(isRecord)
    .map((item) => ({ label: str(item.label).trim(), url: str(item.url).trim() }))
    .filter((link) => link.url !== '');
  return links.length > 0 ? links : undefined;
}

function parseTimeValue(value: unknown): TimeValue {
  if (!isRecord(value)) return normalizeTime({ start: '', display: '', precision: 'year' });
  const precision = PRECISIONS.includes(value.precision as TimePrecision)
    ? (value.precision as TimePrecision)
    : 'day';
  return normalizeTime({
    start: str(value.start),
    end: str(value.end) || undefined,
    display: str(value.display),
    precision,
  });
}

export function parseCountry(value: unknown, index = 0): Country | null {
  if (!isRecord(value)) return null;
  const id = str(value.id).trim();
  const name = str(value.name).trim();
  if (!id || !name) return null;
  const order = typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : index + 1;
  return {
    id,
    name,
    color: str(value.color).trim() || '#64748b',
    order,
    ...(value.isMain === true ? { isMain: true } : {}),
    ...(str(value.deletedAt).trim() ? { deletedAt: str(value.deletedAt).trim() } : {}),
  };
}

export function parseEvent(value: unknown): TimelineEvent | null {
  if (!isRecord(value)) return null;
  const id = str(value.id).trim();
  if (!id) return null;
  const source: EventSource = value.source === 'textbook' ? 'textbook' : 'user';
  return {
    id,
    title: str(value.title).trim(),
    countryId: str(value.countryId).trim(),
    detail: str(value.detail),
    links: parseLinks(value.links),
    tags: strArray(value.tags),
    time: parseTimeValue(value.time),
    source,
    createdAt: str(value.createdAt) || new Date(0).toISOString(),
    updatedAt: str(value.updatedAt) || str(value.createdAt) || new Date(0).toISOString(),
    ...(str(value.deletedAt).trim() ? { deletedAt: str(value.deletedAt).trim() } : {}),
  };
}

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** 把任意 JSON 收敛成合法数据；无法识别的条目被丢弃 */
export function sanitizeData(raw: unknown): PersistedData {
  const seed = createSeedData();
  if (!isRecord(raw)) return seed;

  const countries = Array.isArray(raw.countries)
    ? uniqueById(raw.countries.map((item, index) => parseCountry(item, index)).filter((c): c is Country => c !== null))
    : [];
  const events = Array.isArray(raw.events)
    ? uniqueById(raw.events.map(parseEvent).filter((e): e is TimelineEvent => e !== null))
    : [];

  if (countries.length === 0 && events.length === 0) return seed;

  // 保证「主干」唯一：多个 isMain 只保留 order 最小的那个
  const mains = countries.filter((c) => c.isMain);
  if (mains.length > 1) {
    const keeper = [...mains].sort((a, b) => a.order - b.order)[0];
    countries.forEach((c) => {
      if (c.isMain && c.id !== keeper.id) delete c.isMain;
    });
  }

  return {
    version: DATA_VERSION,
    countries: countries.length > 0 ? countries : seed.countries,
    events,
  };
}

/* ------------------------------ 导入 / 导出 ----------------------------- */

export function serializeData(data: PersistedData): string {
  return JSON.stringify(
    { ...data, exportedAt: new Date().toISOString(), app: 'ch10-history-tree' },
    null,
    2,
  );
}

export type ParseResult = { ok: true; data: PersistedData } | { ok: false; error: string };

export function parseImportedData(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 解析失败，请确认导出文件未被修改过。' };
  }
  if (!isRecord(parsed)) return { ok: false, error: '文件内容不是 JSON 对象，无法导入。' };
  const knownKeys = ['countries', 'events'];
  if (!knownKeys.some((key) => key in parsed)) {
    return { ok: false, error: '文件结构不认识：请导入本应用「数据 → 导出 JSON」生成的文件。' };
  }
  const data = sanitizeData(parsed);
  if (data.events.length === 0) return { ok: false, error: '文件里没有可导入的事件节点。' };
  return { ok: true, data };
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}

/* ------------------------------ localStorage ---------------------------- */

export function loadData(): PersistedData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveData(data: PersistedData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: DATA_VERSION }));
  } catch {
    /* 容量不足或隐私模式下忽略：应用仍可正常在内存中使用 */
  }
}

export function clearStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
