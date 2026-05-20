# opendio

opendio 是一个 Personal AI Radio Agent：不是普通音乐播放器，而是一个会理解当前场景、选择音乐、像 DJ 一样说话、控制播放并记住反馈的私人 AI 电台。

项目灵感来自 mmguo 的 Claudio FM：

- 原型参考：<https://mmguo.dev/claudio-fm/>
- 目标：做一个属于自己的 AI 音乐电台应用，应用名叫 **opendio**。

## 当前状态

当前仓库已经包含可运行 MVP 原型源码：

- `server/`：本地 Node.js 服务、播放器控制、radio agent、TTS、provider 接入
- `web/`：前端静态页面，包括首页和播放器页
- `data/`：用户品味、歌单、DJ 人设和设置数据
- `public/`：运行时静态资源目录
- `docs/`：产品、架构、路线图和接入文档
- `records/`：开发进度和过程记录

## 运行

```bash
npm start
```

打开：

```txt
http://localhost:8765/
```

## 主要能力

- Claudio FM 风格的本地 AI 电台 UI
- `/` 首页和 `/player` 播放器页面
- `/api/now`、`/api/chat`、`/api/agent/chat`、`/api/player/*` 等本地接口
- `ncm-cli + mpv` 播放方向
- Apple preview 临时音乐源 fallback
- DJ 串场、队列推进、播放控制、反馈记录

## 文档入口

- [`docs/product.md`](docs/product.md)：产品目标和体验定义
- [`docs/architecture.md`](docs/architecture.md)：技术架构
- [`docs/construction-map.md`](docs/construction-map.md)：施工图 / 项目结构图
- [`docs/ui-reference.md`](docs/ui-reference.md)：UI 参考和复刻要求
- [`docs/netease-cli.md`](docs/netease-cli.md)：网易云 CLI 接入计划
- [`docs/roadmap.md`](docs/roadmap.md)：开发路线图
- [`records/progress.md`](records/progress.md)：当前进度记录
