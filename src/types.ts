/* ------------------------------------------------------------------ *
 * 领域模型：历史事件树状图
 * 每个事件就是一个独立节点；节点按「时间」落到水平层，按「国家」落到彩色分支。
 * 中国是主分支（中央主干），其余国家各自一条分支。
 * ------------------------------------------------------------------ */

/** 事件来源：教材原文或自己补充，仅作来源标记 */
export type EventSource = 'textbook' | 'user';

/** 时间精度：年 / 月 / 日 / 区间 */
export type TimePrecision = 'year' | 'month' | 'day' | 'range';

export interface Country {
  id: string;
  name: string;
  /** 分支颜色：同一国家的事件落在同色分支上 */
  color: string;
  /** 分支顺序，决定分支离主干的远近（越小越靠近主干） */
  order: number;
  /** 主分支标记：中国 = 中央主干 */
  isMain?: boolean;
  /**
   * 软删除（墓碑）：多人协同时不能真删记录——A 删掉某条、B 恰好正在编辑并保存，
   * 真删会被"复活"。所以删除只打这个标记，读取时过滤掉。
   */
  deletedAt?: string;
}

export interface TimeValue {
  /** 起始时间，形如 '2012-11-08' / '2012-11' / '2012'，公元前用负年，如 '-500' */
  start: string;
  /** 区间结束时间，precision 为 'range' 时使用 */
  end?: string;
  /** 展示文本，如 '2012年11月8日'；留空时由 start/precision 自动生成 */
  display: string;
  precision: TimePrecision;
}

export interface EventLink {
  label: string;
  url: string;
}

/** 时间线上的一个节点 = 一个历史事件 */
export interface TimelineEvent {
  id: string;
  /** 节点上显示的极简概述（展开后看 detail 全文） */
  title: string;
  /** 归属国家：决定落在哪条彩色分支上 */
  countryId: string;
  /** Markdown 详情 */
  detail: string;
  links?: EventLink[];
  tags?: string[];
  time: TimeValue;
  source?: EventSource;
  createdAt: string;
  updatedAt: string;
  /** 软删除（墓碑），含义同 Country.deletedAt */
  deletedAt?: string;
}

/** 写入 localStorage 的数据切片（不含 UI 状态） */
export interface PersistedData {
  version: number;
  countries: Country[];
  events: TimelineEvent[];
}

/** 添加 / 编辑节点的表单载荷 */
export interface EventDraftInput {
  id?: string;
  time: TimeValue;
  countryId: string;
  title: string;
  detail: string;
  links: EventLink[];
  tags: string[];
}
