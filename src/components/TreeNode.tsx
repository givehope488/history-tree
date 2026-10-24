import type { NodeLayout } from '../lib/layout';
import { renderMarkdown } from '../lib/markdown';
import { formatDisplay } from '../lib/time';
import { useStore } from '../store';
import { CountryBadge, SourceBadge, TagList } from './ui';

interface Props {
  node: NodeLayout;
  expanded: boolean;
  /** 图形总宽度，用于把详情卡夹在可视范围内 */
  layoutWidth: number;
  /** 图形总高度，用于决定详情卡向上还是向下展开 */
  layoutHeight: number;
}

const CARD_WIDTH = 384;

/**
 * 一个事件节点：默认只显示极简概述（节点胶囊），点击后在节点旁展开详情卡。
 * 节点落在「本国分支」与「本时间层」的交叉点上，位置由布局引擎算好。
 */
export function TreeNode({ node, expanded, layoutWidth, layoutHeight }: Props) {
  const { state, dispatch, requestDeleteEvent } = useStore();
  const { event, side, isMain, color } = node;

  const chipTransform =
    side === 'center'
      ? 'translate(-50%, -50%)'
      : side === 'right'
        ? 'translate(14px, -50%)'
        : 'translate(calc(-100% - 14px), -50%)';

  // 详情卡横向居中在节点上，并夹进可视范围；靠近底部时向上展开
  const half = CARD_WIDTH / 2;
  const clampedX = Math.min(Math.max(node.x, half + 8), Math.max(layoutWidth - half - 8, half + 8));
  const dx = clampedX - node.x;
  const flipUp = node.y > layoutHeight * 0.6;
  const cardTransform = `translate(calc(-50% + ${dx}px), ${flipUp ? 'calc(-100% - 18px)' : '18px'})`;

  const links = (event.links ?? []).filter((link) => link.url.trim() !== '');
  const editing = state.form?.kind === 'edit' && state.form.eventId === event.id;

  return (
    <div className="absolute" style={{ left: node.x, top: node.y, width: 0, height: 0 }}>
      <button
        type="button"
        aria-expanded={expanded}
        title={event.title || '（未命名事件）'}
        onClick={() => dispatch({ type: 'toggle-event', eventId: event.id })}
        style={{
          transform: chipTransform,
          width: isMain ? 200 : 160,
          borderColor: color,
        }}
        className={`absolute z-20 block rounded-lg border bg-white/95 px-2 py-1 text-left shadow-card no-tap-highlight transition-shadow hover:z-30 hover:shadow-pop ${
          isMain ? 'border-2' : 'border'
        } ${expanded ? 'ring-2 ring-amber-300' : ''} ${editing ? 'ring-2 ring-brand-300' : ''}`}
      >
        <span className="flex items-start gap-1.5">
          <span
            className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className={`line-clamp-2 text-[12.5px] leading-[17px] ${
              isMain ? 'font-semibold text-ink-900' : 'text-ink-700'
            }`}
          >
            {event.title || '（未命名事件）'}
          </span>
        </span>
      </button>

      {expanded ? (
        <div
          style={{ transform: cardTransform, width: CARD_WIDTH }}
          className="absolute z-40 max-h-[56vh] overflow-y-auto overscroll-contain rounded-xl border border-ink-200 bg-white p-3 text-left shadow-pop animate-fade-slide-in"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <SourceBadge source={event.source} />
            <CountryBadge country={node.country} />
            <span className="text-[11px] font-medium text-ink-400">{formatDisplay(event.time)}</span>
            <button
              type="button"
              className="ml-auto text-[11px] text-ink-400 underline decoration-dotted hover:text-ink-700"
              onClick={() => dispatch({ type: 'toggle-event', eventId: event.id })}
            >
              收起
            </button>
          </div>

          <h3 className="text-sm font-bold leading-6 text-ink-900">{event.title || '（未命名事件）'}</h3>

          {event.detail.trim() ? (
            <div className="md-body mt-2">{renderMarkdown(event.detail)}</div>
          ) : (
            <p className="mt-2 text-sm italic text-ink-400">这个节点还没有详情，点「编辑」补充。</p>
          )}

          {links.length > 0 ? (
            <div className="mt-3 border-t border-dashed border-ink-200 pt-2">
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-400">相关链接</p>
              <ul className="space-y-1">
                {links.map((link, index) => (
                  <li key={`${link.url}-${index}`} className="truncate text-sm">
                    <a
                      className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {link.label?.trim() || link.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-2">
            <TagList tags={event.tags} />
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={() => dispatch({ type: 'open-form', form: { kind: 'edit', eventId: event.id } })}
              >
                编辑
              </button>
              <button type="button" className="btn-danger btn-xs" onClick={() => requestDeleteEvent(event)}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
