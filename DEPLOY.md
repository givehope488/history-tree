# 部署指南

把网页放到公网上，让学生用自己的电脑/手机打开链接就能一起改。

---

## 前提：你要的是「静态托管」

构建产物就是 4 个文件，**不需要服务器、不需要数据库**：

```
dist/index.html
dist/assets/index-xxxx.js        ← 应用本体
dist/assets/index-xxxx.js.map    ← sourcemap（见「常见坑」第 4 条）
dist/assets/index-xxxx.css
```

三件好事：

1. **不需要配任何路由重写规则。** 房间号在 URL 的 `#` 后面（`#/b/xxx`），
   `#` 之后由浏览器自己处理，服务器永远只返回 `index.html`，所以**刷新页面不会 404**。
   （这是静态托管最常见的一类麻烦，本项目天然绕开了。）
2. **必须 HTTPS。** 「复制链接」用的剪贴板 API、清空口令的哈希都要求安全上下文。
   下面推荐的平台都免费提供 HTTPS。
3. **免费。** 课堂用量远低于任何平台的免费额度。

---

## 一、部署前必做（本地）

```bash
cd D:\历史纲要\history-timeline-v1.0.0
npm run build
```

然后**确认 Liveblocks key 打进去了**：

```bash
grep -c "pk_dev" dist/assets/*.js
```

应该输出 `1`。如果输出 `0`，部署上去会是**单机模式**（顶栏不会有「在线 N」和「复制链接」）。

> ⚠️ **这是最容易踩的坑**：`.env.local` 在 `.gitignore` 里（正确做法，key 不该提交），
> 所以**托管平台自动构建时拿不到这个文件**。必须在平台后台配一个环境变量，
> 见下面第 3 步。这条路径已经验证过：把 `.env.local` 挪走后只用环境变量构建，
> key 照样能打进产物。

---

## 二、推荐方案：Git 仓库 + 平台自动构建

好处：以后改了内容只要 `git push`，平台自动重新构建部署，不用手动上传。

### 第 1 步：推到 GitHub

本地 git 仓库**已经初始化好了**（`git init` + 首次提交已完成，工作区干净）。

