import { useMemo } from 'react';
import { computeTreeLayout } from '../lib/layout';
import { useStore } from '../store';
import { EmptyState } from './ui';
import { TreeNode } from './TreeNode';

const DATE_LABEL_WIDTH = 104;

/**
 * 树状图主视图（方案1：中国中央主干 + 各国平行彩色分支）。
 * 线条全部画在一层 SVG 上，事件节点是绝对定位的 HTML，便于点击与展开详情。
 */
export function TreeDiagram() {
  const { state, countries, dispatch, requestDeleteCountry } = useStore();
  const layout = useMemo(
    () => computeTreeLayout(state.events, countries),
    [state.events, countries],
  );
  const expanded = state.expandedEventIds;
  const usedBranches = layout.branches;
  // 已经建好、但还没有事件的分支：图上看不见，单独提示一下
  const drawnIds = new Set(layout.branches.map((branch) => branch.country.id));
  const pendingBranches = countries.filter((country) => !country.isMain && !drawnIds.has(country.id));

  if (state.events.length === 0) {
    return (
      <EmptyState>
        还没有任何节点。点右上角「＋ 添加节点」创建第一条事件，它会自动落到对应的时间层与国家分支上。
      </EmptyState>
    );
  }

  return (
    <section className="w-full">
      {/* 图例 */}
      <div className="mb-3 rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-ink-500">
            {usedBranches.map((branch) => (
              <li key={branch.country.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-full"
                  style={{
                    backgroundColor: branch.color,
                    width: branch.isMain ? 18 : 14,
                    height: branch.isMain ? 4 : 3,
                  }}
                />
                <span className={branch.isMain ? 'font-semibold text-ink-700' : ''}>{branch.country.name}</span>
                {branch.isMain ? (
                  <span className="text-ink-400">（主干）</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestDeleteCountry(branch.country.id)}
                    title={`删除分支「${branch.country.name}」`}
                    aria-label={`删除分支 ${branch.country.name}`}
                    className="rounded px-1 text-[11px] leading-4 text-ink-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <p className="hidden text-[11px] text-ink-400 sm:block">
              同一水平线＝同一时间 · 同一颜色分支＝同一国家 · 纵向按真实时间比例
            </p>
            <button type="button" className="btn-ghost btn-xs" onClick={() => dispatch({ type: 'collapse-all' })}>
              收起全部详情
            </button>
          </div>
        </div>
        {pendingBranches.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-ink-100 pt-1.5 text-[11px] text-ink-400">
            <span>已有分支、还没有事件（所以图上暂时看不到）：</span>
            {pendingBranches.map((country) => (
              <span key={country.id} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full border border-dashed"
                  style={{ borderColor: country.color }}
                />
                {country.name}
                <button
                  type="button"
                  onClick={() => requestDeleteCountry(country.id)}
                  title={`删除分支「${country.name}」`}
                  aria-label={`删除分支 ${country.name}`}
                  className="rounded px-1 text-[11px] leading-4 text-ink-300 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
          <svg
            className="absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {/* 时间层水平参考线：让「同一时间在同一水平线」看得见 */}
            {layout.levels.map((level) => (
              <line
                key={`level-${level.key}`}
                x1={layout.railLeftX - 24}
                y1={level.y}
                x2={layout.railRightX + 24}
                y2={level.y}
                stroke="#cbd5e1"
                strokeWidth={1}
                strokeDasharray="2 6"
              />
            ))}

            {/* 分支接入父分支的平滑曲线：像岔路一样长出来，不是一条平行线 */}
            {layout.ramps.map((ramp) => (
              <path
                key={`ramp-${ramp.childId}`}
                d={ramp.d}
                fill="none"
                stroke={ramp.color}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.85}
              />
            ))}

            {/* 分支轨道：同一国家的事件都落在这条线上（只有一个事件的分支没有轨道，靠曲线表示归属） */}
            {layout.branches
              .filter((branch) => branch.yBottom - branch.yTop > 0.5)
              .map((branch) => (
                <line
                  key={`branch-${branch.country.id}`}
                  x1={branch.x}
                  y1={branch.yTop}
                  x2={branch.x}
                  y2={branch.yBottom}
                  stroke={branch.color}
                  strokeWidth={branch.isMain ? 4 : 2}
                  strokeLinecap="round"
                  opacity={branch.isMain ? 0.95 : 0.7}
                />
              ))}

            {/* 节点圆点 */}
            {layout.nodes.map((node) => (
              <circle
                key={`dot-${node.event.id}`}
                cx={node.x}
                cy={node.y}
                r={node.isMain ? 7 : 5.5}
                fill={node.color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </svg>

          {/* 时间层日期标签（左侧时间轴） */}
          {layout.levels.map((level) => (
            <div
              key={`label-${level.key}`}
              className="absolute text-right text-[11px] font-semibold leading-4 text-ink-400"
              style={{
                left: 4,
                width: DATE_LABEL_WIDTH,
                top: level.y,
                transform: 'translateY(-50%)',
              }}
            >
              {level.label}
            </div>
          ))}

          {/* 事件节点 */}
          {layout.nodes.map((node) => (
            <TreeNode
              key={node.event.id}
              node={node}
              expanded={expanded.includes(node.event.id)}
              layoutWidth={layout.width}
              layoutHeight={layout.height}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
