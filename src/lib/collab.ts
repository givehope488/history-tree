import * as Y from 'yjs';
import type { Country, PersistedData, TimelineEvent } from '../types';
import {
  createSeedData,
  DATA_VERSION,
  loadData,
  parseCountry,
  parseEvent,
  saveData,
} from './storage';

/* ================================================================== *
 * 协同层
 *
 * 树状图的排布完全由 { countries, events } 推导（见 lib/layout），
 * 所以「多人协同」要同步的只有这两份数据。这里把它们抽象成一个后端接口，
 * 提供两种实现：
 *   · 本地后端：没有配 Liveblocks key 时使用，内存 + localStorage，单机可用
 *   · Yjs 后端：配了 key 时使用，Liveblocks 托管的 Y.Doc，多人在线
 * 上层 store 只认这个接口，两种模式共用同一套业务逻辑。
 *
 * 两个关键设计：
 *
 * 1. 删除只打 deletedAt 墓碑，不真删记录。
 *    A 删掉某条、B 恰好正在编辑并保存，真删会让这条「复活」。
 *
 * 2. 每条记录在 Y.Doc 里是一个嵌套 Y.Map（字段做键），不是一整个普通对象。
 *    Yjs 只在「Y 类型」这一层做合并，普通对象是原子值——整块 set 会连别人
 *    刚改的字段一起覆盖掉。做成嵌套 Y.Map 之后，张三写 title、李四写 detail
 *    是两次独立的字段写入，两边都能保住。
 * ================================================================== */

/* ------------------------------ 房间号 ------------------------------ */

const ROOM_KEY = 'ch10-history-tree:room';
const SNAPSHOT_KEY = 'ch10-history-tree:snapshot';
/**
 * 「我刚点了新建房间，这个新房间要继承当前内容」的标记。
 * 存的是那个新房间号，播种一次之后就清掉。
 * 没有它的话，就没法区分「我自己开的新房间（该继承）」和
 * 「别人分享给我的新房间（绝不能把我的内容灌进去）」。
 */
const INHERIT_KEY = 'ch10-history-tree:inherit-into';

function randomRoomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等场景忽略：本次会话仍然能用 */
  }
}

/**
 * 房间号。
 *
 * 地址栏带 `#/b/<roomId>` 就用它（并记下来）；地址栏没带就**回到上次用过的房间**，
 * 而不是每次随机开一个新的 —— 否则重开一次页面就等于进了个空房间，
 * 之前的改动看起来「丢了」。只有这个浏览器从来没进过任何房间时才真的新建。
 *
 * 房间号必须够长够随机：匿名链接人人可改，短号会被人猜中闯进来。
 */
export function resolveRoomId(): string {
  const matched = /[#&/]b\/([A-Za-z0-9_-]{6,64})/.exec(window.location.hash);
  if (matched) {
    writeStored(ROOM_KEY, matched[1]);
    return matched[1];
  }
  const id = readStored(ROOM_KEY) ?? randomRoomId();
  writeStored(ROOM_KEY, id);
  window.location.hash = `#/b/${id}`;
  return id;
}

/** 当前页面的分享链接（含房间号），用于「复制链接」按钮 */
export function shareUrl(): string {
  return `${window.location.origin}${window.location.pathname}#/b/${resolveRoomId()}`;
}

/**
 * 换到一个全新的房间并刷新页面。
 * 会打上「继承」标记，刷新后新房间播种时拿本地快照当种子，于是继承现在的内容。
 */
export function switchToNewRoom(): void {
  const id = randomRoomId();
  writeStored(ROOM_KEY, id);
  writeStored(INHERIT_KEY, id);
  window.location.hash = `#/b/${id}`;
  window.location.reload();
}

/** 「新建房间要继承内容」这个意图已经消费掉，清掉标记 */
export function clearInheritFlag(): void {
  try {
    window.localStorage.removeItem(INHERIT_KEY);
  } catch {
    /* 忽略 */
  }
}

/* ---------------------------- 本地快照 ------------------------------ */

export interface LocalSnapshot {
  /** 这份数据属于哪个房间（用来判断「现在是不是一个新房间」） */
  roomId: string;
  savedAt: string;
  countries: Country[];
  events: TimelineEvent[];
}

/**
 * 把快照的原始 JSON 收敛成合法数据；没有可用内容时返回 null。
 * 这里不用 storage 的 sanitizeData —— 它在空数据时会回落到课本种子，
 * 而快照为空时我们只想说「没有快照」。
 */
function parseSnapshot(raw: unknown): LocalSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const countries = Array.isArray(record.countries)
    ? record.countries
        .map((item, index) => parseCountry(item, index))
        .filter((country): country is Country => country !== null)
    : [];
  const events = Array.isArray(record.events)
    ? record.events.map(parseEvent).filter((event): event is TimelineEvent => event !== null)
    : [];
  if (countries.length === 0 && events.length === 0) return null;
  return {
    roomId: typeof record.roomId === 'string' ? record.roomId : '',
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
    countries,
    events,
  };
}

