import { useMemo, useState } from 'react';
import type { Country } from '../types';
import { useStore } from '../store';

interface Props {
  value: string;
  onChange: (country: Country) => void;
  error?: string;
}

/** 国家选择器：必填、单选、可搜索、可新建；决定事件落在哪条分支上 */
export function CountrySelect({ value, onChange, error }: Props) {
  const { countries, addCountry } = useStore();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const selected = countries.find((country) => country.id === value);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const list = q
      ? countries.filter(
          (country) => country.name.toLowerCase().includes(q) || country.id.toLowerCase().includes(q),
        )
      : countries;
    return [...list].sort((a, b) => a.order - b.order);
  }, [countries, keyword]);

  const pick = (country: Country) => {
    onChange(country);
    setOpen(false);
    setKeyword('');
    setCreating(false);
  };

  const submitNew = () => {
    if (!newName.trim()) return;
    const country = addCountry(newName);
    pick(country);
    setNewName('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={`input flex items-center justify-between text-left ${error ? 'border-red-300' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'text-ink-900' : 'text-ink-400'}>
          {selected ? (
            <>
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ backgroundColor: selected.color }}
              />
              {selected.name}
              {selected.isMain ? <span className="ml-1.5 text-[11px] text-ink-400">主干</span> : null}
            </>
          ) : (
            '选择国家（必填，单选）'
          )}
        </span>
        <span aria-hidden className="ml-2 text-ink-400">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭国家列表"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white p-2 shadow-pop">
            <input
              autoFocus
              className="input mb-2"
              placeholder="搜索国家，如 美国 / world"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />

            {creating ? (
              <div className="mb-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 p-2">
                <input
                  className="input mb-2"
                  placeholder="国家名称，如 法国"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <div className="flex gap-1.5">
                  <button type="button" className="btn-primary btn-xs" onClick={submitNew}>
                    添加并使用
                  </button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setCreating(false)}>
                    取消
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-400">新国家会自动分配一种分支颜色。</p>
              </div>
            ) : null}

            <ul>
              {filtered.map((country) => (
                <li key={country.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-50 ${
                      country.id === value ? 'bg-ink-100 font-semibold' : ''
                    }`}
                    onClick={() => pick(country)}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: country.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    {country.isMain ? <span className="text-[11px] text-ink-400">主干</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length === 0 && !creating ? (
              <p className="px-2 py-3 text-center text-sm text-ink-400">没有匹配的国家</p>
            ) : null}

            {!creating ? (
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-dashed border-ink-300 px-2 py-1.5 text-sm text-ink-500 hover:bg-ink-50"
                onClick={() => setCreating(true)}
              >
                ＋ 新建国家分支
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
