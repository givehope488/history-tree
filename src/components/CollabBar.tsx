import { useEffect, useMemo, useState } from 'react';
import { useOthers, useSelf, useStatus, useUpdateMyPresence } from '@liveblocks/react';
import { useStore } from '../store';

/* ================================================================== *
 * 协同条：昵称、在线成员、「谁正在编辑」、分享链接、清空口令
 * 只在配了 Liveblocks key（协同模式）时才会挂载——里面用了 Liveblocks 的
 * hooks，必须待在 RoomProvider 里面。
 * ================================================================== */

const NICKNAME_KEY = 'ch10-history-tree:nickname';

function loadNickname(): string {
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNickname(name: string): void {
  try {
    window.localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    /* 隐私模式下忽略：本次会话内仍然有效 */
  }
}

/** 昵称首字，用作头像 */
function initial(name: string | null, fallback: string): string {
  const text = (name ?? '').trim();
  return text ? Array.from(text)[0] : fallback;
}

/* ------------------------------ 昵称弹窗 ------------------------------ */

function NicknameDialog({ current, onDone }: { current: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(current);
  const submit = () => {
    const name = value.trim() || '匿名同学';
    saveNickname(name);
    onDone(name);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/40" />
      <div className="relative w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-4 shadow-pop">
        <h2 className="text-base font-bold text-ink-900">{current ? '改个名字' : '先取个名字'}</h2>
        <p className="mt-1.5 text-sm leading-6 text-ink-600">
          别人会看到这个名字，用来分辨是谁在改。只存在你自己的浏览器里，随时可以重填。
        </p>
        <input
          autoFocus
          className="input mt-3"
          placeholder="例如：张三"
          maxLength={12}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onDone(current || '匿名同学')}>
            {current ? '取消' : '先用默认名'}
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {current ? '保存' : '开始协同'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 口令设置 ------------------------------ */

function PassDialog({ onClose }: { onClose: () => void }) {
  const { hasClearPass, setClearPass, dispatch } = useStore();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await setClearPass(value);
    setBusy(false);
    dispatch({
      type: 'toast',
      message: value.trim() ? '已设置清空口令：清空整块板子 / 导入覆盖前需要输入' : '已取消清空口令',
      tone: 'success',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white p-4 shadow-pop">
        <h2 className="text-base font-bold text-ink-900">{hasClearPass ? '修改 / 取消清空口令' : '设置清空口令'}</h2>
        <p className="mt-1.5 text-sm leading-6 text-ink-600">
          设了之后，「恢复初始数据」和「导入 JSON 覆盖」都要先输口令，防止有人手滑把整块板子清掉。
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] leading-5 text-amber-800">
          说明白一点：这道口令只是防误操作，<strong>不是真正的安全防护</strong>——校验在前端做，懂技术的人绕得过去。别用它保护重要内容，重要内容请随时导出 JSON 备份。
        </p>
        <label className="field-label mt-3" htmlFor="pass-input">
          {hasClearPass ? '输入新口令（留空表示取消口令）' : '设置一个口令'}
        </label>
        <input
          id="pass-input"
          type="password"
          autoFocus
          className="input mt-1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- 协同条 ------------------------------- */

export function CollabBar() {
  const { state, collaborative, shareUrl, hasClearPass, roomId, startNewRoom } = useStore();
  const self = useSelf();
  const others = useOthers();
  const status = useStatus();
  const updatePresence = useUpdateMyPresence();

  const [nickname, setNickname] = useState(() => loadNickname());
  const [renaming, setRenaming] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [confirmNewRoom, setConfirmNewRoom] = useState(false);

  // 昵称变了就同步给房间里其他人
  useEffect(() => {
    if (!nickname) return;
    updatePresence({ nickname });
  }, [nickname, updatePresence]);

  // 正在编辑哪个节点也同步出去，别人能看到「xx 正在编辑」
  const editingEventId = state.form?.kind === 'edit' ? state.form.eventId : null;
  useEffect(() => {
    updatePresence({ editingEventId });
  }, [editingEventId, updatePresence]);

  const editingTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of state.events) map.set(event.id, event.title || '未命名事件');
    return map;
  }, [state.events]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('复制这个链接发给同学：', shareUrl);
    }
  };

  const onlineCount = others.length + 1;
  const statusText = status === 'connected' ? '已连接' : status === 'connecting' ? '连接中…' : '已断开，正在重连';

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowMembers((prev) => !prev)}
          title={`${onlineCount} 人在线 · ${statusText}`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={
                status === 'connected'
                  ? 'inline-block h-2 w-2 rounded-full bg-emerald-500'
                  : 'inline-block h-2 w-2 rounded-full bg-amber-500'
              }
            />
            在线 {onlineCount}
          </span>
        </button>

        <button type="button" className="btn-ghost" onClick={() => void copyLink()}>
          {copied ? '已复制 ✓' : '复制链接'}
        </button>

        {showMembers ? (
          <>
            <button
              type="button"
              aria-label="关闭成员列表"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setShowMembers(false)}
            />
            <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-ink-200 bg-white p-2 shadow-pop">
              <p className="px-1 pb-1.5 text-[11px] text-ink-400">
                {statusText} · 房间 <span className="font-mono text-ink-500">{roomId.slice(0, 8)}</span>
              </p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: self?.presence.color ?? '#2563eb' }}
                  >
                    {initial(nickname, '我')}
                  </span>
                  <span className="truncate font-medium text-ink-900">{nickname || '我'}</span>
                  <span className="ml-auto text-[11px] text-ink-400">我</span>
                </li>
                {others.map((other) => {
                  const editing = other.presence.editingEventId;
                  return (
                    <li key={other.connectionId} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: other.presence.color ?? '#64748b' }}
                      >
                        {initial(other.presence.nickname, '?')}
                      </span>
                      <span className="truncate text-ink-800">{other.presence.nickname || '匿名同学'}</span>
                      {editing ? (
                        <span className="ml-auto shrink-0 truncate text-[11px] text-amber-700" title={editingTitles.get(editing)}>
                          正在编辑
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="mt-1 w-full rounded-lg border-t border-ink-100 px-1.5 pt-2 pb-1 text-left text-sm text-ink-700 hover:bg-ink-50"
                onClick={() => {
                  setShowMembers(false);
                  setRenaming(true);
                }}
              >
                改我的昵称…
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-1.5 py-1 text-left text-sm text-ink-700 hover:bg-ink-50"
                onClick={() => {
                  setShowMembers(false);
                  setShowPass(true);
                }}
              >
                {hasClearPass ? '修改 / 取消清空口令' : '设置清空口令…'}
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-1.5 py-1 text-left text-sm text-ink-700 hover:bg-ink-50"
                onClick={() => {
                  setShowMembers(false);
                  setConfirmNewRoom(true);
                }}
              >
                新建房间（复制当前内容）
              </button>
              <p className="mt-1 border-t border-ink-100 px-1.5 pt-1.5 text-[11px] leading-4 text-ink-400">
                数据保存在这个房间里，重开页面会回到同一个房间。换电脑或换浏览器请用「复制链接」。
              </p>
            </div>
          </>
        ) : null}
      </div>

      {collaborative && (!nickname || renaming) ? (
        <NicknameDialog
          current={renaming ? nickname : ''}
          onDone={(name) => {
            setNickname(name);
            setRenaming(false);
          }}
        />
      ) : null}
      {showPass ? <PassDialog onClose={() => setShowPass(false)} /> : null}
      {confirmNewRoom ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true">
          <button type="button" aria-label="取消" className="absolute inset-0 bg-ink-900/40" onClick={() => setConfirmNewRoom(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-ink-200 bg-white p-4 shadow-pop">
            <h2 className="text-base font-bold text-ink-900">新建一个房间？</h2>
            <p className="mt-1.5 text-sm leading-6 text-ink-600">
              会开一个新房间，并<strong>把当前这块板子的内容复制过去</strong>
              （当前房间的内容仍然保留，用现在的链接还能回去）。页面会刷新一次。
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmNewRoom(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setConfirmNewRoom(false);
                  startNewRoom();
                }}
              >
                新建房间
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
