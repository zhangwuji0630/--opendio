# opendio

opendio 是一个 Personal AI Radio Agent：不是普通音乐播放器，而是一个会理解当前场景、选择音乐、像 DJ 一样说话、控制播放并记住反馈的私人 AI 电台。

项目灵感来自 mmguo 的 Claudio FM：

- 原型参考：<https://mmguo.dev/claudio-fm/>
- 目标：做一个属于自己的 AI 音乐电台应用，应用名也叫 **opendio**。

## 当前定位

opendio = open + audio + radio 的私人 AI 电台。

它应该能做到：

1. 理解用户当前状态：时间、心情、工作场景、天气、日程等。
2. 从用户真实音乐库里选择合适的音乐。
3. 像电台 DJ 一样自然地说一段串场话。
4. 播放 DJ 旁白、音乐和歌词/字幕。
5. 记住用户反馈，逐渐形成个人音乐 taste。

## 当前阶段

当前处于 **MVP 原型阶段**。

已经有一个本地原型位于：

```txt
/Users/zhang/.openclaw/workspace/personal-ai-radio
```

本地运行地址：

```txt
http://localhost:8765/
```

当前重点不是继续自由设计 UI，而是先尽量复原 Claudio FM 的页面风格，再把 opendio 的真实音乐能力接进去。

## 文档入口

- [`docs/product.md`](docs/product.md)：产品目标和体验定义
- [`docs/architecture.md`](docs/architecture.md)：技术架构
- [`docs/ui-reference.md`](docs/ui-reference.md)：UI 参考和复刻要求
- [`docs/netease-cli.md`](docs/netease-cli.md)：网易云 CLI 接入计划
- [`docs/roadmap.md`](docs/roadmap.md)：开发路线图
- [`records/progress.md`](records/progress.md)：当前进度记录
