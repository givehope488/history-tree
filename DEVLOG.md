# 开发文档 · 历史事件树状图

> 这份文档是**交接文档**：任何时候停下、隔一阵子再接回来，先读这里。
> 面向开发，讲「现在到哪了、为什么这么做、接下来做什么」。
> 面向使用者的说明在 [README.md](./README.md)。

最后更新：2026-10-24

---

## 1. 项目一句话定位

把历史事件画成**纵向树状图**（中国 = 中央主干，其他国家 = 彩色分支，同时间 = 同一水平线，
纵向按真实时间比例），节点可展开看详情、可增删改，**支持多人实时协同编辑**。

路径：`D:\历史纲要\history-timeline-v1.0.0`

---

## 2. 当前状态

### 已完成并验证

| 功能 | 状态 | 验证方式 |
|---|---|---|
| 树状图布局（时间比例、同层对齐、轨道分配、曲线接入） | ✅ | 浏览器实际渲染，多轮用户反馈后修正 |
| 添加 / 编辑 / 删除节点，自动归位 | ✅ | 浏览器操作 |
| 添加 / 删除国家分支（主干不可删） | ✅ | 浏览器操作 |
| 导入 / 导出 JSON、恢复初始数据 | ✅ | 代码路径 + 构建通过 |
| Markdown 详情渲染（无 innerHTML，链接协议白名单） | ✅ | 代码审查 |
| 单人模式（无 Liveblocks key 时降级 localStorage） | ✅ | 代码路径 |
| **多人协同：跨标签页实时同步** | ✅ | 双标签页实测 |
| **多人协同：同节点不同字段并发编辑不互相覆盖** | ✅ | 双标签页实测（见第 6 节） |
| **多人协同：刷新后改动不丢** | ✅ | 刷新实测（曾是有 bug 的，已修，见 4.2） |
| **房间粘性：重开应用回到同一房间** | ✅ | 不带 hash 打开应用实测 |
| **新建房间继承当前内容** | ✅ | 实测（曾有 bug，已修，见 4.5） |
| **房间被清空时从本地快照恢复** | ✅ | 造「空房间 + 本房间快照」实测，拿到快照内容而非课本骨架 |
| **不会把本机内容灌进别人的新房间** | ✅ | 造「空房间 + 别的房间快照、无继承标记」实测，拿到的是课本骨架 |
| **本地快照：连接中先铺图** | ✅ | 代码路径（`isLive()` 门控） |
| 在线成员列表 + 「正在编辑」提示 | ✅ | 双标签页实测 |
| 昵称弹窗（首次进入 / 后续可改） | ✅ | 浏览器实测 |
| 清空口令（保护「恢复初始数据」和「导入覆盖」） | ✅ | 代码路径 + UI 实测 |
| `tsc --noEmit` 严格类型检查 | ✅ | 通过 |
| `vite build` 生产构建 | ✅ | 通过（约 552 kB / gzip 177 kB） |

### 未完成 / 待办

- [x] ~~`demo-standalone.html` 未重新生成~~ → **已重新生成**。
      做法：新增 `.env.standalone`（把 `VITE_LIVEBLOCKS_PUBLIC_KEY` 置空）+ `npm run build:standalone`。
      Vite 按 `.env → .env.local → .env.<mode>` 顺序加载，mode 专属文件覆盖 `.env.local`，
      所以单机版产物里**不含 key**（已实测 `grep pk_dev` 为 0）。
      构建脚本还加了守卫：产物里若检出 `pk_` 就直接报错退出。
- [x] ~~`y-indexeddb` 装了但没用到~~ → **已卸载**。
      依赖现在只剩 `@liveblocks/*` + `yjs` + React。
- [x] ~~`.gitignore` 不存在~~ → **已补**（`node_modules/`、`dist/`、`.env.local`、`.env.*.local`）。
- [ ] **离线缓存未启用**：教室网络不稳时可以考虑打开 `offlineSupport_experimental: true`
      （`getYjsProviderForRoom(room, { offlineSupport_experimental: true })`），
      但它是实验特性，需要先测断网重连。若启用，`y-indexeddb` 仍然不需要（provider 内置）。
- [ ] **没有自动化测试**：目前全部靠浏览器手测。如果要长期维护，建议先补
      `lib/layout.ts`（纯函数，最好测）和 `lib/collab.ts` 的 `read/patch` 逻辑的单测。
