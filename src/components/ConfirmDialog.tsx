import { useEffect, useState } from 'react';
import { useStore } from '../store';

export function ConfirmDialog() {
  const { state, dispatch, checkClearPass } = useStore();
  const request = state.confirm;
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 每换一个确认框就把输入清空，避免把上一次的口令留在框里
  useEffect(() => {
    setPass('');
    setError('');
    setBusy(false);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'resolve-confirm', run: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, dispatch]);

  if (!request) return null;

  const cancel = () => dispatch({ type: 'resolve-confirm', run: false });

  const confirm = async () => {
    if (request.requirePass) {
      setBusy(true);
      const ok = await checkClearPass(pass);
      setBusy(false);
      if (!ok) {
        setError('口令不对。这道口令只用来防手滑，忘了可以清掉浏览器数据重新开始。');
        return;
      }
    }
    dispatch({ type: 'resolve-confirm', run: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true">
      <button type="button" aria-label="取消" className="absolute inset-0 bg-ink-900/40" onClick={cancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white p-4 shadow-pop">
        <h2 className="text-base font-bold text-ink-900">{request.title}</h2>
        {request.description ? (
          <p className="mt-1.5 text-sm leading-6 text-ink-600">{request.description}</p>
        ) : null}

        {request.requirePass ? (
          <div className="mt-3">
            <label className="field-label" htmlFor="clear-pass">
              请输入清空口令
            </label>
            <input
              id="clear-pass"
              type="password"
              autoFocus
              className="input mt-1"
              value={pass}
              onChange={(event) => {
                setPass(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirm();
              }}
            />
            {error ? <p className="mt-1.5 text-[12px] leading-5 text-red-700">{error}</p> : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={cancel}>
            {request.cancelLabel ?? '取消'}
          </button>
          <button
            type="button"
            disabled={busy}
            className={
              request.tone === 'danger'
                ? 'btn-danger disabled:opacity-60'
                : 'btn-primary disabled:opacity-60'
            }
            onClick={() => void confirm()}
          >
            {request.confirmLabel ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
