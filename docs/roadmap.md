# opendio Roadmap

## Phase 0：资料与项目定名

状态：进行中。

- [x] 项目名确定为 opendio
- [x] 音乐应用名确定为 opendio
- [x] 创建项目资料目录
- [x] 写入产品、架构、UI、网易云、进度文档

## Phase 1：Claudio UI 复原

目标：不要自由设计，先把参考页面视觉稳定下来。

- [x] 抓取 mmguo Claudio FM 页面源码
- [x] 下载页面资源 `dj.png`、`claudio-if-intro.mp3`
- [x] 本地页面换成 Claudio 风格
- [x] 接入本地 `/api/now`
- [x] 接入本地 `/api/chat`
- [ ] 隐藏或弱化输入框，避免破坏 1:1 视觉
- [ ] 调整动态标题和字幕，避免撑坏排版
- [ ] 做一次截图对照检查

## Phase 2：音乐 Provider 抽象

目标：把 Apple preview 临时源和网易云真实源拆开。

- [ ] 建立 `server/providers/` 目录
- [ ] 封装 Apple preview provider
- [ ] 定义统一 music provider 接口
- [ ] 将现有 `server/music.js` 改成调用 provider

## Phase 3：网易云 CLI 接入

目标：让 opendio 播放用户真实音乐库。

- [ ] 探测网易云 CLI 命令
- [ ] 记录命令用法
- [ ] 实现搜索
- [ ] 实现歌单读取
- [ ] 实现红心/喜欢读取
- [ ] 实现歌曲 URL 获取
- [ ] 实现歌词获取
- [ ] 接入 UI 播放

## Phase 4：AI DJ Brain

目标：让 DJ 真正由 LLM 决策。

- [ ] 明确 DJ JSON 输出格式
- [ ] 接 Claude/LLM
- [ ] 读取 taste/routines/mood-rules
- [ ] 根据网易云音乐库选歌
- [ ] 多轮记住反馈

## Phase 5：TTS 与字幕

目标：从“文字 DJ”变成“会说话的电台”。

- [ ] 选择 TTS 方案
- [ ] 合成 DJ 旁白音频
- [ ] DJ 旁白 + 音乐 bed 混播
- [ ] 生成旁白字幕 timing
- [ ] 接网易云歌词
- [ ] transcript 区统一显示 DJ 话术和歌词

## Phase 6：私人上下文

目标：真正像私人电台。

- [ ] 接天气
- [ ] 接日程
- [ ] 接本地时间/工作状态
- [ ] 建立长期 taste 记忆
- [ ] 根据反馈调整推荐