- [ ] **移动端协同条未验证**：`CollabBar` 在窄屏下的布局没测过。
- [ ] **`dist/` 是两种构建共用的**：跑过 `build:standalone` 后 `dist/` 会变成单机版，
      需要联网版时最后再跑一次 `npm run build`。（也可以改成用不同的 `outDir`，暂未做。）

---

## 3. 关键决策与理由

### 3.1 协同方案：Yjs + Liveblocks（而不是自己写 WebSocket）

- 用户**不能自己跑服务器**，所以必须是托管后端。
- 树状图布局是**纯派生**的：`computeTreeLayout(events, countries)` 是纯函数，
  同样的数据必然画出同样的图。**所以协同只需要同步这两份数据**，
  `layout.ts`、`TreeDiagram.tsx`、`TreeNode.tsx` 一行都不用改。这是整个方案能这么轻的前提。
- 选 CRDT（Yjs）而不是 OT：不需要中心化的冲突仲裁，离线/断线重连天然更稳。

### 3.2 记录用「嵌套 Y.Map（字段表）」存，而不是整块对象

**这是踩过的坑，很重要。**

最初的实现是把整条事件当成一个普通对象塞进 `Y.Map`：

```ts
eventsMap.set(event.id, { ...event });   // ❌
```

Yjs 只在**它自己的类型**（`Y.Map` / `Y.Array` / `Y.Text`）这一层做合并；
普通对象是**原子值**，整块 `set` 就是整块替换。后果是：

> A 打开编辑表单改标题、B 同时打开同一节点改正文。B 保存时提交的是**整份快照**，
> 里面带着 B 表单打开时的旧标题，于是 A 改的标题被覆盖回去了。

改成每条记录一个嵌套 `Y.Map`、字段做键之后：

```ts
fieldsOf(eventsMap, id).set('title', v);   // ✅ 只动 title 这一个字段
```

再配合**表单只回写自己改过的字段**（见 3.3），两个人改不同字段就都能保住。
相关代码：`lib/collab.ts` 的 `yToPlain` / `fieldsOf` / `writeFields` / `patchEvent`。

### 3.3 表单只回写「改动过的字段」

`EventForm.tsx`：

- 表单打开时把初值**冻结**成 `baseline`（`useState(() => initial)`，不是每次渲染重算）。
  这样别人改了同一个节点，不会让这边的「有未保存修改」莫名亮起，
  也才能分清「哪些字段是我改的、哪些是别人改的」。
- 提交时 `changedFields(baseline, values)` 算出改动集合，随 `save-event` 一起发出去。
- store 里 `buildPatch(event, changed)` 只把这些字段写进文档。

### 3.4 删除用墓碑（`deletedAt`），不真删

多人同时操作时，A 删掉某条、B 恰好正在编辑并保存，**真删会被「复活」**。
所以删除只写 `deletedAt`，读取时过滤掉（`Country.deletedAt` / `TimelineEvent.deletedAt`）。

### 3.5 UI 状态与数据后端分离

`store.tsx` 里：

- **UI 状态**（展开哪些节点、弹窗、提示条）走 `useReducer`，各人看各人的，**不共享**。
- **数据**（国家 + 事件）走 `DataBackend` 接口，两种实现：
  `createLocalBackend()`（localStorage）和 `createYjsBackend(doc)`（Liveblocks）。
- 对外仍然只暴露一个 `StoreValue`，所以**各个组件不需要知道自己跑在哪种模式下**。

### 3.6 没有 key 就自动降级

`StoreProvider` 看 `VITE_LIVEBLOCKS_PUBLIC_KEY` 有没有：
有 → `LiveblocksProvider` + `RoomProvider` + `CollabStore`；
没有 → `LocalStore`（localStorage 单机模式）。
**保证页面在任何情况下都打得开**，不会因为缺 key 白屏。

### 3.7 房间号记在浏览器里 + 本地快照

**起因**：用户反馈「希望改动能长期保存（下次新房间仍有之前做的改动）」。
根因是 `resolveRoomId()` 在地址栏没有 `#/b/...` 时**每次都随机开一个新房间**，
所以重开页面就等于进了空房间，之前的改动看起来丢了。

修法分三层：

