# UI 对照记录 - 2026-05-07

## 截图文件

参考页面：

```txt
/Users/zhang/Documents/AI项目文件/opendio/records/screenshots/reference-claudio.png
```

本地页面：

```txt
/Users/zhang/Documents/AI项目文件/opendio/records/screenshots/local-opendio.png
```

## 当前结论

本地页面已使用 Claudio FM 原页面主体源码与 CSS，因此基础视觉结构与参考页面一致：

- 全屏深色 stage
- 蓝紫 fluid 背景
- 顶部 HOME / XHS / MUSIC 导航
- 中央白色圆角 card
- 黑色 header
- Claudio 头像和 Speaking 状态
- canvas 波形
- meta 区
- transcript 区
- 底部 player bars
- 右下角 tweaks panel

## 已处理的非原版新增元素

之前为了接 `/api/chat` 加过可见输入框，会破坏 1:1 视觉。

当前已改为：

- 输入框默认隐藏
- 点击 Claudio 标题唤出
- 按 `/` 唤出
- 按 `Esc` 隐藏
- 提交后自动隐藏

因此默认视觉基本回到原版 demo 状态。

## 当前仍可能存在的差异

1. 动态内容差异

参考页面固定显示：

- `mmguo's Pilot Episode`
- `If — Bread`

本地页面会从 `/api/now` 动态替换为当前歌曲，例如：

- `Space Song`
- `Space Song — Beach House`

这是功能性差异，不是布局设计差异。

2. 字幕内容差异

参考页面是硬编码英文 transcript。  
本地页面会把 AI DJ 文案替换进去，目前可能出现中文文案。

3. timing 差异

参考页面的字幕 timing 和音频 demo 是固定编排的。  
本地页面的动态 transcript timing 目前是估算。

4. 动态标题适配

已加两行截断，防止长歌名撑坏卡片。

## Phase 1 下一步

Phase 1 视觉基准暂时锁定。后续不要再自由设计 UI，所有新增功能默认隐藏或弱化，避免破坏 Claudio FM 的原版视觉。
