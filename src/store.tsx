import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import type { Country, EventDraftInput, PersistedData, TimelineEvent, TimeValue } from './types';
import { uid } from './lib/id';
import { formatDisplay, normalizeTime, toSortable } from './lib/time';
import { createSeedData, DATA_VERSION } from './lib/storage';
import {
  createLocalBackend,
  createYjsBackend,
  hashPassphrase,
  resolveRoomId,
  shareUrl,
  switchToNewRoom,
  writeSnapshot,
  type DataBackend,
  type EventPatch,
} from './lib/collab';

/* ================================================================== *
 * store = UI 状态（useReducer）+ 数据后端（可切换本地 / 在线协同）
 *
 * 数据（国家 + 事件）由 DataBackend 负责，UI 状态（展开、弹窗、提示）
 * 留在本地。两者合起来对外仍是一个 StoreValue，所以各个组件不用改。
 * ================================================================== */

export type FormState = { kind: 'create'; presetCountryId?: string } | { kind: 'edit'; eventId: string } | null;

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** 需要输入清空口令才能继续（只有设过口令时才为 true） */
  requirePass?: boolean;
  action: Action;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}

/** 纯 UI 状态：多人协同时各人看各人的，不共享 */
interface UiState {
  expandedEventIds: string[];
  form: FormState;
  confirm: ConfirmRequest | null;
  toast: Toast | null;
}

/** 对外暴露的 state：数据 + UI，形状和以前一致 */
export interface State extends PersistedData, UiState {}

/** 事件里可以被单独改写的字段（编辑时只写改动过的那些） */
export type EventField = 'time' | 'countryId' | 'title' | 'detail' | 'links' | 'tags';

export type Action =
  | { type: 'toggle-event'; eventId: string }
  | { type: 'expand-event'; eventId: string }
  | { type: 'collapse-all' }
  | { type: 'open-form'; form: Exclude<FormState, null> }
  | { type: 'close-form' }
  /** changed：这次实际改了哪些字段。只写这些字段，别人同时改的字段才不会被覆盖 */
  | { type: 'save-event'; input: EventDraftInput; changed?: EventField[] }
  | { type: 'delete-event'; eventId: string }
  | { type: 'add-country'; country: Country }
  /** 删除一条国家分支：连同它下面的所有事件节点一起移除（主干不可删） */
  | { type: 'delete-country'; countryId: string }
  | { type: 'ask-confirm'; request: ConfirmRequest }
  | { type: 'resolve-confirm'; run: boolean }
  | { type: 'toast'; message: string; tone?: Toast['tone'] }
  | { type: 'dismiss-toast' }
  | { type: 'import-data'; data: PersistedData }
  | { type: 'reset-data' };

const TOAST_MS = 2600;

export interface ValidationErrors {
  time?: string;
  countryId?: string;
  title?: string;
}

/** 时间、国家、标题必填 */
export function validateEventSubmission(input: {
  time: TimeValue;
  countryId: string;
  title: string;
}): { ok: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  const start = (input.time?.start ?? '').trim();
  if (!start) errors.time = '请填写时间（如 2012-11-08 / 2012-11 / 2012）';
  else if (!Number.isFinite(toSortable(start))) errors.time = '时间格式无法识别';
  else if (input.time?.precision === 'range' && !(input.time.end ?? '').trim())
    errors.time = '区间时间需要填写结束时间';
  if (!(input.countryId ?? '').trim()) errors.countryId = '请选择国家（必填，单选）';
  if (!(input.title ?? '').trim()) errors.title = '请填写事件名称';
  return { ok: Object.keys(errors).length === 0, errors };
}

function nowIso(): string {
  return new Date().toISOString();
}

function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function eventTimeFromInput(input: EventDraftInput): TimelineEvent['time'] {
  const normalized = normalizeTime(input.time);
  return { ...normalized, display: normalized.display || formatDisplay(normalized) };
}

