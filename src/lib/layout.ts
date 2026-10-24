import type { Country, TimelineEvent } from '../types';
import { formatDisplay, timeKey, toDayNumber } from './time';

/* ================================================================== *
 * 树状图布局引擎（方案1：中国中央主干 + 各国平行彩色分支）
 *
 * 规则：
 *  1. 纵向 = 时间轴，按真实时间比例排布，并保证相邻时间层有最小行高；
 *  2. 每个事件 = 一个独立节点，落在「本国分支」与「本时间层」的交叉点上；
 *  3. 同一时间点的所有节点 y 相同（同一条水平线上）；
 *  4. 同一国家的事件落在同一条彩色分支（竖直轨道）上；
 *  5. 中国 = 主分支，占据中央主干；其余国家按 order 左右交替分列；
 *  6. 每条分支第一次出现时，用一段平滑曲线接到「最近的、当时已经存在的、
 *     偏向中间的分支」上（越靠中间越优先，主干是最终兜底）——像岔路一样长出来，
 *     而不是凭空出现一条平行线。
 * ================================================================== */

export interface TreeLayoutConfig {
  /** 相邻轨道（分支）之间的水平距离 */
  laneWidth: number;
  /** 相邻时间层的最小垂直行高（也是密集区间的下限） */
  minLevelGap: number;
  /** 「平均间隔」映射到的行高：总高 ≈ (时间层数-1) × 这个值 */
  comfortableGap: number;
  topPad: number;
  bottomPad: number;
  /** 节点标签宽度（用于计算左右留白） */
  labelWidth: number;
  /** 图形外侧留白 */
  outerPad: number;
  /** 同一分支同一时间层出现多个节点时的横向错开量 */
  siblingSpread: number;
  /** 曲线接入的纵向跨度下限（实际跨度按水平距离自适应） */
  rampRiseMin: number;
  /** 曲线接入的纵向跨度上限 */
  rampRiseMax: number;
}

export const DEFAULT_LAYOUT_CONFIG: TreeLayoutConfig = {
  laneWidth: 184,
  minLevelGap: 104,
  comfortableGap: 132,
  topPad: 64,
  bottomPad: 96,
  labelWidth: 164,
  outerPad: 140,
  siblingSpread: 26,
  rampRiseMin: 24,
  rampRiseMax: 52,
};

/** 曲线跨度与「离主干的水平距离」的比例：越靠外的分支曲线越舒展 */
const RAMP_RISE_RATIO = 0.2;
/** 曲线起点距画布顶端至少保留的距离 */
const RAMP_TOP_MARGIN = 8;
/** 曲线跨度小于这个值就不画（空间不够） */
const MIN_RAMP_RISE = 8;

export type BranchSide = 'center' | 'left' | 'right';

export interface LevelLayout {
  key: string;
  label: string;
  y: number;
  /** 该时间层上的节点数 */
  count: number;
}

export interface NodeLayout {
  event: TimelineEvent;
  country: Country | undefined;
  color: string;
  lane: number;
  side: BranchSide;
  x: number;
  y: number;
  isMain: boolean;
}

export interface BranchLayout {
  country: Country;
  color: string;
  lane: number;
  side: BranchSide;
  x: number;
  yTop: number;
  yBottom: number;
  isMain: boolean;
  /** 本分支第一个事件的 y（曲线接在这里） */
  firstY: number;
}

/** 分支第一次出现时，从父分支接到本分支第一个节点的平滑曲线（不是节点） */
export interface RampLayout {
  /** 直接可用的 SVG path（三次贝塞尔，两端竖直相切） */
  d: string;
  color: string;
  childId: string;
  parentId: string;
}

export interface TreeLayout {
  width: number;
  height: number;
  centerX: number;
  /** 最外侧分支的 x，用于画时间层水平参考线 */
  railLeftX: number;
  railRightX: number;
  levels: LevelLayout[];
  nodes: NodeLayout[];
  branches: BranchLayout[];
  ramps: RampLayout[];
}

const NEUTRAL_COLOR = '#94a3b8';

function sideOf(lane: number): BranchSide {
  if (lane === 0) return 'center';
  return lane > 0 ? 'right' : 'left';
}

