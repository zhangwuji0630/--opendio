# 网易云 CLI 接入计划

## 背景

用户已经申请好了网易云的云音乐 CLI 版。下一阶段 opendio 应从 Apple preview 临时源，切换到网易云真实音乐库。

## 目标

让 opendio 可以：

- 搜索网易云歌曲
- 读取用户歌单
- 读取红心/喜欢的音乐
- 读取每日推荐
- 获取可播放 URL
- 获取歌词
- 获取封面、歌手、专辑信息
- 根据用户上下文从真实音乐库选歌

## 建议模块

```txt
server/providers/netease-cli.js
server/providers/apple-preview.js
server/music-provider.js
```

`music-provider.js` 做统一抽象，避免 UI 和 DJ Brain 直接绑定某个平台。

## 第一阶段：CLI 探测

先确认网易云 CLI 的实际命令形态：

- 登录状态
- 搜歌命令
- 歌单命令
- 获取歌曲 URL 命令
- 获取歌词命令
- 输出是否支持 JSON

需要记录：

```txt
docs/netease-cli-command-notes.md
```

## 第二阶段：Provider 封装

实现：

```js
search(query)
getTrack(id)
getPlaylist(id)
getLikedSongs()
getDailyRecommend()
getStreamUrl(id)
getLyrics(id)
```

## 第三阶段：本地缓存

缓存用户音乐库，避免每次都调 CLI：

```txt
data/library/netease-tracks.json
data/library/playlists.json
data/library/liked-songs.json
data/library/listening-history.json
```

## 第四阶段：接入 DJ Brain

让 AI DJ 从真实音乐库选歌，而不是从固定几首 demo 里选。

输入：

- 用户当前请求
- 时间
- mood rules
- taste
- 网易云歌单摘要
- 最近播放

输出：

- 推荐歌曲 id
- DJ 文案
- 推荐理由
- 后续队列

## 注意事项

- 不要一开始就做复杂推荐系统。
- 先跑通“搜索/歌单 → 拿到 URL → 页面播放”。
- 登录态、cookie、账号信息不要写进文档或仓库。
- 如果 CLI 输出不稳定，先做适配层和本地缓存。
