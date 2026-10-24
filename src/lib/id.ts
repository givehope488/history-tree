/** 生成不依赖外部库的短 id（时间戳 + 自增 + 随机数，避免同一毫秒内冲突） */
let counter = 0;

function randomPart(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 10);
}

export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${randomPart()}`;
}
