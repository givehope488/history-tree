import { useRef, useState } from 'react';
import { useStore } from '../store';
import { DATA_VERSION, downloadJson, parseImportedData, readFileAsText, serializeData } from '../lib/storage';
import { BranchForm } from './BranchForm';
import { CollabBar } from './CollabBar';

function DataMenu() {
  const { state, dispatch, requestResetData, requestImportData, collaborative } = useStore();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(
      `历史树状图-${stamp}.json`,
      serializeData({ version: DATA_VERSION, countries: state.countries, events: state.events }),
    );
    dispatch({ type: 'toast', message: '已导出 JSON 文件', tone: 'success' });
    setOpen(false);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = parseImportedData(text);
      if (!result.ok) {
        dispatch({ type: 'toast', message: result.error, tone: 'error' });
        return;
      }
      // 导入会覆盖所有人的数据，所以走带口令的确认流程
      requestImportData(result.data);
    } catch {
      dispatch({ type: 'toast', message: '导入失败，请选择本应用导出的 JSON 文件', tone: 'error' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" className="btn-ghost" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        数据 <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭数据菜单"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop">
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-50"
              onClick={exportJson}
            >
              导出 JSON（含全部节点与国家）
            </button>
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-50"
              onClick={() => fileRef.current?.click()}
            >
              导入 JSON（覆盖当前数据）
            </button>
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                requestResetData();
              }}
            >
              恢复初始数据
            </button>
            <p className="mt-1 border-t border-ink-100 px-2 pt-1.5 text-[11px] leading-4 text-ink-400">
              {collaborative
                ? '数据实时同步给同一链接里的所有人；建议定期导出 JSON 备份。'
                : '数据保存在本机浏览器 localStorage，刷新不丢；换设备请先导出再导入。'}
            </p>
          </div>
        </>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void importJson(event.target.files?.[0])}
      />
    </div>
  );
}

export function TopBar() {
  const { state, dispatch, collaborative } = useStore();
  const [branchOpen, setBranchOpen] = useState(false);
  const branchCount = state.countries.filter((country) => !country.isMain).length;

  return (
    <header className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-8">
        <div className="mr-auto min-w-0">
          <h1 className="truncate font-serif text-[17px] font-bold leading-6 text-ink-900 lg:text-lg">
            中国现代史（2012 至今）
          </h1>
          <p className="truncate text-[11px] leading-4 text-ink-500">
            《中国近现代史纲要》第十章 · 树状图 · {state.events.length} 个事件节点 · {branchCount} 条国家分支
            {collaborative ? ' · 多人协同中' : ''}
          </p>
        </div>

        <div className="relative flex items-center gap-1.5">
          {collaborative ? <CollabBar /> : null}
          <button type="button" className="btn-ghost" onClick={() => setBranchOpen(true)}>
            ＋ 添加分支
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => dispatch({ type: 'open-form', form: { kind: 'create' } })}
          >
            ＋ 添加节点
          </button>
          <DataMenu />
        </div>
      </div>

      <BranchForm open={branchOpen} onClose={() => setBranchOpen(false)} />
    </header>
  );
}