function buildEvent(input: EventDraftInput, existing?: TimelineEvent): TimelineEvent {
  const timestamp = nowIso();
  return {
    id: existing?.id ?? input.id ?? uid('e'),
    title: input.title.trim(),
    countryId: input.countryId,
    detail: input.detail,
    links: input.links.filter((link) => link.url.trim() !== ''),
    tags: input.tags.filter((tag) => tag.trim() !== ''),
    time: eventTimeFromInput(input),
    source: existing?.source ?? 'user',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

/**
 * 组装「只写改动字段」的补丁。
 * 不传 changed（调用方没说明改了哪些字段）时按整条保存处理，宁可全写也不能漏写。
 */
const ALL_EVENT_FIELDS: EventField[] = ['time', 'countryId', 'title', 'detail', 'links', 'tags'];

function buildPatch(event: TimelineEvent, changed?: EventField[]): EventPatch {
  const patch: EventPatch = { updatedAt: event.updatedAt };
  const fields = changed ?? ALL_EVENT_FIELDS;
  for (const field of fields) {
    // 逐字段拷贝：每个字段类型各不相同，这里用一次断言换取动态键的简洁
    (patch as Record<string, unknown>)[field] = event[field];
  }
  return patch;
}

/* ------------------------------ UI reducer ------------------------------ */

const INITIAL_UI: UiState = { expandedEventIds: [], form: null, confirm: null, toast: null };

function uiReducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'toggle-event':
      return { ...state, expandedEventIds: toggleInList(state.expandedEventIds, action.eventId) };
    case 'expand-event':
      return state.expandedEventIds.includes(action.eventId)
        ? state
        : { ...state, expandedEventIds: [...state.expandedEventIds, action.eventId] };
    case 'collapse-all':
      return { ...state, expandedEventIds: [] };
    case 'open-form':
      return { ...state, form: action.form };
    case 'close-form':
      return { ...state, form: null };
    case 'ask-confirm':
      return { ...state, confirm: action.request };
    case 'resolve-confirm':
      return { ...state, confirm: null };
    case 'toast':
      return { ...state, toast: { id: uid('t'), message: action.message, tone: action.tone ?? 'info' } };
    case 'dismiss-toast':
      return { ...state, toast: null };
    default:
      return state;
  }
}

/* ================================ Provider ============================== */

export interface StoreValue {
  state: State;
  dispatch: Dispatch<Action>;
  countries: Country[];
  countryById: (id: string | undefined) => Country | undefined;
  addCountry: (name: string, options?: { side?: 'left' | 'right'; color?: string }) => Country;
  /** 删除一条国家分支（带二次确认，主干不可删） */
  requestDeleteCountry: (countryId: string) => void;
  requestDeleteEvent: (event: TimelineEvent) => void;
  requestResetData: () => void;
  /** 导入并覆盖（带二次确认 + 清空口令） */
  requestImportData: (data: PersistedData) => void;
  /** true = 多人协同时刻（配了 Liveblocks key）；false = 单机模式 */
  collaborative: boolean;
  /** 分享链接（含房间号），只在协同模式下有意义 */
  shareUrl: string;
  /** 当前房间号（单机模式下为空串） */
  roomId: string;
  /** 换到一个全新的房间：会把当前内容复制过去（新房间继承现在的板子） */
  startNewRoom: () => void;
  /** 是否设过清空口令 */
  hasClearPass: boolean;
  /** 校验清空口令；没设过口令时恒为 true */
  checkClearPass: (text: string) => Promise<boolean>;
  /** 设置 / 清除清空口令（传空字符串表示清除） */
  setClearPass: (text: string) => Promise<void>;
}

export const COUNTRY_PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#0284c7',
  '#e11d48',
  '#4f46e5',
  '#0891b2',
  '#ca8a04',
  '#9f1239',
  '#0d9488',
  '#65a30d',
];

const StoreContext = createContext<StoreValue | null>(null);

const LIVEBLOCKS_KEY = String(import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY ?? '').trim();

/** 房间号只解析一次：resolveRoomId 会往地址栏写，不能在渲染里反复调 */
let cachedRoomId: string | null = null;
function roomId(): string {
  if (cachedRoomId === null) cachedRoomId = resolveRoomId();
  return cachedRoomId;
}

