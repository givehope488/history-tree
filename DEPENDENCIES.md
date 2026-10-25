# 依赖版本清单

这份清单是**从实际安装好的 `node_modules` 里读出来的**（不是 `package.json` 声明的范围），
对应 README / DEVLOG 里那些「已验证」结论所用的那一套依赖。

最后核对：2026-10-24

## 直接依赖

### 运行依赖（`dependencies`）

| 包 | 声明 | 实际安装 | 用途 |
|---|---|---|---|
| @liveblocks/client | ^3.24.5 | 3.24.5 | Liveblocks 客户端（房间、presence） |
| @liveblocks/react | ^3.24.5 | 3.24.5 | React 绑定（Provider / RoomProvider / hooks） |
| @liveblocks/yjs | ^3.24.5 | 3.24.5 | Yjs 与 Liveblocks 的桥接（`getYjsProviderForRoom`） |
| yjs | ^13.6.33 | 13.6.33 | CRDT 共享文档 |
| react | 18.3.1 | 18.3.1 | 精确锁定 |
| react-dom | 18.3.1 | 18.3.1 | 精确锁定 |

### 开发依赖（`devDependencies`）

| 包 | 声明 | 实际安装 |
|---|---|---|
| @types/react | 18.3.31 | 18.3.31 |
| @types/react-dom | 18.3.7 | 18.3.7 |
| @vitejs/plugin-react | 4.7.0 | 4.7.0 |
| autoprefixer | 10.6.1 | 10.6.1 |
| postcss | 8.5.31 | 8.5.31 |
| tailwindcss | 3.4.19 | 3.4.19 |
| typescript | 5.9.3 | 5.9.3 |
| vite | 6.4.5 | 6.4.5 |

> **为什么是 Vite 6 而不是最新的 8**：Cloudflare Pages 的自动配置要求 Vite ≥ 6.0.0
> （用 5.4.21 会直接报 `cannot be automatically configured`）。
> 而 `@vitejs/plugin-react@4.7.0` 的 peer 范围是 `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`，
> **支持 6 和 7 但不支持 8**——升到 Vite 8 就得把 plugin-react 升到 6.x，
> 那会额外引入 `oxc-transform-react`、`@rolldown/plugin-babel`、`babel-plugin-react-compiler`。
> Vite 6 的 Node 要求（`^18 || ^20 || >=22`）也最宽松，对构建机的 Node 版本最不挑。

> 协同相关的几个包（`@liveblocks/*`、`yjs`）用的是 `^` 范围，其余都是精确版本。
> 如果要做可复现的构建，优先依赖下面的 `package-lock.json`，而不是这张表。

## lockfile

项目里**有 `package-lock.json`**（约 68 KB），它才是「装到完全一样的依赖」的权威依据。

```bash
npm ci        # 按 lockfile 精确安装（推荐给接手人）
```

注意：`package.json` 里的精确版本只锁住依赖树的**第一层**；
传递依赖（例如 `vite` 内部的 `esbuild 0.21.5`、`rollup 4.65.0`）由 lockfile 锁定。

## 当前 `node_modules` 规模

- **141 个包**（扁平结构，无嵌套副本）
- 直接依赖 14 个（6 运行 + 8 开发），其余都是传递依赖
- 平台二进制按当前系统安装：Windows 上只有 `@esbuild/win32-x64`、
  `@rollup/rollup-win32-x64-msvc` / `-gnu` 等 Windows 变体

**在 macOS / Linux 上开发**：删掉 `node_modules` 再 `npm install`，
npm 会自动补齐对应平台的原生二进制和 `node_modules/.bin/` 下的 unix 启动脚本。
直接把 Windows 的 `node_modules` 拷到别的平台是跑不起来的。

## 一个容易误会的点：`y-indexeddb`

`node_modules/y-indexeddb@9.0.12` 是**装着的**，但项目代码**没有直接用它**——
它是 `@liveblocks/yjs` 的传递依赖（Liveblocks 的 provider 用它做离线缓存，
由 `ProviderOptions.offlineSupport_experimental` 控制，当前**默认关闭**）。

所以：

- 在 `package.json` 里「卸载」它不会让 `node_modules` 里消失，`npm prune` 也会保留它。
  这是正常的，不是残留垃圾。
- 想启用离线缓存时，不需要额外装包，只要给 provider 传
  `getYjsProviderForRoom(room, { offlineSupport_experimental: true })` 即可（实验特性，需先测断网重连）。

## 构建与验证状态

在当前环境实测通过：

```bash
npm run typecheck        # tsc --noEmit，通过
npm run build            # 类型检查 + vite build，通过（约 573 kB / gzip 180 kB）
npm run build:standalone # 单机演示版，通过（产物内不含 Liveblocks key）
```

> 早期版本的本文件曾记录「打包机没有安装 Node，未能重跑构建」。
> 这条**已过期**：现在这台机器上 Node / npm / vite / tsc 都可用，
> 上面三条命令都实际跑过并通过。

## 未验证的事

- **多平台构建**：只在 Windows 上验证过；macOS / Linux 未测。
- **Node 版本兼容性**：未记录构建时的 Node 版本，也未测最低支持版本。
- **`npm audit`**：有告警（`npm audit` 可查看），未逐条处理。
- **生产环境多用户压力**：只做过 2 个标签页的并发验证，未测 8 人同时编辑。
