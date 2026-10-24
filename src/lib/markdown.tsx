import type { ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染（不引入第三方库，输出 React 节点，不使用 innerHTML）。
 * 支持：## / ### 标题、- 无序列表、1. 有序列表、> 引用、--- 分隔线、
 *      **加粗**、*斜体*、`代码`、[文字](链接)。
 * 明确不支持图片（产品规则：不支持图片上传）。
 */

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' };

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HR_RE = /^\s*(-{3,}|\*{3,})\s*$/;

function parseBlocks(src: string): Block[] {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }
    if (HR_RE.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'hr' });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1].length >= 3 ? 3 : 2, text: heading[2].trim() });
      continue;
    }
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push({ kind: 'quote', text: quote[1].trim() });
      continue;
    }
    const ul = UL_RE.exec(line);
    if (ul) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'ul') last.items.push(ul[1].trim());
      else blocks.push({ kind: 'ul', items: [ul[1].trim()] });
      continue;
    }
    const ol = OL_RE.exec(line);
    if (ol) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'ol') last.items.push(ol[2].trim());
      else blocks.push({ kind: 'ol', items: [ol[2].trim()] });
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/** 只允许安全协议，避免 javascript: 等注入 */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)) return `https://${url}`;
  return null;
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-i${(i += 1)}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const url = link ? safeUrl(link[2]) : null;
      if (link && url) {
        nodes.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderMarkdown(src: string): ReactNode {
  const blocks = parseBlocks(src);
  if (blocks.length === 0) return null;
  return blocks.map((block, index) => {
    const key = `b${index}`;
    switch (block.kind) {
      case 'heading':
        return block.level === 2 ? (
          <h2 key={key}>{renderInline(block.text, key)}</h2>
        ) : (
          <h3 key={key}>{renderInline(block.text, key)}</h3>
        );
      case 'paragraph':
        return <p key={key}>{renderInline(block.text, key)}</p>;
      case 'quote':
        return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
      case 'hr':
        return <hr key={key} />;
      case 'ul':
        return (
          <ul key={key}>
            {block.items.map((item, j) => (
              <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={key}>
            {block.items.map((item, j) => (
              <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
            ))}
          </ol>
        );
      default:
        return null;
    }
  });
}

/** 在纯文本里高亮搜索关键词（大小写不敏感） */
export function renderHighlighted(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let hit = lower.indexOf(needle, from);
  let i = 0;
  while (hit >= 0) {
    if (hit > from) out.push(text.slice(from, hit));
    out.push(
      <mark key={`h${(i += 1)}`} className="hit">
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    from = hit + needle.length;
    hit = lower.indexOf(needle, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** 校验 Markdown 里的裸链接是否可安全展示 */
export function isSafeLinkUrl(url: string): boolean {
  return safeUrl(url) !== null;
}

export function normalizeLinkUrl(url: string): string {
  const safe = safeUrl(url);
  return safe ?? url.trim();
}
