# 小白鸡毛学习窝

双人学习计划和 DDL 应用。角色固定为“小白”和“鸡毛”，两个人可以各自维护自己的学习任务、进度和 DDL，同时查看对方动态并互相留言。

## 本地运行

Codex 环境里可以直接运行：

```bash
/Users/hauhwon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

如果电脑上安装了 Node.js，也可以运行：

```bash
npm start
```

然后打开：

```text
http://localhost:5173
```

## 不同局域网一起使用

两个人在不同电脑、不同局域网时，不能只靠 `localhost` 或家里的 Wi-Fi 地址。需要把这个应用部署到一个公网可访问的服务器上，或者使用内网穿透。

### 方案 A：部署到云平台

1. 把 `study-sync` 文件夹上传到 Render、Railway、Fly.io、VPS 或任意能跑 Node.js 的平台。
2. 启动命令使用：

```bash
npm start
```

3. 环境变量可选：

```text
PORT=5173
HOST=0.0.0.0
DATA_FILE=/app/data/app-state.json
AUTH_SECRET=一串随机长字符
XIAOBAI_PASSWORD=小白入口口令
JIMAO_PASSWORD=鸡毛入口口令
```

4. 平台会提供一个公网网址，两个人都打开同一个网址。
5. 小白选择“小白”，鸡毛选择“鸡毛”。

### Render 快速部署

推荐先用 GitHub 部署：

1. 新建一个 GitHub 仓库，把 `study-sync` 文件夹里的内容上传到仓库根目录。
2. 打开 Render Dashboard，选择 **New +** → **Blueprint**。
3. 连接刚才的 GitHub 仓库，Render 会自动读取 `render.yaml`。
4. 创建服务时填写两个入口口令：
   - `XIAOBAI_PASSWORD`
   - `JIMAO_PASSWORD`
5. Render 部署完成后会给你一个形如 `https://study-sync.onrender.com` 的网址。
6. 小白和鸡毛都打开同一个网址，各自进入自己的角色。

当前 `render.yaml` 默认使用 Render 免费 Web Service。免费服务可以跑起来，但文件系统是临时的，服务重启或重新部署后，学习记录可能丢失。

如果你想长期稳定保存任务、留言和时间线，建议在 Render 服务里添加 Persistent Disk：

```text
Mount Path: /opt/render/project/src/data
DATA_FILE: /opt/render/project/src/data/app-state.json
```

Render 官方说明里写到：默认服务文件系统是临时的；只有 Persistent Disk 挂载路径下的文件会跨部署和重启保留。Persistent Disk 需要付费 Web Service。

### 方案 B：VPS + Docker

如果你有一台云服务器，可以在服务器上运行：

```bash
docker build -t study-sync .
docker run -d \
  --name study-sync \
  -p 5173:5173 \
  -v study-sync-data:/app/data \
  --restart unless-stopped \
  study-sync
```

然后访问：

```text
http://服务器公网IP:5173
```

如果你有域名，可以把域名解析到服务器公网 IP，再用 Nginx/Caddy 反向代理到 `127.0.0.1:5173`。

### 方案 C：临时内网穿透

如果只是临时一起用，也可以用 ngrok、Cloudflare Tunnel、Tailscale Funnel 这类工具把本机服务暴露成公网网址。电脑关机或隧道停止后，对方就访问不了了。

## 重要提醒

这个应用支持为两个入口设置口令。部署到公网时建议配置：

- `XIAOBAI_PASSWORD`
- `JIMAO_PASSWORD`
- `AUTH_SECRET`

如果不设置入口口令，本地开发可以直接进入；公网部署不建议这样做。

## 数据

数据默认保存在：

```text
data/app-state.json
```

也可以通过 `DATA_FILE` 环境变量指定到持久化磁盘。云平台或 Docker 部署时，一定要启用持久化存储；否则容器重启或重新部署后可能会丢数据。

### Supabase 数据库保存

Render 免费服务的本地文件会重置，长期使用建议接 Supabase 数据库。

1. 在 Supabase 新建 Project。
2. 打开 SQL Editor，执行：

```sql
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
```

3. 在 Supabase Project Settings → API 里复制：
   - Project URL
   - service_role key
4. 在 Render 服务的 Environment 里添加：

```text
SUPABASE_URL=你的 Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
```

5. 重新部署 Render。

设置了这两个环境变量后，服务端会自动把任务、留言、时间线保存到 Supabase；没设置时会继续使用本地 `data/app-state.json`。

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Render 环境变量里，不要写进前端代码，也不要提交到 GitHub。

## 功能

- 小白 / 鸡毛两个角色入口
- 双人导览页，进入自己的板块后才看到详细内容
- 每个人只维护自己的任务和进度
- 点头像进入对方主页，查看概览、数据图表、计划和留言栏
- DDL 日历可点开查看详情
- 任务卡可点开查看详情
- 每个任务支持自定义步骤细节和逐步勾选
- 任务步骤支持拖拽排序和上下移动
- 公开悄悄话、主页留言墙、任务留言分开显示
- 步骤完成和任务完成有爪印反馈动画
- 入口口令
- 今日视图
- 本周推进统计
- 全局留言
- 针对具体任务留言
- Server-Sent Events 实时同步
