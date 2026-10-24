import { useEffect, useState } from 'react';
import { COUNTRY_PALETTE, useStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 新建一条国家分支：只填名称、左右位置、颜色；事件之后再加 */
export function BranchForm({ open, onClose }: Props) {
  const { dispatch, addCountry } = useStore();
  const [name, setName] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [color, setColor] = useState(COUNTRY_PALETTE[0]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setSide('right');
    setColor(COUNTRY_PALETTE[0]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    const country = addCountry(trimmed, { side, color });
    onClose();
    dispatch({
      type: 'toast',
      message: `已创建分支「${country.name}」，给它添加第一个事件后就会出现在图上`,
      tone: 'success',
    });
    // 分支没有事件就不会画出来，所以直接接着让用户加第一个事件
    dispatch({ type: 'open-form', form: { kind: 'create', presetCountryId: country.id } });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="添加分支">
      <button type="button" aria-label="取消" className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white p-4 shadow-pop">
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink-900">添加分支</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">
              新建一条国家分支；给它添加第一个事件后，分支就会出现在树状图上。
            </p>
          </div>
          <button type="button" className="btn-quiet btn-xs" onClick={onClose}>
            关闭 ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="field-label" htmlFor="branch-name">
              分支名称 *
            </label>
            <input
              id="branch-name"
              autoFocus
              className="input"
              placeholder="例如：法国 / 印度 / 东盟"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          </div>

          <div>
            <span className="field-label">放在主干哪一侧</span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { value: 'right', label: '右侧' },
                  { value: 'left', label: '左侧' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSide(option.value)}
                  className={`chip cursor-pointer px-2.5 py-1 ring-1 ring-inset ${
                    side === option.value
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-ink-500 ring-ink-200 hover:bg-ink-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              左右只决定分支在主干哪一侧；离主干多远由**第一个事件的时间**决定——越早越靠近主干。
            </p>
          </div>

          <div>
            <span className="field-label">分支颜色</span>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_PALETTE.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`颜色 ${option}`}
                  aria-pressed={color === option}
                  onClick={() => setColor(option)}
                  className={`h-6 w-6 rounded-full ring-offset-1 transition-shadow ${
                    color === option ? 'ring-2 ring-ink-500' : 'ring-1 ring-ink-200'
                  }`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-2.5 py-2">
            <p className="text-[11px] text-ink-400">预览</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              {trimmed || '未命名国家'}
              <span className="text-[11px] text-ink-400">
                （主干{side === 'right' ? '右' : '左'}侧分支）
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn-primary" disabled={!trimmed} onClick={submit}>
            创建并添加第一个事件
          </button>
        </div>
      </div>
    </div>
  );
}
