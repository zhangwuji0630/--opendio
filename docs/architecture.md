# opendio 技术架构

## 当前推荐架构

```txt
Web/PWA UI
  ↓ HTTP / SSE / WebSocket
Local Node.js Server
  ↓
Context Builder
  ↓
AI DJ Brain
  ↓
Music Provider Layer
  ├─ Apple Preview Provider, MVP 临时
  └─ Netease CLI Provider, 下一阶段核心
  ↓
Playback / TTS / Transcript
```

## 模块说明

### Web/PWA UI

负责：

- 展示 opendio 电台界面
- 播放 DJ 旁白和音乐
- 显示字幕/歌词
- 接收轻量用户输入
- 展示当前播放状态

当前 UI 参考 Claudio FM，先 1:1 复原。

### Local Node.js Server

负责：

- 提供 `/api/now`
- 提供 `/api/chat`
- 提供 `/api/next`
- 管理播放状态
- 拼接上下文
- 调用 DJ Brain
- 调用音乐 Provider

当前原型目录：

```txt
/Users/zhang/.openclaw/workspace/personal-ai-radio/server
```

### Context Builder

负责把这些信息整理给 AI DJ：

- 当前时间
- 用户输入
- 用户 taste
- routines
- mood rules
- 最近播放
- 天气/日程，后续接入

当前已有文件：

```txt
data/taste.md
data/routines.md
data/mood-rules.md
data/dj-profile.md
```

### AI DJ Brain

目标输出结构化 JSON：

```json
{
  "say": "我先给你放一首不会打扰你的，适合慢慢进入状态。",
  "play": ["song_id"],
  "reason": "低频稳定，人声不抢注意力",
  "segue": "接下来是……",
  "mode": "focus"
}
```

当前状态：本地 fallback 模板。后续接 Claude/LLM。

### Music Provider Layer

统一音乐源接口，让上层不关心歌曲来自哪里。

建议接口：

```js
search(query)
getTrack(id)
getPlaylist(id)
getDailyRecommend()
getLikedSongs()
getStreamUrl(id)
getLyrics(id)
```

当前：Apple/iTunes preview 临时源。  
下一步：接网易云 CLI。

### TTS

后续用于把 DJ 文案合成语音。

可选：

- 浏览器 Web Speech，最快
- macOS say，本地可用
- Fish Audio / ElevenLabs / OpenAI TTS，质感更好

### Transcript / Lyrics

两类字幕：

1. DJ 旁白字幕：来自 AI 文案 + TTS timing
2. 歌曲歌词：来自网易云歌词

目标是在 Claudio 风格 transcript 区内统一展示。