1. **房间号粘性**：`resolveRoomId()` 把用过的房间号写进
   `localStorage['ch10-history-tree:room']`；地址栏没带房间号时**回到这个房间**，
   只有这个浏览器从没进过任何房间时才真的新建。带 `#/b/...` 时以地址栏为准（并记下来）。
2. **本地快照**：`localStorage['ch10-history-tree:snapshot']` 存
   `{ roomId, savedAt, countries, events }`。**三个用途**：
   - **连接期间的占位**：首次同步之前本地文档必然是空的，这时 `read()` 用快照把图铺出来，
     免得打开页面先看到一片空白。**同步一完成就不再用了**（那时文档才是权威，
     继续用快照会显示出已经删掉的东西）——所以后端有个 `everSynced` 标志，
     以及对外暴露的 `isLive()`。
   - **房间被清空时恢复**：如果连上后发现房间是空的、而快照的 `roomId` 正好是**这个房间**，
     就用快照恢复内容，而不是写课本骨架。这样「关机几天后重开」看到的是自己的东西。
   - **新房间的种子**：新建房间时用快照当种子，于是新房间继承当前这块板子的内容。
3. **「新建房间（复制当前内容）」入口**：在协同条的成员浮层里。
   先把当前内容落一份快照，再换房间号并刷新。

配套地，`StoreShell` 写快照时**只在 `backend.isLive()` 为真时写**
（首次同步完成前 `read()` 返回的可能是缓存，把它当事实写下去会把房间的快照写错）。

#### 播种的三种情形（必须分清，否则会把别人的房间改成我的板子）

`seedSource(roomId)` 的判断顺序：

| 情形 | 判断依据 | 用哪份数据 |
|---|---|---|
| 快照就是这个房间的 | `snapshot.roomId === roomId` | **快照**（恢复被清空的房间） |
| 是我自己刚点「新建房间」开出来的 | `localStorage[INHERIT_KEY] === roomId` | **快照**（有意继承） |
| 其他（比如别人分享了新房间的链接给我） | 都不满足 | **课本骨架** |

第三种情况是**安全关键**：别人新建一个房间、把链接发给我，我本机还留着自己板子的快照。
如果没有这个区分，我的客户端会抢先播种，**把我的内容写进别人的房间**。
所以「继承」必须是**显式意图**（`switchToNewRoom()` 写下 `INHERIT_KEY`），
而不是靠「快照的房间号和当前不一样」这种间接推断。

这些判断只在「房间确实没有任何数据」时才起作用：只要房间里已有内容（哪怕被清空过），
`meta.seeded` 就在，根本不会走到播种。

**重要**：播种数据必须在**创建后端那一刻**就算好并传进去（`YjsBackendOptions.seedData`），
不能等同步完成再算 —— 见 4.5。

---

## 4. 踩过的坑（按时间顺序）

### 4.1 「不同时间的事件挤在同一水平线上」

**根因在数据，不在代码。** 最初给同一个教材小节的事件都填了同一个「时间点」，
于是它们被 `timeKey` 正确地归并到了同一层。
修法：给每条事件填**它自己真实的日期**（`data/seed.ts`）。

### 4.2 刷新后改动丢失（最隐蔽的一个）

**现象**：在两个标签页里改完数据，刷新其中一个，改动回到初始值。

**排查过程**：

1. 先怀疑数据没同步到服务器 —— 用调试入口读共享文档，发现**写入是成功的**
   （`doc.getMap('events').get(id).get('title')` 就是新值）。
2. 再怀疑同步没到服务端 —— 刷新后读文档，发现标题回到初始值，且
   `meta.seededAt` **变成了新时间戳**，说明**重新播种了**。
3. 结论：`ensureSeeded` 在**同步完成之前**就跑了一次。同步前本地文档一定是空的，
   `meta.get('seeded')` 是 `undefined`，于是它认为「这是个新房间」，把种子数据写了进去，
   覆盖了房间里已有的内容，并且这个覆盖还会同步回服务器、同步给所有人。

**修法**：种子必须等**首次同步完成**再判断。
`LiveblocksYjsProvider` 的 `handleServerUpdate` 是**先 `applyUpdate` 应用服务端状态、
再置 `synced = true` 并 emit `'synced'`**，所以监听 `'synced'` 是安全的：

