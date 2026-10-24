import { useState } from 'react';
import type { EventDraftInput, EventLink, TimePrecision, TimeValue } from '../types';
import { useStore, validateEventSubmission, type EventField, type ValidationErrors } from '../store';
import type { FormState } from '../store';
import { formatDisplay, parseDateParts, toDateInputValue } from '../lib/time';
import { renderMarkdown } from '../lib/markdown';
import { CountrySelect } from './CountrySelect';

interface Props {
  form: Exclude<FormState, null>;
  variant: 'inline' | 'overlay';
}

interface FormValues {
  timeStart: string;
  timeEnd: string;
  precision: TimePrecision;
  display: string;
  countryId: string;
  title: string;
  detail: string;
  links: EventLink[];
  tags: string;
}

const PRECISION_OPTIONS: { value: TimePrecision; label: string }[] = [
  { value: 'year', label: '年' },
  { value: 'month', label: '年月' },
  { value: 'day', label: '年月日' },
  { value: 'range', label: '区间' },
];

function derivePrecision(start: string, current: TimePrecision): TimePrecision {
  if (current === 'range') return 'range';
  const parts = parseDateParts(start);
  return parts ? parts.precision : current;
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,，;；\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/**
 * 对比基准值，算出这次到底改了哪些字段。
 * 协同时这一步很重要：只把改过的字段写回共享文档，
 * 别人同时在改的其他字段才不会被我们表单里的旧值覆盖掉。
 */
function changedFields(baseline: FormValues, values: FormValues): EventField[] {
  const changed: EventField[] = [];
  const timeChanged =
    baseline.timeStart !== values.timeStart ||
    baseline.timeEnd !== values.timeEnd ||
    baseline.precision !== values.precision ||
    baseline.display !== values.display;
  if (timeChanged) changed.push('time');
  if (baseline.countryId !== values.countryId) changed.push('countryId');
  if (baseline.title !== values.title) changed.push('title');
  if (baseline.detail !== values.detail) changed.push('detail');
  if (JSON.stringify(baseline.links) !== JSON.stringify(values.links)) changed.push('links');
  if (baseline.tags !== values.tags) changed.push('tags');
  return changed;
}

/** 添加 / 编辑节点表单：桌面端浮层，移动端底部抽屉 */
export function EventForm({ form, variant }: Props) {
  const { state, dispatch, countryById } = useStore();

  const editing = form.kind === 'edit' ? state.events.find((event) => event.id === form.eventId) : undefined;

  const initial: FormValues = {
    timeStart: editing?.time.start ?? '',
    timeEnd: editing?.time.end ?? '',
    precision: editing?.time.precision ?? 'day',
    display: editing?.time.display ?? '',
    countryId: editing?.countryId ?? (form.kind === 'create' ? form.presetCountryId ?? '' : ''),
    title: editing?.title ?? '',
    detail: editing?.detail ?? '',
    links: (editing?.links ?? []).map((link) => ({ ...link })),
    tags: (editing?.tags ?? []).join(' '),
  };

  // 基准值只在打开表单那一刻取一次。
  // 如果跟着 store 实时走，别人改了同一个节点，我们这边的「有未保存修改」会莫名亮起，
  // 而且提交时会分不清哪些字段是自己改的、哪些是别人改的。
  const [baseline] = useState<FormValues>(initial);
  const [values, setValues] = useState<FormValues>(baseline);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  const patch = (part: Partial<FormValues>) => setValues((prev) => ({ ...prev, ...part }));

  const time: TimeValue = {
    start: values.timeStart.trim(),
    end: values.precision === 'range' ? values.timeEnd.trim() || undefined : undefined,
    display: values.display.trim(),
    precision: values.precision,
  };

  const previewCountry = countryById(values.countryId);
  const previewText = previewCountry
    ? previewCountry.isMain
      ? `将落在中央主干「${previewCountry.name}」上`
      : `将落在「${previewCountry.name}」分支上`
    : '选择国家后决定落在哪条分支上';

  const close = () => {
    if (!dirty) {
      dispatch({ type: 'close-form' });
      return;
    }
    dispatch({
      type: 'ask-confirm',
      request: {
        title: '放弃未保存的修改？',
        description: '表单里还有没有保存的内容，关闭后这些修改会丢失。',
        confirmLabel: '放弃修改',
        cancelLabel: '继续编辑',
        tone: 'danger',
        action: { type: 'close-form' },
      },
    });
  };

  const submit = () => {
    const check = validateEventSubmission({ time, countryId: values.countryId, title: values.title });
    setErrors(check.errors);
    if (!check.ok) return;
    const input: EventDraftInput = {
      id: editing?.id,
      time,
      countryId: values.countryId,
      title: values.title,
      detail: values.detail,
      links: values.links,
      tags: splitTags(values.tags),
    };
    dispatch({ type: 'save-event', input, changed: changedFields(baseline, values) });
  };

  const isRange = values.precision === 'range';

  const body = (
    <div className={variant === 'inline' ? 'panel-card p-3' : 'p-4'}>
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-900">{editing ? '编辑节点' : '添加节点'}</h3>
          <p className="mt-0.5 text-[11px] text-ink-400">
            时间、国家、标题为必填；保存后节点会自动落到对应的时间层与分支上。
          </p>
        </div>
        <button type="button" className="btn-quiet btn-xs" onClick={close}>
          收起 ✕
        </button>
      </div>

      <div className="space-y-3">
        {/* 时间 */}
        <div>
          <label className="field-label" htmlFor="event-time">
            时间 *
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[150px] flex-1">
              <input
                id="event-time"
                className={`input ${errors.time ? 'border-red-300' : ''}`}
                placeholder="2012-11-08 / 2012-11 / 2012"
                value={values.timeStart}
                onChange={(event) => {
                  const start = event.target.value;
                  patch({ timeStart: start, precision: derivePrecision(start, values.precision), display: '' });
                }}
              />
            </div>
            {isRange ? (
              <div className="min-w-[130px] flex-1">
                <input
                  className="input"
                  placeholder="结束，如 2013-03"
                  value={values.timeEnd}
                  onChange={(event) => patch({ timeEnd: event.target.value, display: '' })}
                />
              </div>
            ) : null}
            <select
              className="input w-auto"
              value={values.precision}
              onChange={(event) => patch({ precision: event.target.value as TimePrecision, display: '' })}
              aria-label="时间精度"
            >
              {PRECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input w-auto"
              value={toDateInputValue(time)}
              onChange={(event) => {
                if (!event.target.value) return;
                patch({ timeStart: event.target.value, precision: 'day', display: '' });
              }}
              aria-label="从日历选择日期"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-400">
              显示为：{values.timeStart ? formatDisplay(time) || '（无法识别）' : '—'}
            </span>
          </div>
          {errors.time ? <p className="mt-1 text-xs text-red-600">{errors.time}</p> : null}
        </div>

        {/* 国家 */}
        <div>
          <label className="field-label">国家 *（单选，决定所在分支）</label>
          <CountrySelect
            value={values.countryId}
            error={errors.countryId}
            onChange={(country) => patch({ countryId: country.id })}
          />
          <p className="mt-1 text-[11px] text-ink-400">{previewText}</p>
        </div>

        {/* 标题 */}
        <div>
          <label className="field-label" htmlFor="event-title">
            事件概述 *（节点上显示的极简文字）
          </label>
          <input
            id="event-title"
            className={`input ${errors.title ? 'border-red-300' : ''}`}
            placeholder="例如：提出共建“一带一路”倡议"
            value={values.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
          {errors.title ? <p className="mt-1 text-xs text-red-600">{errors.title}</p> : null}
        </div>

        {/* 详情 */}
        <div>
          <label className="field-label" htmlFor="event-detail">
            详情（支持 Markdown：## 标题、- 列表、**加粗**、[链接](https://…)）
          </label>
          <textarea
            id="event-detail"
            className="input min-h-[120px] font-mono text-[13px] leading-6"
            placeholder="用 2～4 句话说清：发生了什么、关键时间/数据、为什么重要。"
            value={values.detail}
            onChange={(event) => patch({ detail: event.target.value })}
          />
          {values.detail.trim() ? (
            <details className="mt-1 rounded-lg border border-ink-200 bg-ink-50 p-2">
              <summary className="cursor-pointer text-[11px] font-medium text-ink-500">预览渲染效果</summary>
              <div className="md-body mt-2 border-t border-ink-200 pt-2">{renderMarkdown(values.detail)}</div>
            </details>
          ) : null}
        </div>

        {/* 相关链接 */}
        <div>
          <label className="field-label">相关链接（可选，不支持图片）</label>
          <ul className="space-y-1.5">
            {values.links.map((link, index) => (
              <li key={index} className="flex flex-wrap items-center gap-1.5">
                <input
                  className="input w-28 flex-none"
                  placeholder="名称"
                  value={link.label}
                  onChange={(event) =>
                    patch({
                      links: values.links.map((item, i) =>
                        i === index ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  className="input min-w-[160px] flex-1"
                  placeholder="https://…"
                  value={link.url}
                  onChange={(event) =>
                    patch({
                      links: values.links.map((item, i) =>
                        i === index ? { ...item, url: event.target.value } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn-quiet btn-xs"
                  aria-label="删除该链接"
                  onClick={() => patch({ links: values.links.filter((_, i) => i !== index) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost btn-xs mt-1.5"
            onClick={() => patch({ links: [...values.links, { label: '', url: '' }] })}
          >
            ＋ 添加链接
          </button>
        </div>

        {/* 标签 */}
        <div>
          <label className="field-label" htmlFor="event-tags">
            标签（空格或逗号分隔）
          </label>
          <input
            id="event-tags"
            className="input"
            placeholder="一带一路 对外开放"
            value={values.tags}
            onChange={(event) => patch({ tags: event.target.value })}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
        <button type="button" className="btn-primary" onClick={submit}>
          {editing ? '保存修改' : '添加节点'}
        </button>
        <button type="button" className="btn-quiet ml-auto" onClick={close}>
          取消
        </button>
        {dirty ? <span className="text-[11px] text-amber-600">● 有未保存的修改</span> : null}
      </div>
    </div>
  );

  if (variant === 'inline') return body;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={editing ? '编辑节点' : '添加节点'}>
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-ink-900/30 backdrop-blur-[1px]" onClick={close} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center lg:items-center">
        <div className="pointer-events-auto max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-pop animate-drawer-in lg:max-h-[88vh] lg:w-[620px] lg:rounded-2xl">
          {body}
        </div>
      </div>
    </div>
  );
}