export function computeTreeLayout(
  events: TimelineEvent[],
  countries: Country[],
  config: TreeLayoutConfig = DEFAULT_LAYOUT_CONFIG,
): TreeLayout {
  const byId = new Map(countries.map((country) => [country.id, country]));
  const mainCountry = countries.find((country) => country.isMain);

  /* ------------------------- 1. 归并时间层 ------------------------- */
  const levelMap = new Map<
    string,
    { key: string; day: number; label: string; events: TimelineEvent[] }
  >();
  for (const event of events) {
    const key = timeKey(event.time);
    const day = toDayNumber(event.time.start) ?? 0;
    const found = levelMap.get(key);
    if (found) found.events.push(event);
    else levelMap.set(key, { key, day, label: formatDisplay(event.time), events: [event] });
  }
  const rawLevels = [...levelMap.values()].sort(
    (a, b) => a.day - b.day || a.key.localeCompare(b.key),
  );

  /* ------------------- 2. 时间 → y（真实比例 + 最小行高） ------------------- */
  const ys: number[] = [];
  if (rawLevels.length === 1) {
    ys.push(config.topPad);
  } else if (rawLevels.length > 1) {
    // 用「真实经过的天数」算间隔，再把「平均间隔」映射到 comfortableGap：
    // 这样总高与事件条数成正比，不会因为某两件事相隔很久就把整张图拉成几万像素。
    const gaps: number[] = [];
    for (let i = 1; i < rawLevels.length; i += 1) {
      gaps.push(Math.max(rawLevels[i].day - rawLevels[i - 1].day, 0));
    }
    const totalDays = gaps.reduce((sum, gap) => sum + gap, 0);
    const averageGap = totalDays > 0 ? totalDays / gaps.length : 1;
    const unit = averageGap > 0 ? config.comfortableGap / averageGap : 1;
    ys.push(config.topPad);
    for (let i = 1; i < rawLevels.length; i += 1) {
      ys.push(ys[i - 1] + Math.max(config.minLevelGap, gaps[i - 1] * unit));
    }
  }
  const contentBottom = ys.length > 0 ? ys[ys.length - 1] : config.topPad;

  /* --------------------------- 3. 轨道分配 --------------------------- */
  // 只有真正有事件的国家才占一条轨道，避免空分支浪费横向空间
  const usedCountryIds = new Set(events.map((event) => event.countryId));
  const branchesOrdered = countries
    .filter((country) => !country.isMain && usedCountryIds.has(country.id))
    .sort((a, b) => a.order - b.order);
  // 每条分支「第一个事件」的时间：用来决定它离主干多远
  const firstDayOf = new Map<string, number>();
  for (const event of events) {
    const day = toDayNumber(event.time.start);
    if (day === null) continue;
    const previous = firstDayOf.get(event.countryId);
    if (previous === undefined || day < previous) firstDayOf.set(event.countryId, day);
  }

  const laneOf = new Map<string, number>();
  if (mainCountry && usedCountryIds.has(mainCountry.id)) laneOf.set(mainCountry.id, 0);
  // 左右由 order 的奇偶固定：奇数在右、偶数在左（新增分支不会挤到另一侧）；
  // 环号（离主干的远近）按「该分支第一个事件的时间」排：**越早越靠近主干**。
  const byFirstDay = (a: Country, b: Country): number =>
    (firstDayOf.get(a.id) ?? Number.POSITIVE_INFINITY) -
      (firstDayOf.get(b.id) ?? Number.POSITIVE_INFINITY) || a.order - b.order;
  branchesOrdered
    .filter((country) => country.order % 2 === 1)
    .sort(byFirstDay)
    .forEach((country, index) => laneOf.set(country.id, index + 1));
  branchesOrdered
    .filter((country) => country.order % 2 === 0)
    .sort(byFirstDay)
    .forEach((country, index) => laneOf.set(country.id, -(index + 1)));
  const maxAbsLane = Math.max(0, ...[...laneOf.values()].map((lane) => Math.abs(lane)));

  const half = maxAbsLane * config.laneWidth + config.labelWidth + config.outerPad;
  const centerX = half;
  const width = half * 2;
  const xOfLane = (lane: number): number => centerX + lane * config.laneWidth;

  /* ----------------------------- 4. 节点 ----------------------------- */
  const levelIndex = new Map<string, number>();
  rawLevels.forEach((level, index) => levelIndex.set(level.key, index));

  const nodes: NodeLayout[] = [];
  const siblingCount = new Map<string, number>();
  for (const event of events) {
    const index = levelIndex.get(timeKey(event.time));
    if (index === undefined) continue;
    const country = byId.get(event.countryId) ?? mainCountry;
    const lane = country ? laneOf.get(country.id) ?? 0 : 0;
    const side = sideOf(lane);
    const groupKey = `${lane}|${timeKey(event.time)}`;
    const seat = siblingCount.get(groupKey) ?? 0;
    siblingCount.set(groupKey, seat + 1);
    nodes.push({
      event,
      country,
      color: country?.color ?? NEUTRAL_COLOR,
      lane,
      side,
      // 同分支同时间层的多个节点，沿轨道向外错开，保持 y 一致
      x: xOfLane(lane) + seat * config.siblingSpread * (side === 'left' ? -1 : 1),
      y: ys[index],
      isMain: Boolean(country?.isMain),
    });
  }

  /* ----------------------------- 5. 分支轨道 ----------------------------- */
  const branches: BranchLayout[] = [];
  for (const country of countries) {
    const lane = laneOf.get(country.id);
    if (lane === undefined) continue;
    const own = nodes.filter((node) => node.country?.id === country.id);
    if (own.length === 0) continue;
    const isMain = Boolean(country.isMain);
    const ownYs = own.map((node) => node.y);
    const firstY = Math.min(...ownYs);
    // 主分支贯穿整条时间轴，读作「主轴」；其他分支只覆盖自己的事件范围。
    // 只有一个事件的分支就是零长度轨道（不额外向上补线），归属完全靠接入曲线体现。
    const yTop = isMain && ys.length > 0 ? ys[0] : firstY;
    const yBottom = isMain && ys.length > 0 ? ys[ys.length - 1] : Math.max(...ownYs);
    branches.push({
      country,
      color: country.color,
      lane,
      side: sideOf(lane),
      x: xOfLane(lane),
      yTop,
      yBottom,
      isMain,
      firstY,
    });
  }

  /* ------------------- 6. 分支曲线接入「最近且偏中间」的分支 ------------------- */
  const branchByLane = new Map<number, BranchLayout>();
  for (const branch of branches) branchByLane.set(branch.lane, branch);

  const ramps: RampLayout[] = [];
  // 由内向外处理：内层分支先接好，外层分支才能接到已经延长过的内层轨道上
  const childBranches = branches
    .filter((branch) => !branch.isMain)
    .sort((a, b) => Math.abs(a.lane) - Math.abs(b.lane));

  for (const child of childBranches) {
    const direction = child.lane > 0 ? 1 : -1;
    // 曲线跨度按「离主干的水平距离」自适应：越靠外越舒展，但受上下限约束
    const reach = config.laneWidth * Math.abs(child.lane);
    let rise = Math.min(Math.max(reach * RAMP_RISE_RATIO, config.rampRiseMin), config.rampRiseMax);
    rise = Math.min(rise, child.firstY - RAMP_TOP_MARGIN);
    if (rise < MIN_RAMP_RISE) continue;
    const startY = child.firstY - rise;

    // 由内向外找父分支：
    //  · 主干贯穿整条时间轴，是最终兜底，允许把它向上延长；
    //  · 其他分支只有在「本来就已经在那个时间点存在」时才能当父分支——否则就得把它的轨道
    //    向上延长（不希望出现这种延伸），于是继续往中间找，最终落到主干上。
    let parent: BranchLayout | undefined;
    for (let ring = Math.abs(child.lane) - 1; ring >= 0; ring -= 1) {
      const candidate = branchByLane.get(direction * ring);
      if (!candidate) continue;
      if (candidate.isMain) {
        parent = candidate;
        break;
      }
      if (candidate.yTop <= startY && startY <= candidate.yBottom) {
        parent = candidate;
        break;
      }
    }
    if (!parent) continue;

    const y1 = startY;
    const y2 = child.firstY;
    const mid = rise / 2;
    // 三次贝塞尔：两端竖直相切，与两条竖直轨道自然衔接
    ramps.push({
      d: `M ${parent.x} ${y1} C ${parent.x} ${y1 + mid}, ${child.x} ${y2 - mid}, ${child.x} ${y2}`,
      color: child.color,
      childId: child.country.id,
      parentId: parent.country.id,
    });
    // 父分支延长到曲线起点，接口处才不会断开
    parent.yTop = Math.min(parent.yTop, y1);
  }

  /* --------------------------- 7. 时间层水平线 --------------------------- */
  const railLeftX = maxAbsLane > 0 ? xOfLane(-maxAbsLane) : centerX;
  const railRightX = maxAbsLane > 0 ? xOfLane(maxAbsLane) : centerX;
  const levels: LevelLayout[] = rawLevels.map((level, index) => ({
    key: level.key,
    label: level.label,
    y: ys[index],
    count: level.events.length,
  }));

  const height = contentBottom + config.bottomPad;

  return { width, height, centerX, railLeftX, railRightX, levels, nodes, branches, ramps };
}