```ts
// lib/collab.ts
if (options.seed === false) {
  seedHandled = true;
} else if (options.provider) {
  if (options.provider.synced) seedIfNeeded();
  else options.provider.on('synced', seedIfNeeded);
} else {
  seedIfNeeded();   // 没给 provider：调用方保证此时文档状态可信
}
```

**验证**：改标题 → 保存 → 刷新 → 标题还在，且 `meta.seededAt` **保持不变**（说明没重新播种）。

> **给后来者的提醒**：任何「首次进入时初始化共享文档」的逻辑都要小心这个时序。
> 判断依据必须是「同步之后文档里有没有内容」，而不是「我本地现在是不是空的」。

### 4.3 StrictMode 下不要 destroy 缓存的 provider

`getYjsProviderForRoom` 会**按房间缓存** provider。
React 18 StrictMode 在开发模式下会 mount → unmount → mount，
如果按常规在 effect 清理里 `provider.destroy()`，第二次挂载拿到的是**已经被销毁的缓存对象**，连接就死了。
所以 `CollabStore` 里**故意不做 destroy**（见代码注释）。

### 4.4 自动化点击超时

这个环境里 `locator.click()` 经常超时（pointer probe 找不到落点）。
可行做法是用页面内脚本派发点击，以及给 React 受控输入赋值时用原生 setter：

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, '新值');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

注意：`playwright.evaluate` 有 **3000ms 上限**，长流程要拆成多次调用 + `waitForTimeout` 分段。

### 4.5 快照把「这是新房间」的信号冲掉了

**现象**：点「新建房间」后，新房间确实开了、也拿到了 21 条事件，
但内容退回课本骨架，**没有继承刚才那块板子的改动**。

**根因**：`seedSource()` 靠「快照里的 `roomId` 和当前房间号不一样」来判断
「这是上一个房间的内容，可以拿来当种子」。但 `StoreShell` 的快照 effect 在挂载后 400ms
就写了一次快照，而那次写入把快照的 `roomId` 改成了**新房间**的 id ——
于是等同步完成真正播种时，`snapshot.roomId === 当前房间`，
`seedSource` 认为「这就是本房间的快照」，退回课本种子。

**修法**：把播种数据**在创建后端那一刻**就算好，通过 `YjsBackendOptions.seedData` 传进去：

```ts
// lib/collab.ts · createYjsBackend
const seedData = options.seed === false ? null : (options.seedData ?? seedSource(options.roomId));
```

**顺带修的**：`StoreShell` 只在 `backend.isLive()` 时才写快照，
避免「还没同步就把缓存当事实落盘」。

> **给后来者的提醒**：凡是「靠对比本地状态来判断当前处于什么场景」的逻辑，
> 都要确认在它判断之前，那份本地状态有没有可能已经被别的 effect 改掉。
> 涉及时序的决策，最好在最早、最确定的时刻一次性算好，而不是等异步流程走完再算。

### 4.6 不要为「一次性的提示」跟 StrictMode 较劲

我原本想在「内容是从本地快照恢复回来的」时弹个提示条，于是让后端记一个
`restoredFromSnapshot` 标志：播种时若用的是快照就置位。

**结果标志位永远是 false**，但内容确实恢复成功了。

**根因**：React 18 StrictMode 会把 `useMemo` 的工厂函数跑两遍，于是
`createYjsBackend` 被调了两次、产生两个后端实例，而**第一个实例（会被丢弃的那个）
先把种子写进了文档**。活下来的那个实例再调 `ensureSeeded` 时，
`meta.seeded` 已经存在 → 直接返回 → 它的标志位没被置上。

**处理**：这个标志只是为了弹个提示，**为它去跟 StrictMode 的重复调用机制搏斗不划算**，
所以直接砍掉了。真正有用的恢复逻辑保留，验证方式改成断言「空房间拿到的是快照里的内容
（2 条）而不是课本骨架（21 条）」——这个断言更直接、也更稳。

> **经验**：实例级的标志位在 StrictMode 下不可靠（同一份逻辑可能跑在两个实例上）。
> 真要记录跨实例的状态，就写进**共享文档**（`meta`）里，别放在闭包变量里。
> 另外：先问自己这个提示到底值不值得这个复杂度。

---

## 5. 文件地图与职责

