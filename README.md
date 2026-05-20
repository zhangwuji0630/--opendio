# opendio

opendio 是一个私人 AI 电台应用：它会理解你当前的场景，帮你选歌、像 DJ 一样说话、控制播放，并记住你的反馈。

项目灵感来自 mmguo 的 Claudio FM：

- 原型参考：<https://mmguo.dev/claudio-fm/>
- 目标：做一个属于自己的 AI 音乐电台应用，应用名叫 **opendio**。

## 当前状态

当前仓库已经包含可运行的 MVP 原型源码，命名也已经统一为 **opendio**。

主要目录：

- `server/`：本地 Node.js 服务、播放器控制、radio agent、TTS、provider 接入
- `web/`：前端静态页面，包括首页和播放器页
- `data/`：用户品味、歌单、DJ 人设和设置数据
- `public/`：运行时静态资源目录
- `docs/`：产品、架构、路线图和接入文档
- `records/`：开发进度和过程记录

## 快速开始

```bash
npm start
```

打开：

```txt
http://localhost:8765/
```

如果你在另一台电脑上拉这份仓库，先确认下面几个目录都存在：

```txt
server/
web/
data/
package.json
```

## 本机依赖说明

当前 `package.json` 暂时没有 npm 依赖，Node.js 可以直接运行。

部分播放能力依赖本机环境：

- `mpv`：用于本地播放控制
- `ncm-cli`：用于网易云音乐 CLI 播放/搜索方向
- Fish Audio API Key：可选，用于外部 TTS；没有时会 fallback 到本机可用方案

环境变量可参考：

```bash
cp .env.example .env
```

## 主要接口

- `GET /api/now`：当前电台状态
- `POST /api/chat`：基础聊天/点歌入口
- `POST /api/agent/chat`：OpenClaw agent 聊天入口
- `POST /api/player/play`：播放
- `POST /api/player/pause`：暂停
- `POST /api/player/resume`：继续
- `POST /api/player/next`：下一首
- `POST /api/player/prev`：上一首
- `POST /api/player/seek`：跳转进度
- `POST /api/player/volume`：调节音量

## 页面入口

- `/`：opendio 首页
- `/player`：播放器详情页

## 主要能力

- Claudio FM 风格的本地 AI 电台 UI
- 首页和播放器页面联动
- `ncm-cli + mpv` 播放方向
- Apple preview 临时音乐源 fallback
- DJ 串场、队列推进、播放控制、反馈记录
- OpenClaw agent 聊天接入

## 文档入口

- [`docs/product.md`](docs/product.md)：产品目标和体验定义
- [`docs/architecture.md`](docs/architecture.md)：技术架构
- [`docs/construction-map.md`](docs/construction-map.md)：施工图 / 项目结构图
- [`docs/ui-reference.md`](docs/ui-reference.md)：UI 参考和复刻要求
- [`docs/netease-cli.md`](docs/netease-cli.md)：网易云 CLI 接入计划
- [`docs/roadmap.md`](docs/roadmap.md)：开发路线图
- [`records/progress.md`](records/progress.md)：当前进度记录