/** 给自己分一个头像底色，进房间时用一次 */
function pickColor(): string {
  return COUNTRY_PALETTE[Math.floor(Math.random() * COUNTRY_PALETTE.length)];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  if (!LIVEBLOCKS_KEY) {
    // 没配 key：退化成单机模式，页面照常能用
    return <LocalStore>{children}</LocalStore>;
  }
  return (
    <LiveblocksProvider publicApiKey={LIVEBLOCKS_KEY}>
      <RoomProvider id={roomId()} initialPresence={{ nickname: null, color: pickColor(), editingEventId: null }}>
        <CollabStore>{children}</CollabStore>
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function LocalStore({ children }: { children: ReactNode }) {
  const backend = useMemo(() => createLocalBackend(), []);
  return <StoreShell backend={backend}>{children}</StoreShell>;
}

function CollabStore({ children }: { children: ReactNode }) {
  const room = useRoom();
  // getYjsProviderForRoom 会按房间缓存 provider，所以这里不要在卸载时 destroy：
  // StrictMode 下 effect 会跑两遍，destroy 掉缓存里的 provider 会让第二次挂载拿到死的连接。
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);
  // provider 用于等首次同步完成再播种；roomId 用于判断本地快照是不是上一个房间的
  const backend = useMemo(
    () => createYjsBackend(provider.getYDoc(), { provider, roomId: roomId() }),
    [provider],
  );

  // 调试入口：开发模式下把共享文档、provider、后端都挂到 window，
  // 方便在控制台或自动化里直接看同步状态
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__collab = {
      doc: provider.getYDoc(),
      provider,
      backend,
    };
  }, [provider, backend]);

  return (
    <StoreShell backend={backend} snapshotRoom={roomId()}>
      {children}
    </StoreShell>
  );
}

/**
 * @param snapshotRoom 传了才写本地快照（只有协同模式需要：单机模式本身就存在 localStorage）
 */