```
src/
├─ store.tsx              ★ UI 状态（useReducer）+ 数据后端接线；对外 StoreValue
├─ lib/collab.ts          ★ 协同层：DataBackend 接口 / 本地后端 / Yjs 后端 / 房间号 / 本地快照 / 口令哈希
├─ lib/layout.ts          ★ 布局引擎（纯函数，无副作用，最值得写测试的地方）
├─ lib/storage.ts           守卫解析（parseCountry/parseEvent/sanitizeData）、导入导出、localStorage
├─ lib/time.ts              时间解析与格式化；toDayNumber 用于比例排布
├─ lib/markdown.tsx         轻量 Markdown → React 节点
├─ lib/id.ts                id 生成
├─ types.ts                 Country / TimelineEvent / PersistedData / TimeValue…
├─ liveblocks.config.ts     Liveblocks Presence 全局类型声明
├─ vite-env.d.ts            import.meta.env 类型
├─ data/seed.ts             种子数据（8 分支 + 21 事件）
├─ components/
│   ├─ TreeDiagram.tsx      SVG 线层 + HTML 节点层 + 图例
│   ├─ TreeNode.tsx         节点胶囊 + 展开的详情卡
│   ├─ EventForm.tsx        ★ 表单；baseline 冻结 + changedFields 计算
│   ├─ CollabBar.tsx        ★ 昵称 / 在线成员 / 正在编辑 / 复制链接 / 清空口令 / 房间号 / 新建房间
│   ├─ TopBar.tsx           顶栏
│   ├─ BranchForm.tsx       新建分支
│   ├─ CountrySelect.tsx    国家选择器
│   ├─ ConfirmDialog.tsx    二次确认（支持 requirePass）
│   └─ ui.tsx               标签 / 提示条 / 空状态
└─ App.tsx, main.tsx, index.css
```

打 ★ 的是协同改造的核心，改动时优先看这几个。

仓库根目录的文档：

| 文件 | 面向谁 | 内容 |
|---|---|---|
| `README.md` | 使用者 | 功能、布局规则、协同配置、怎么用 |
| `DEPLOY.md` | 部署的人 | 托管方案与详细步骤、环境变量、常见坑 |
| `DEVLOG.md` | 接手开发的人 | 本文：进度、决策、踩过的坑、验收脚本 |
| `DEPENDENCIES.md` | 接手开发的人 | 依赖版本、lockfile、构建验证状态 |

---

## 6. 怎么跑、怎么验

### 跑起来

```bash
cd D:\历史纲要\history-timeline-v1.0.0
npm install
npm run dev            # http://localhost:5173
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + 产出 dist/
```

### 协同验收脚本（手动，约 5 分钟）

准备：两个标签页打开**同一个房间链接**（`#/b/<同一个房间号>`），分别填不同昵称。

1. **并发不同字段**
   - 页 A：展开「党的十八大胜利召开」→ 编辑 → 只把**标题**改成 `…【A改标题】` → **先别保存**。
   - 页 B：展开同一个节点 → 编辑 → **只改正文**（标题保持原样）→ **先别保存**。
   - 页 A 保存；等 2 秒；页 B 保存。
   - ✅ 两边都应当同时看到：A 的标题 **和** B 的正文。
2. **刷新持久化**
   - 刷新页 B。
   - ✅ 标题和正文都还在。
   - 附加检查：控制台里 `window.__collab.doc.getMap('meta').get('seededAt')` **不应变化**
     （变了说明又播种了，即 4.2 的 bug 回归了）。
3. **在线状态**
   - ✅ 两边顶栏都显示「在线 2」，成员列表里能看到对方昵称和「正在编辑」。
4. **清空口令**
   - 设置口令 → 点「恢复初始数据」→ ✅ 应当要求输入口令；输错有提示，输对才执行。
5. **长期保存（房间粘性）**
   - 在某个房间里改点东西 → 直接打开 `http://localhost:5173/`（**不带** `#/b/...`）。
   - ✅ 应当回到**同一个房间**（地址栏 hash 与之前一致），改动还在。
   - 控制台检查：`localStorage.getItem('ch10-history-tree:room')` 就是这个房间号。
6. **新建房间继承内容**
   - 顶栏「在线 N」→「新建房间（复制当前内容）」→ 确认。
   - ✅ 页面刷新后地址栏房间号**变了**，但事件数量和内容与原来一致（含刚才的改动）。
   - 控制台检查：`localStorage.getItem('ch10-history-tree:snapshot')` 里 `roomId` 是新房间号，
     且内容已经带上了改动。
