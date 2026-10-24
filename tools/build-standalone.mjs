/**
 * 把已构建的 dist/ 打包成「双击即可打开」的单文件页面，给没有装 Node 的电脑课堂演示用。
 *
 *   npm run build:standalone        →  一步到位（推荐）
 *   # 等价于：vite build --mode standalone && node tools/build-standalone.mjs
 *
 * 单机版**不带 Liveblocks key**：走 localStorage 单机模式，不联网。
 * 之所以用 `--mode standalone`，是因为它会加载 `.env.standalone`，
 * 把 `.env.local` 里的真 key 覆盖成空值。
 *
 * 原理：Vite 产物只有一个 JS chunk、没有外部 import，把 JS 与 CSS 以「内联」方式
 * 写进同一个 HTML，浏览器就不会再走 file:// 的模块加载限制。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const assetDir = join(distDir, 'assets');

if (!existsSync(assetDir)) {
  console.error('找不到 dist/assets，请先运行 npm run build:standalone');
  process.exit(1);
}

const files = readdirSync(assetDir);
const jsFile = files.filter((f) => f.endsWith('.js')).sort();
const cssFile = files.filter((f) => f.endsWith('.css')).sort();
if (jsFile.length !== 1 || cssFile.length < 1) {
  console.error(`期望 dist/assets 里只有 1 个 js（当前 ${jsFile.length} 个）：${jsFile.join(', ')}`);
  console.error('如果改过 vite.config 产生多个分包，请把 base 设为 ./ 后直接托管 dist/ 目录。');
  process.exit(1);
}

// 内联文本里出现 </script 会提前结束标签，统一转义；JS 里的 /* 与 <!-- 同理
const js = readFileSync(join(assetDir, jsFile[0]), 'utf8')
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
const css = readFileSync(join(assetDir, cssFile[0]), 'utf8').replace(/<\/style/gi, '<\\/style');

// 单机版不该带 Liveblocks key：带了会从 file:// 去连服务器（连不上），也没必要外泄
if (/pk_(dev|prod|test|stag)_[A-Za-z0-9]{8,}/.test(js)) {
  console.error('构建产物里含 Liveblocks public key，单机演示版不应该联网。');
  console.error('请改用：npm run build:standalone（它会以 --mode standalone 把 key 置空后重新构建）');
  process.exit(1);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  .replace(/<link[^>]+rel="stylesheet"[^>]*>/i, () => `<style>${css}</style>`)
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/i, () => `<script type="module">${js}</script>`);

const out = join(root, 'demo-standalone.html');
writeFileSync(out, html, 'utf8');
console.log(`已生成 ${out}（约 ${(html.length / 1024).toFixed(0)} KB，单机模式）`);