function StoreShell({
  backend,
  children,
  snapshotRoom,
}: {
  backend: DataBackend;
  children: ReactNode;
  snapshotRoom?: string;
}) {
  const [data, setData] = useState<PersistedData>(() => backend.read());
  const [ui, uiDispatch] = useReducer(uiReducer, INITIAL_UI);
  const [clearPassHash, setClearPassHash] = useState<string | null>(() => backend.getClearPassHash());

  /* 后端一变（自己改的、或别人同步过来的）就重新读一份快照，布局随之重算 */
  useEffect(() => {
    setData(backend.read());
    return backend.subscribe(() => setData(backend.read()));
  }, [backend]);

  /* 顺手在本地留一份快照：连接中/断网时先拿它铺图，新建房间时拿它当种子，
     房间万一被清空了也靠它恢复。
     只在数据「确实是房间里的真实内容」时才落盘——首次同步之前 read() 返回的可能是缓存，
     把它当成事实写下去会把「这个房间」的快照写错。 */
  useEffect(() => {
    if (!snapshotRoom || !backend.isLive()) return;
    const timer = window.setTimeout(() => {
      writeSnapshot(snapshotRoom, { version: DATA_VERSION, countries: data.countries, events: data.events });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [snapshotRoom, backend, data.countries, data.events]);

  // dispatch 里要读最新的 ui / data，用 ref 避开闭包过期，同时保持 dispatch 引用稳定
  const latest = useRef({ ui, data, clearPassHash });
  latest.current = { ui, data, clearPassHash };

  const state = useMemo<State>(() => ({ ...data, ...ui }), [data, ui]);

  const selfDispatch = useRef<Dispatch<Action>>(() => undefined);

  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      const { ui: currentUi, data: currentData } = latest.current;

      switch (action.type) {
        /* ---- 以下都是「改数据」的动作：走后端，不走 UI reducer ---- */
        case 'save-event': {
          const editingId = currentUi.form?.kind === 'edit' ? currentUi.form.eventId : undefined;
          const target = editingId ? currentData.events.find((event) => event.id === editingId) : undefined;

          const check = validateEventSubmission(action.input);
          if (!check.ok) {
            uiDispatch({
              type: 'toast',
              message: `无法保存：${Object.values(check.errors).join('；')}`,
              tone: 'error',
            });
            return;
          }

          const event = buildEvent({ ...action.input, id: target?.id ?? action.input.id }, target);

          if (target) {
            // 只写改动过的字段：别人同时在改这个节点的其他字段，改动不会被我们覆盖
            backend.patchEvent(target.id, buildPatch(event, action.changed));
          } else {
            backend.upsertEvent(event);
            uiDispatch({ type: 'expand-event', eventId: event.id });
          }

          uiDispatch({ type: 'close-form' });
          uiDispatch({
            type: 'toast',
            message: target ? '修改已保存，节点已按新时间与国家重新归位' : '已添加节点，自动归入对应时间层与分支',
            tone: 'success',
          });
          return;
        }

        case 'delete-event': {
          const target = currentData.events.find((event) => event.id === action.eventId);
          if (!target) return;
          backend.tombstoneEvent(action.eventId);
          if (currentUi.form?.kind === 'edit' && currentUi.form.eventId === action.eventId) {
            uiDispatch({ type: 'close-form' });
          }
          uiDispatch({ type: 'toast', message: `已删除「${target.title || '未命名事件'}」`, tone: 'info' });
          return;
        }

        case 'add-country':
          if (currentData.countries.some((country) => country.id === action.country.id)) return;
          backend.upsertCountry(action.country);
          return;

        case 'delete-country': {
          const target = currentData.countries.find((country) => country.id === action.countryId);
          if (!target || target.isMain) return; // 主干（中国）不能删
          const removed = currentData.events.filter((event) => event.countryId === action.countryId).length;
          backend.tombstoneCountry(action.countryId);
          uiDispatch({
            type: 'toast',
            message: removed > 0 ? `已删除分支「${target.name}」以及它的 ${removed} 个事件节点` : `已删除分支「${target.name}」`,
            tone: 'info',
          });
          return;
        }

        case 'import-data':
          backend.replaceAll(action.data);
          uiDispatch({ type: 'toast', message: '导入成功，数据已覆盖当前内容', tone: 'success' });
          return;

        case 'reset-data':
          backend.replaceAll(createSeedData());
          uiDispatch({ type: 'toast', message: '已恢复初始数据', tone: 'info' });
          return;

        /* 二次确认：点「确定」时把里面包着的动作再走一遍 dispatch */
        case 'resolve-confirm': {
          const request = currentUi.confirm;
          uiDispatch({ type: 'resolve-confirm', run: action.run });
          if (action.run && request) selfDispatch.current(request.action);
          return;
        }

        /* ---- 其余是纯 UI 动作 ---- */
        default:
          uiDispatch(action);
      }
    },
    [backend],
  );

  selfDispatch.current = dispatch;

  useEffect(() => {
    if (!ui.toast) return;
    const timer = window.setTimeout(() => uiDispatch({ type: 'dismiss-toast' }), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [ui.toast]);

  const countryById = useCallback(
    (id: string | undefined) => (id ? data.countries.find((country) => country.id === id) : undefined),
    [data.countries],
  );

  const addCountry = useCallback(
    (name: string, options?: { side?: 'left' | 'right'; color?: string }): Country => {
      // order 的奇偶决定分支在主干哪一侧：奇数在右、偶数在左。
      // 取同奇偶里最小的空位，保证新分支不会把已有分支挤到另一侧。
      const usedOrders = new Set(latest.current.data.countries.map((country) => country.order));
      let order = (options?.side ?? 'right') === 'right' ? 1 : 2;
      while (usedOrders.has(order)) order += 2;

      const country: Country = {
        id: uid('c'),
        name: name.trim() || '未命名国家',
        color: options?.color ?? COUNTRY_PALETTE[latest.current.data.countries.length % COUNTRY_PALETTE.length],
        order,
      };
      backend.upsertCountry(country);
      return country;
    },
    [backend],
  );

  /** 需要口令的动作统一从这里包一层确认框 */
  const ask = useCallback(
    (request: Omit<ConfirmRequest, 'requirePass' | 'action'>, action: Action) => {
      dispatch({
        type: 'ask-confirm',
        request: { ...request, requirePass: latest.current.clearPassHash !== null, action },
      });
    },
    [dispatch],
  );

  const requestDeleteCountry = useCallback(
    (countryId: string) => {
      const { data: currentData } = latest.current;
      const country = currentData.countries.find((item) => item.id === countryId);
      if (!country || country.isMain) return;
      const count = currentData.events.filter((event) => event.countryId === countryId).length;
      ask(
        {
          title: `删除分支「${country.name}」？`,
          description:
            count > 0
              ? `这条分支上的 ${count} 个事件节点会一起删除，此操作不能撤销。建议先导出 JSON 备份。`
              : '这条分支还没有事件，删除它不会影响其他内容。',
          confirmLabel: '确认删除分支',
          tone: 'danger',
        },
        { type: 'delete-country', countryId },
      );
    },
    [ask],
  );

  const requestDeleteEvent = useCallback(
    (event: TimelineEvent) => {
      ask(
        {
          title: '删除这个节点？',
          description: `「${event.title || '未命名事件'}」将从树状图中移除，此操作不能撤销，建议先导出 JSON 备份。`,
          confirmLabel: '确认删除',
          tone: 'danger',
        },
        { type: 'delete-event', eventId: event.id },
      );
    },
    [ask],
  );

  const requestResetData = useCallback(() => {
    ask(
      {
        title: '恢复初始数据？',
        description: '自己添加的国家与节点会全部清空，教材内容回到课本原样。建议先导出 JSON 备份。',
        confirmLabel: '确认恢复',
        tone: 'danger',
      },
      { type: 'reset-data' },
    );
  }, [ask]);

  const requestImportData = useCallback(
    (data: PersistedData) => {
      ask(
        {
          title: '导入并覆盖当前数据？',
          description: `文件里有 ${data.events.length} 个事件节点、${data.countries.length} 个国家，会替换现在的全部内容。此操作不能撤销，建议先导出一份 JSON 备份。`,
          confirmLabel: '确认导入',
          tone: 'danger',
        },
        { type: 'import-data', data },
      );
    },
    [ask],
  );

  const checkClearPass = useCallback(
    async (text: string) => {
      const stored = latest.current.clearPassHash;
      if (!stored) return true;
      return (await hashPassphrase(text)) === stored;
    },
    [],
  );

  const setClearPass = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const hash = trimmed ? await hashPassphrase(trimmed) : null;
      backend.setClearPassHash(hash);
      setClearPassHash(hash);
    },
    [backend],
  );

  /** 换到新房间：先把当前内容落一份快照，新房间播种时会拿它当种子，于是继承现在的板子 */
  const startNewRoom = useCallback(() => {
    if (!snapshotRoom) return;
    writeSnapshot(snapshotRoom, { version: DATA_VERSION, countries: data.countries, events: data.events });
    switchToNewRoom();
  }, [snapshotRoom, data.countries, data.events]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      countries: data.countries,
      countryById,
      addCountry,
      requestDeleteCountry,
      requestDeleteEvent,
      requestResetData,
      requestImportData,
      collaborative: backend.collaborative,
      shareUrl: snapshotRoom ? shareUrl() : '',
      roomId: snapshotRoom ?? '',
      startNewRoom,
      hasClearPass: clearPassHash !== null,
      checkClearPass,
      setClearPass,
    }),
    [
      state,
      dispatch,
      data.countries,
      countryById,
      addCountry,
      requestDeleteCountry,
      requestDeleteEvent,
      requestResetData,
      requestImportData,
      backend.collaborative,
      snapshotRoom,
      startNewRoom,
      clearPassHash,
      checkClearPass,
      setClearPass,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 <StoreProvider> 内使用');
  return ctx;
}

/** 只在协同模式下挂载的组件用它判断 key 有没有配 */
export const hasLiveblocksKey = LIVEBLOCKS_KEY !== '';

export { DATA_VERSION };