7. **房间被清空时恢复**（手工构造，因为没法真的去删服务端房间）
   - 在控制台把 localStorage 设成：`room` = 一个没用过的房间号 X，
     `snapshot` = `{ roomId: X, countries: [...], events: [...2 条自己造的事件...] }`，
     并删掉 `inherit-into`。
   - 打开应用。
   - ✅ 应当落在房间 X，并且**只有那 2 条事件**（说明用了快照），而不是课本的 21 条。
   - 反向检查（安全属性）：把 `snapshot.roomId` 改成一个**别的**房间号、其余不变，重开。
   - ✅ 应当拿到**课本骨架 21 条** —— 绝不能把自己的内容灌进一个陌生房间。

### 开发调试入口

开发模式下 `window.__collab` 暴露了共享文档和 provider：

```js
__collab.provider.synced          // 是否已同步
__collab.provider.getStatus()     // 'synchronized' 等
__collab.doc.getMap('meta').get('seeded')
__collab.doc.getMap('events').size
__collab.doc.getMap('events').get('e-2012-cn').get('title')
localStorage.getItem('ch10-history-tree:room')       // 记住的房间号
localStorage.getItem('ch10-history-tree:snapshot')   // 本地快照
```

### 数据存在哪

| 存哪 | 内容 | 说明 |
|---|---|---|
| Liveblocks 房间 | 权威数据 | 同房间所有人共享，这是真正的「长期保存」 |
| `localStorage['ch10-history-tree:room']` | 房间号 | 记住「上次在哪个房间」，重开应用回到这里 |
| `localStorage['ch10-history-tree:snapshot']` | `{ roomId, savedAt, countries, events }` | 连接期间占位 + 新房间的种子 |

**关键认识**：改动跟着**房间**走，不跟着浏览器走。
所以链接和浏览器数据同时丢失，内容就找不回来了 —— 界面上必须明确提示用户定期导出 JSON 备份。
反过来说，「换台电脑打开同一个链接」能拿到全部内容，因为数据在房间里、不在本地。

---

## 7. 环境与密钥（安全）

- `.env.local`（已在 `.gitignore`，不会提交）：

  ```
  VITE_LIVEBLOCKS_PUBLIC_KEY=pk_dev_xxxxxxxx
  ```

- **`pk_` public key 放前端是安全的**，它本来就是设计成公开的。
- **`sk_` secret key 绝对不能进前端代码**，那是后台用的。
- **房间号是长随机串**（`resolveRoomId()` 用 `crypto.getRandomValues` 生成 12 字节），
  因为匿名链接人人可改，短号会被人猜中闯进来。
- **清空口令只是防手滑，不是真安全**：校验在前端做（`hashPassphrase` + 比对），
  懂技术的人绕得过去。UI 上也如实写了这句话。
- 匿名链接**没有权限分级**，拿到链接的人都能改。

---

## 8. 开发历程（时间线）