1. 打开 [github.com/new](https://github.com/new) 新建一个仓库
   - **不要**勾选 "Add a README file" / ".gitignore" / "license"
     （勾了会产生冲突，因为本地已经有这些文件）
   - 仓库名随意，比如 `history-timeline`
   - 可以选 Public（公开）也可以选 Private，都行
2. 在项目目录里执行（把地址换成你自己的）：

```bash
cd D:\历史纲要\history-timeline-v1.0.0
git remote add origin https://github.com/<你的用户名>/history-timeline.git
git push -u origin main
```

3. 推送时会要求登录：
   - **命令行方式**：用户名填 GitHub 用户名，密码要填 **Personal Access Token**
     （在 GitHub → Settings → Developer settings → Personal access tokens 生成，
     勾 `repo` 权限），不能用账号密码
   - **更省事的做法**：装个 [GitHub Desktop](https://desktop.github.com/)，
     用它把本地仓库 Publish 上去，不用折腾 token

### 第 2 步：在 Cloudflare Pages 里接上这个仓库

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) 注册/登录（免费）
2. 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权 Cloudflare 访问 GitHub，选中刚才推的仓库
4. 构建设置填：

   | 项目 | 值 |
   |---|---|
   | Framework preset | `None`（或 `Vite`，都可以） |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. **先别点 Deploy**，先做下一步

### 第 3 步（最关键）：配置环境变量

在同一个页面往下找 **Environment variables**（有的界面叫 "Advanced" 里展开），加一条：

| 名称 | 值 |
|---|---|
| `VITE_LIVEBLOCKS_PUBLIC_KEY` | `pk_dev_...`（从 `.env.local` 里整串复制） |

**Production 和 Preview 两个环境都勾上**，然后保存并部署。

### 第 4 步：拿到地址

构建完成后会给你一个 `https://<项目名>.pages.dev` 的地址。

---

## 三、其他平台（配置项大同小异）

| 平台 | 入口 | 需要的设置 |
|---|---|---|
| **Netlify** | Add new site → Import an existing project | Build command `npm run build`；Publish directory `dist`；Site settings → Environment variables 加 key |
| **Vercel** | Add New → Project → Import Git Repository | Framework Preset 选 `Vite`；Environment Variables 加 key（输出目录会自动填 `dist`） |

三个平台都要注意同一件事：**环境变量里必须加 `VITE_LIVEBLOCKS_PUBLIC_KEY`**。

---

## 四、部署后自检清单

打开部署好的地址，依次确认：

1. 页面正常显示树状图（21 个节点、7 条国家分支）
2. 顶栏有 **「在线 N」和「复制链接」**
   → 有 = key 生效；没有 = 单机模式，回去检查第 3 步的环境变量
3. 点「复制链接」，确认复制出来的是**部署后的域名**（不是 localhost）
4. 把那个链接**用手机（用流量，不用 WiFi）或另一台电脑打开**，两边各改一下，
   确认能看到对方的改动、顶栏显示「在线 2」
5. 刷新页面，内容还在

第 4 步是真正的验收——它同时验证了托管、HTTPS、Liveblocks 连接三件事。

---

## 五、常见坑

### 1. 托管在「子路径」下会白屏

`dist/index.html` 里引用资源用的是**绝对路径**（`/assets/...`）。
托管在**域名根目录**没问题（上面三个平台都是根目录），
但如果放在**子路径**下（典型例子：GitHub Pages 的项目站点，地址形如
`https://用户名.github.io/仓库名/`），就会找不到资源。

修法：在 `vite.config.ts` 里加一行 `base: './'`，让资源走相对路径。
（本项目默认没加，因为根目录托管不需要；如果你要部署到子路径，告诉我。）

### 2. 房间跟域名无关，但「记住房间」跟域名有关

- **房间数据**存在 Liveblocks 上，**按房间号索引，跟域名没关系**。
  所以把链接里的域名换掉、`#/b/xxx` 保留，在新域名下打开的是**同一个房间、同样的内容**。
  本地已有的内容不用重新录入。
- 但**「记住上次在哪个房间」存在浏览器 localStorage 里，按域名隔离**。
  所以新域名第一次访问要用**带房间号的完整链接**；直接打开裸域名会开一个新房间。

**实际影响**：部署完成后你第一次访问会生成一个**新房间号**。
把它复制下来存进收藏夹，以后发给学生都用这个链接。

### 3. 忘了配环境变量

症状：部署成功，但顶栏没有「在线 N」，或者两台电脑打开是两块互不相干的板子。
原因：构建时没读到 key，降级成了单机模式。
处理：补上环境变量，然后在平台里**触发一次重新部署**（改了环境变量不会自动重构建）。

### 4. sourcemap 会公开源码，而且很大

`vite.config.ts` 里开了 `sourcemap: true`，所以 `dist/assets/*.js.map`
会把源码原文一起公开，而且它有 **2.3 MB**（比 JS 本体 557 kB 还大），
学生用手机加载会多花流量。

教学项目没什么可保密的，但如果你在意，把 `vite.config.ts` 里的 `sourcemap: true`
改成 `false` 即可。

### 5. 构建机 Node 版本太老

本地验证用的是 Node **v24.17.0**。Vite 5 要求 Node ≥ 18。
如果平台构建报 Node 相关的错，在平台的环境变量里加一条
`NODE_VERSION` = `22`（或 `20`），重新部署。

---

## 六、以后怎么更新内容

**方式一：改种子数据（适合批量补历史事件）**

1. 编辑 `src/data/seed.ts`
2. `git add -A && git commit -m "补充世界事件" && git push`
3. 平台自动重新构建部署

> ⚠️ **注意**：种子数据只在**房间还是空的时候**写入一次（靠共享文档里的 `meta.seeded` 标记）。
> 所以改了 `seed.ts` 对**已经用过的房间没有影响**。要看到新种子，得新开一个房间。

**方式二：直接在界面上改（推荐，适合日常）**

点「＋ 添加节点」加的事件会**立即同步给同房间的所有人**，不需要重新部署。
日常补充内容用这个更直接。

---

## 七、不想部署？局域网方案

如果只是**同一个教室、同一个 WiFi** 用，不需要任何托管服务：

```bash
npm run dev -- --host
```

终端会多打印一行 `Network: http://192.168.x.x:5173/`，
把带这个 IP 的地址（记得带上 `#/b/xxx` 房间号）发给学生即可。

或者用生产构建：

```bash
npm run build
npx vite preview --host
```

唯一的限制是**你的电脑得一直开着**，你一关大家就都打不开了。
