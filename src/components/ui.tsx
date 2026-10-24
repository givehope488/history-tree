import type { ReactNode } from 'react';
import type { Country, TimelineEvent } from '../types';

/* 小型共享 UI 原子：标签、提示条、空状态 */

export function SourceBadge({ source }: { source: TimelineEvent['source'] }) {
  if (!source) return null;
  return source === 'textbook' ? (
    <span className="chip-textbook shrink-0">教材</span>
  ) : (
    <span className="chip-user shrink-0">补充</span>
  );
}

/** 国家标签：颜色与所属分支一致 */
export function CountryBadge({ country }: { country: Country | undefined }) {
  if (!country) return null;
  return (
    <span className="chip-country shrink-0" style={{ color: country.color }}>
      {country.name}
    </span>
  );
}

export function TagList({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="chip-tag">
          #{tag}
        </span>
      ))}
    </div>
  );
}

export function Toast({ message, tone }: { message: string; tone: 'info' | 'success' | 'error' }) {
  const cls =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-ink-200 bg-white text-ink-700';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className={`pointer-events-auto max-w-[92vw] rounded-xl border px-4 py-2.5 text-sm shadow-pop ${cls}`}>
        {message}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-4 py-8 text-center text-sm text-ink-400">
      {children}
    </div>
  );
}