| 阶段 | 做了什么 | 结果 |
|---|---|---|
| 1 | 检查半成品项目，给方案 | 用户选「方案1：中国为主干的多树形式」 |
| 2 | 重写为纵向树状图布局引擎 | 时间→y、轨道分配、水平对齐 |
| 3 | 用户反馈「分支凭空出现一条平行线」 | 改为平滑曲线接入父分支 |
| 4 | 用户反馈「不希望非主干分支向上延伸」 | 父分支选取改为「由内向外、且必须已覆盖起点」；只有主干允许向上延长 |
| 5 | 用户要求增删分支 | 加 `BranchForm` + 图例 ✕ + 主干保护 |
| 6 | 用户反馈「不同时间的事件在同一水平线」 | 定位为**数据问题**，给每条事件填真实日期 |
| 7 | 修日期后图高变成 35766px | 定位为用 `toSortable` 做比例；改用 `toDayNumber` + 平均间隔缩放 → 3417px |
| 8 | 用户追加规则「第一个事件越早越靠近主干」 | 轨道分配改为按各分支首个事件时间排序 |
| 9 | 用户要求做成多人协同 | 定方案：Yjs + Liveblocks + 匿名公开链接 + 口令保护 + 昵称 |
| 10 | 安装依赖、核对 API、加 `deletedAt` 墓碑 | 见 `package.json` / `types.ts` |
| 11 | 写 `lib/collab.ts` + 重写 `store.tsx` | UI 状态与数据后端分离 |
| 12 | 加昵称弹窗、在线成员、正在编辑、清空口令 | `CollabBar.tsx` |
| 13 | 双标签页验证时发现「后保存覆盖先保存」 | 定位为整块对象写入 → 改为嵌套 Y.Map 字段表 + 表单只回写改动字段 |
| 14 | 双标签页验证通过 | A 的标题 + B 的正文同时保住 |
| 15 | 发现刷新后改动丢失 | 定位为同步前重新播种 → 改为等 `'synced'` 再判断 |
| 16 | 复验：跨标签页同步 + 并发不同字段 + 刷新持久化 | 全部通过 |
| 17 | 补 `README.md` 与本文档 | — |
| 18 | 用户反馈「希望改动能长期保存」 | 定位为**每次打开都随机开新房间** → 房间号改为粘性（记在 localStorage） |
| 19 | 加本地快照：连接期间占位 + 新房间的种子 | `readSnapshot/writeSnapshot` + `isLive()` |
| 20 | 新建房间实测发现没继承内容 | 定位为快照 effect 冲掉了「上一个房间」的信号 → 播种数据改为创建后端时一次算好（4.5） |
| 21 | 复验：房间粘性 / 新建房间继承 / 刷新持久化 / 双标签页并发 | 全部通过 |
| 22 | 用户问「关机重开会丢吗」→ 查证 Liveblocks 保留政策 | 官方定价页与 platform/limits **均未提及**房间数据自动删除；列出的保留期只有版本历史与事件日志 |
| 23 | 发现代码缺口：房间被清空时会写课本骨架，而不是用本地快照恢复 | 补上「快照就是本房间 → 用快照恢复」 |
| 24 | 补「继承标记」，区分「我新建的房间」和「别人分享给我的房间」 | 避免把自己的内容灌进别人的房间 |
| 25 | 为提示条加了 `restoredFromSnapshot` 标志，实测永远为 false | 定位为 StrictMode 把后端实例跑了两遍（4.6）→ 砍掉该标志，保留恢复逻辑 |
| 26 | 实测三种情形：恢复 / 安全 / 继承 | 全部通过 |

---

## 9. 接下来做什么（按优先级）

1. **补数据**：往 `data/seed.ts` 里继续补 2012 至今的同期世界事件（当前 21 条只是骨架）。
2. **给 `lib/layout.ts` 写单测**：它是纯函数，是最划算的测试投资。
3. **窄屏协同条验证**：`CollabBar` 在手机宽度下的布局没测过（现在多了房间号和新建房间，更长）。
4. **房间管理**：目前只能「新建房间」，没有「我有哪些房间」的列表。
   如果用户真的会开多个房间，需要一个切换入口（把用过的房间号存在 localStorage 里列出来）。
5. **考虑定时自动导出提醒**：既然「链接丢了内容就没了」，可以隔一段时间提醒用户导出 JSON。
6. **决定是否启用离线缓存**：`offlineSupport_experimental: true`，需先测断网重连。
7. 可选：把「整字段覆盖」升级为「字符级合并」（把 `title`/`detail` 换成 `Y.Text`），
   这样两个人同时改**同一个字段**也不会互相覆盖。代价是表单和渲染都要改成绑定 `Y.Text`，
   工作量不小，除非真的经常两个人改同一句话，否则不必做。

---

## 10. 给别人接手时的一句话

> 布局是纯函数派生的（`lib/layout.ts`），协同只需要同步 `{countries, events}`；
> 数据在 `lib/collab.ts` 里被抽象成 `DataBackend`（本地 / Yjs 两套实现）；
> 记录在 Yjs 里是**字段表**（嵌套 `Y.Map`），编辑时**只回写改过的字段**；
> 种子数据必须**等首次同步完成**再判断要不要写（否则会覆盖别人的内容）；
> 而「播种用什么数据」必须在**创建后端那一刻**就算好（否则会被快照 effect 冲掉信号），
> 并且要分清三种情形（本房间恢复 / 我新建的房间继承 / 别人的房间用课本骨架）；
> 房间号记在 localStorage 里，重开应用要回到同一个房间，而不是随机开新的；
> 实例级的标志位在 StrictMode 下不可靠，要跨实例就写进共享文档。
