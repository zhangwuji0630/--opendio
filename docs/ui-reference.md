# opendio UI 参考与复刻要求

## 参考对象

主参考：

<https://mmguo.dev/claudio-fm/>

当前用户要求：

> UI 要 1:1 复原，不能按 assistant 自己想法设计，除非用户明确允许。

## Claudio FM 页面风格拆解

### 整体

- 全屏固定舞台
- 深色背景
- 蓝紫色流体模糊渐变
- 中央白色圆角卡片
- 顶部极简导航：HOME / XHS / MUSIC
- 整体像一个精致的 AI 电台 demo，而不是传统播放器

### 背景

- radial gradient 深色底
- 多个 `.fluid` 圆形模糊色块
- 蓝色、紫色、accent 色块缓慢动画
- 轻微 grain/noise

### 中央卡片

- 宽度约 440px
- 高度接近 780px 或视口内最大高度
- 大圆角，强阴影
- 上方黑色 header，下方白色 body

### Header

- 黑色到深灰渐变
- 点阵纹理
- Claudio 名字
- 小头像
- Speaking / Paused 状态
- 右上角时间
- 底部 canvas 波形

### Body

- 歌曲标题区域
- subtitle / artist 信息
- mini player
- transcript 字幕区
- 底部条形播放器

### Transcript

- 浅灰白点阵背景
- 圆角容器
- 自动滚动
- 当前词高亮
- 未读词较浅

## 当前本地 UI 状态

本地原型已将 `personal-ai-radio/web/index.html` 替换为 Claudio FM 页面源码风格，并下载了：

- `dj.png`
- `claudio-if-intro.mp3`

同时接入了本地 `/api/now` 和 `/api/chat`，让页面能更新当前歌曲与 DJ 文案。

## 当前不足

- 输入框是后加的，不属于原始 Claudio 页面，需要后续隐藏或弱化。
- 动态歌曲标题可能破坏原页面原本精致排版。
- 字幕 timing 目前是估算，不是精确 TTS/Whisper 对齐。
- 原页面是固定 demo，我们现在要变成真实动态应用，需要小心不破坏视觉。

## 下一步 UI 要求

1. 先锁住 Claudio 原版视觉。
2. 把输入入口改成隐藏式或轻量唤出式。
3. 不新增明显破坏排版的大块聊天区。
4. 动态内容必须适配原版排版，而不是让 UI 跟着内容乱变。
5. 后续如需重新设计，必须等用户明确允许。
