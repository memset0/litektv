# litektv

> 支持多人协同点歌的简易 KTV 软件，基于 Bilibili / YouTube 的内嵌播放器。

霓虹风的轻量级 KTV 点歌台：扫码进同一个房间，每个人都能加歌、调整队列、发弹幕；切歌靠拖拽，没有 DJ、也没有"清空"按钮——一群人一起唱就好。100% Vibe Coding。

线上 demo: <https://ktv.dev.mem.ac/>

---

## 主要功能

- **多人同房，状态实时同步**：基于 WebSocket，队列 / 当前歌 / 历史 / 弹幕 / 在线列表全部由后端统一广播。每个人在自己浏览器里独立播放，互不干扰音量与全屏。
- **支持 Bilibili 和 YouTube**：粘贴 `bilibili.com/video/BV...`、`b23.tv/...` 短链，或 `youtube.com/watch?v=...`、`youtu.be/...`。后端会自动跟随 b23.tv 的 302、抓取标题与封面，**支持带中文标题前缀的 B 站分享串**（例如 `【XX - 哔哩哔哩】 https://b23.tv/...`）。
- **拖拽重排队列**：直接拖动队列里的歌切换位置；不需要的歌点垃圾桶，会先弹确认；置顶按钮一键插队。无 CLEAR 全清按钮，避免误操作把别人选的歌一键删光。
- **弹幕** — 4 条轨道横屏飞过，全屏播放时也覆盖在画面上；后端环形缓冲保留最近 50 条。
- **房间号一键分享** — URL 形如 `https://<host>/<slug>`，默认是 6 位数字（方便口头报号）。右下角浮动二维码（白底，方便扫描），扫码即进同一房间。
- **响应式 UI**：手机 / 平板 / 桌面自动适配，无需手动切换布局；桌面端可以一键折叠侧边面板专心看屏幕。
- **数据持久化**：后端用 SQLite (WAL) 存房间状态，重启不丢数据；空闲超过 24 小时的房间自动 GC。

---

## 仓库结构

```
.
├── packages/
│   ├── backend/         # Node.js + TypeScript + pnpm，Express + ws + better-sqlite3
│   └── frontend/        # 单页应用（KTV.html + JSX/CSS，运行时用 @babel/standalone）
├── openspec/specs/      # OpenSpec 沉淀的能力规范（room-state-sync / link-parser / ...）
├── CLAUDE.md            # 与 AI 协作时的约定（commit 风格、author 身份等）
└── README.md            # 你正在看的文件
```

## 本地运行

需要 Node.js ≥ 20、pnpm ≥ 10。

```bash
# 装后端依赖并启动
cd packages/backend
pnpm install
STATIC_DIR=../frontend pnpm dev
```

打开 <http://127.0.0.1:38117/> 即可使用——浏览器会自动随机一个 6 位房间号。

环境变量见 [`packages/backend/README.md`](packages/backend/README.md)。

## 协议 / 规范

接口和行为约定都沉淀在 [`openspec/specs/`](openspec/specs/) 下的 6 个 capability：

| Capability | 范围 |
|---|---|
| `room-state-sync` | WebSocket 协议、`RoomState` 语义、限流 |
| `link-parser` | `POST /api/parse-link`、b23.tv 跳转、乱文本兼容 |
| `room-persistence` | SQLite 存储与启动 hydrate、idle GC |
| `room-routing` | `/<slug>` 美化 URL、6 位默认、保留路径 |
| `queue-controls` | 拖拽 / 置顶 / 删除 confirm / 不能批量清空 |
| `app-shell` | 响应式布局、侧栏开关、动态标题、隐藏滚动条 |

OpenSpec 已经在仓库里装好（`/opsx:propose`, `/opsx:apply`, `/opsx:archive`）。

## 致谢

- Bilibili `api.bilibili.com/x/web-interface/view` 提供视频元数据
- YouTube oEmbed 提供视频标题
- [api.qrserver.com](https://api.qrserver.com) 生成扫码二维码

## License

MIT