/**
 * 本地快照：把「我看到的这份数据」另存一份在浏览器里。两个用途：
 *   1. 连接中 / 断网时先拿它把图铺出来，不会先看到一片空白；
 *   2. 新建房间时用它当种子，让新房间继承之前做的东西，而不是回到课本骨架。
 */
export function readSnapshot(): LocalSnapshot | null {
  const raw = readStored(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return parseSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSnapshot(roomId: string, data: PersistedData): void {
  const payload: LocalSnapshot = {
    roomId,
    savedAt: new Date().toISOString(),
    countries: data.countries,
    events: data.events,
  };
  writeStored(SNAPSHOT_KEY, JSON.stringify(payload));
}

/* ------------------------------ 口令哈希 ---------------------------- */

/**
 * 清空口令的哈希。这道口令只是「防手滑」，不是真安全：
 * 校验在前端做，懂技术的人绕得过去。不要用它保护敏感内容。
 */
export async function hashPassphrase(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 非安全上下文（例如直接双击打开 file://）没有 crypto.subtle，退化成弱哈希
  let hash = 5381;
  for (const byte of data) hash = ((hash << 5) + hash + byte) >>> 0;
  return `weak-${hash.toString(16)}`;
}

/* ------------------------------ 后端接口 ---------------------------- */

/** 只写这些字段；用于「谁改的字段就写谁」，避免覆盖别人同时的改动 */
export type EventPatch = Partial<Omit<TimelineEvent, 'id'>>;

export interface DataBackend {
  /** 是否连着远端：本地模式为 false，界面上可以据此显示「单机 / 在线」 */
  readonly collaborative: boolean;
  /**
   * 现在这份数据是不是「房间里的真实内容」。
   * 协同模式下，首次同步完成前 `read()` 可能返回的是本地缓存，此时为 false
   * —— 别把缓存当成事实落盘（否则会把「这个房间」的快照写错）。
   */
  isLive(): boolean;
  /** 读一份普通对象快照（已过滤墓碑），直接喂给 computeTreeLayout */
  read(): PersistedData;
  /** 订阅数据变化；返回取消订阅函数 */
  subscribe(listener: () => void): () => void;
  /** 新建或整条覆盖（新建节点时用） */
  upsertEvent(event: TimelineEvent): void;
  /** 只写改动过的字段（编辑节点时用，这是并发不丢改动的关键） */
  patchEvent(eventId: string, patch: EventPatch): void;
  /** 打墓碑（软删除） */
  tombstoneEvent(eventId: string): void;
  upsertCountry(country: Country): void;
  /** 删分支：连带把这条分支名下的事件一起打墓碑 */
  tombstoneCountry(countryId: string): void;
  /** 整表覆盖（导入 / 恢复初始数据） */
  replaceAll(data: PersistedData): void;
  getClearPassHash(): string | null;
  setClearPassHash(hash: string | null): void;
}

/* ---------------------------- 公共小工具 ---------------------------- */

function sortCountries(list: Country[]): Country[] {
  return [...list].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function sortEvents(list: TimelineEvent[]): TimelineEvent[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/* --------------------------- 本地后端实现 --------------------------- */

/**
 * 单机后端：数据和口令都存在 localStorage。
 * 用于没配 Liveblocks key 的场景（也方便离线打开、做演示）。
 */
export function createLocalBackend(): DataBackend {
  const PASS_KEY = 'ch10-history-tree:clear-pass';
  let data: PersistedData = loadData() ?? createSeedData();
  const listeners = new Set<() => void>();

  const emit = () => {
    saveData(data);
    listeners.forEach((listener) => listener());
  };

  const writeEvent = (event: TimelineEvent) => {
    const exists = data.events.some((item) => item.id === event.id);
    data = {
      ...data,
      events: exists ? data.events.map((item) => (item.id === event.id ? event : item)) : [...data.events, event],
    };
  };

  const writeCountry = (country: Country) => {
    const exists = data.countries.some((item) => item.id === country.id);
    data = {
      ...data,
      countries: exists
        ? data.countries.map((item) => (item.id === country.id ? country : item))
        : [...data.countries, country],
    };
  };

  /** 打墓碑而不是真删，和协同模式保持同一套语义 */
  const tombstone = (key: string) => {
    const stamp = new Date().toISOString();
    data = {
      ...data,
      countries: data.countries.map((country) =>
        country.id === key ? { ...country, deletedAt: stamp } : country,
      ),
      events: data.events.map((event) =>
        event.countryId === key || event.id === key ? { ...event, deletedAt: stamp } : event,
      ),
    };
  };

  return {
    collaborative: false,
    isLive() {
      return true; // 单机模式：localStorage 就是权威
    },
    read() {
      return {
        version: DATA_VERSION,
        countries: sortCountries(data.countries.filter((country) => !country.deletedAt)),
        events: sortEvents(data.events.filter((event) => !event.deletedAt)),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    upsertEvent(event) {
      writeEvent(event);
      emit();
    },
    patchEvent(eventId, patch) {
      const current = data.events.find((item) => item.id === eventId);
      if (!current) return;
      writeEvent({ ...current, ...patch, id: eventId });
      emit();
    },
    tombstoneEvent(eventId) {
      tombstone(eventId);
      emit();
    },
    upsertCountry(country) {
      writeCountry(country);
      emit();
    },
    tombstoneCountry(countryId) {
      tombstone(countryId);
      emit();
    },
    replaceAll(next) {
      data = { version: DATA_VERSION, countries: [...next.countries], events: [...next.events] };
      emit();
    },
    getClearPassHash() {
      try {
        return window.localStorage.getItem(PASS_KEY);
      } catch {
        return null;
      }
    },
    setClearPassHash(hash) {
      try {
        if (hash) window.localStorage.setItem(PASS_KEY, hash);
        else window.localStorage.removeItem(PASS_KEY);
      } catch {
        /* 隐私模式等场景忽略 */
      }
    },
  };
}

/* ---------------------------- Yjs 后端实现 -------------------------- */

export interface YjsBackendOptions {
  /** 首次进入、且共享文档还是空的时候，写入种子数据 */
  seed?: boolean;
  /**
   * 播种用的数据。**必须在创建后端的那一刻就算好**，不能等同步完成再算：
   * 那时候本地快照可能已经被 StoreShell 用新房间的 id 覆盖过，
   * 「这份快照属于上一个房间」这个信号就丢了，新房间会退回课本骨架。
   * 不传则用课本种子。
   */
  seedData?: PersistedData | null;
  /**
   * 同步状态来源。给了它就会等「首次同步完成」再决定要不要写种子。
   * 不给就按本地文档立即判断——那只适合确定房间是新建的场景。
   */
  provider?: {
    readonly synced: boolean;
    on(event: 'synced', handler: () => void): void;
  };
  /** 当前房间号，用来判断本地快照是不是「上一个房间」的 */
  roomId?: string;
}

/**
 * 播种用的数据。三种情况分清楚，别把自己的内容灌进别人的房间：
 *
 * 1. 本地快照就是这个房间的 → **用快照恢复**。
 *    房间万一被服务端清空了（或者换了台机器但快照还在），重连后能看到自己的内容，
 *    而不是回到课本骨架。
 * 2. 这个房间是我刚点「新建房间」开出来的（INHERIT_KEY 对得上）→ 用快照，
 *    于是新房间继承上一块板子的内容。
 * 3. 其他情况 —— 比如别人分享了一个新房间的链接给我 —— 用课本骨架。
 *    **绝不能**把自己的快照灌进去，否则会把别人的房间改成我的板子。
 *
 * 注意这三种判断只在「房间确实没有任何数据」时才起作用：
 * 只要房间里已有内容（哪怕被清空过），`meta.seeded` 就在，根本不会走到播种。
 */
function seedSource(roomId: string | undefined): PersistedData {
  const snapshot = readSnapshot();
  if (snapshot) {
    const isThisRoom = Boolean(snapshot.roomId) && snapshot.roomId === roomId;
    const isMyNewRoom = roomId !== undefined && readStored(INHERIT_KEY) === roomId;
    if (isThisRoom || isMyNewRoom) {
      return { version: DATA_VERSION, countries: snapshot.countries, events: snapshot.events };
    }
  }
  return createSeedData();
}

/** 把 Y 类型递归还原成普通对象，好复用 storage 里的守卫解析 */
function yToPlain(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const out: Record<string, unknown> = {};
    value.forEach((item, key) => {
      out[key] = yToPlain(item);
    });
    return out;
  }
  if (value instanceof Y.Array) return value.toArray().map(yToPlain);
  return value;
}

/**
 * 拿到某条记录的字段表（嵌套 Y.Map），必要时就地建好。
 * 早期版本把整条记录当成普通对象存过，这里顺手迁移成字段表。
 */
function fieldsOf(store: Y.Map<unknown>, key: string): Y.Map<unknown> {
  const existing = store.get(key);
  if (existing instanceof Y.Map) return existing;
  const fresh = new Y.Map<unknown>();
  if (existing && typeof existing === 'object') {
    const legacy = existing as Record<string, unknown>;
    for (const field of Object.keys(legacy)) fresh.set(field, legacy[field]);
  }
  store.set(key, fresh);
  return fresh;
}

/** 把一条普通记录整体写进字段表（先清空再写，避免残留旧字段） */
function writeFields(store: Y.Map<unknown>, key: string, record: Record<string, unknown>): void {
  const fields = fieldsOf(store, key);
  const stale = Array.from(fields.keys()).filter((field) => !(field in record));
  for (const field of stale) fields.delete(field);
  for (const [field, value] of Object.entries(record)) {
    if (value === undefined) fields.delete(field);
    else fields.set(field, value);
  }
}

/**
 * 首次进入且共享文档为空时写入种子。靠 meta.seeded 标记保证只写一次，
 * 而且种子用的 id 是固定的，所以即使两个人在同一瞬间都触发也只会得到同一份内容。
 *
 * 注意：这个判断只有在「同步完成之后」才可靠。同步之前本地文档一定是空的，
 * 这时候写种子会把房间里已有的内容整块覆盖掉——调用方负责等同步。
 */
export function ensureSeeded(doc: Y.Doc, options: YjsBackendOptions = {}): void {
  if (options.seed === false) return;
  const meta = doc.getMap('meta');
  if (meta.get('seeded')) return;
  doc.transact(() => {
    const seed = options.seedData ?? createSeedData();
    const countries = doc.getMap('countries');
    const events = doc.getMap('events');
    for (const country of seed.countries) writeFields(countries, country.id, { ...country });
    for (const event of seed.events) writeFields(events, event.id, { ...event });
    meta.set('seeded', true);
    meta.set('seededAt', new Date().toISOString());
  });
}

/**
 * 协同后端：数据放在 Liveblocks 托管的 Y.Doc 里。
 * 每条记录是一个嵌套 Y.Map，字段各自独立合并，所以两个人改同一个节点的
 * 不同字段时，两边的改动都能保住。
 */
export function createYjsBackend(doc: Y.Doc, options: YjsBackendOptions = {}): DataBackend {
  const countriesMap = doc.getMap<unknown>('countries');
  const eventsMap = doc.getMap<unknown>('events');
  const metaMap = doc.getMap<unknown>('meta');
  const listeners = new Set<() => void>();

  // 播种数据在这里就定下来（见 YjsBackendOptions.seedData 的注释）
  const seedData = options.seed === false ? null : (options.seedData ?? seedSource(options.roomId));
  const seedOptions: YjsBackendOptions = { ...options, seedData };

  const emit = () => listeners.forEach((listener) => listener());

  // 远端来的人改动文档、或本地改了之后，都要通知 React 重算布局
  doc.on('update', emit);
  doc.on('afterTransaction', emit);

  /* 种子的时机很关键。
     同步之前本地文档一定是空的，如果这时候就写种子，会把房间里已有的内容整块覆盖掉
     —— 表现出来就是「刷新一次，别人刚改的东西全没了」。所以等首次同步完成再判断。 */
  let seedHandled = false;
  const seedIfNeeded = () => {
    if (seedHandled) return;
    seedHandled = true;
    ensureSeeded(doc, seedOptions);
    clearInheritFlag(); // 「新建房间要继承内容」这个意图到此消费掉
    emit();
  };

  /* 首次同步之前，我们并不知道房间里到底有什么（本地文档必然是空的）。
     这段空窗期用本地快照顶上，免得打开页面先看到一片空白；
     同步一完成就不再用了——那时候文档才是权威，用快照会显示出已经删掉的东西。 */
  let everSynced = options.provider ? options.provider.synced : true;
  const markSynced = () => {
    everSynced = true;
  };

  if (options.seed === false) {
    seedHandled = true;
  } else if (options.provider) {
    if (options.provider.synced) {
      markSynced();
      seedIfNeeded();
    } else {
      options.provider.on('synced', () => {
        markSynced();
        seedIfNeeded();
      });
    }
  } else {
    seedIfNeeded();
  }

  emit();

  return {
    collaborative: true,
    isLive() {
      return everSynced;
    },
    read() {
      const countries: Country[] = [];
      const events: TimelineEvent[] = [];
      let index = 0;
      countriesMap.forEach((value) => {
        const parsed = parseCountry(yToPlain(value), index);
        index += 1;
        if (parsed && !parsed.deletedAt) countries.push(parsed);
      });
      eventsMap.forEach((value) => {
        const parsed = parseEvent(yToPlain(value));
        if (parsed && !parsed.deletedAt) events.push(parsed);
      });

      if (countries.length === 0 && events.length === 0 && !everSynced) {
        const snapshot = readSnapshot();
        if (snapshot) {
          return { version: DATA_VERSION, countries: snapshot.countries, events: snapshot.events };
        }
      }

      return { version: DATA_VERSION, countries: sortCountries(countries), events: sortEvents(events) };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    upsertEvent(event) {
      doc.transact(() => writeFields(eventsMap, event.id, { ...event }));
    },
    patchEvent(eventId, patch) {
      doc.transact(() => {
        const fields = fieldsOf(eventsMap, eventId);
        for (const [field, value] of Object.entries(patch)) {
          if (value === undefined) fields.delete(field);
          else fields.set(field, value);
        }
      });
    },
    tombstoneEvent(eventId) {
      if (!eventsMap.has(eventId)) return;
      doc.transact(() => fieldsOf(eventsMap, eventId).set('deletedAt', new Date().toISOString()));
    },
    upsertCountry(country) {
      doc.transact(() => writeFields(countriesMap, country.id, { ...country }));
    },
    tombstoneCountry(countryId) {
      doc.transact(() => {
        const stamp = new Date().toISOString();
        if (countriesMap.has(countryId)) fieldsOf(countriesMap, countryId).set('deletedAt', stamp);
        // 连带把这条分支名下的事件一起打墓碑
        eventsMap.forEach((_value, key) => {
          const fields = fieldsOf(eventsMap, key);
          if (fields.get('countryId') === countryId && !fields.get('deletedAt')) fields.set('deletedAt', stamp);
        });
      });
    },
    replaceAll(next) {
      doc.transact(() => {
        const stamp = new Date().toISOString();
        // 先给现有记录打墓碑（保住别人对它们的引用不被「复活」），再写入新记录
        countriesMap.forEach((_value, key) => {
          const fields = fieldsOf(countriesMap, key);
          if (!fields.get('deletedAt')) fields.set('deletedAt', stamp);
        });
        eventsMap.forEach((_value, key) => {
          const fields = fieldsOf(eventsMap, key);
          if (!fields.get('deletedAt')) fields.set('deletedAt', stamp);
        });
        for (const country of next.countries) writeFields(countriesMap, country.id, { ...country });
        for (const event of next.events) writeFields(eventsMap, event.id, { ...event });
        metaMap.set('seeded', true);
      });
    },
    getClearPassHash() {
      const value = metaMap.get('clearPassHash');
      return typeof value === 'string' && value ? value : null;
    },
    setClearPassHash(hash) {
      doc.transact(() => {
        if (hash) metaMap.set('clearPassHash', hash);
        else metaMap.delete('clearPassHash');
      });
    },
  };
}
