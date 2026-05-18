# 网易云 CLI 命令探测记录

## 2026-05-07 初次探测

目标：确认用户已申请/准备的“网易云的云音乐 CLI 版”在本机的实际可执行命令、参数形态和输出格式。

## 已探测命令

检查了以下候选命令：

```txt
netease
ncm
musicbox
musicbox2
ncmdump
netease-cloud-music
ncm-cli
cloudmusic
cloud-music
YesPlayMusic
musicfox
go-musicfox
```

结果：当前 shell PATH 中暂未发现这些可执行命令。

## npm global 探测

执行过：

```txt
npm list -g --depth=0 | grep -Ei 'netease|cloud|music|ncm|163|musicfox'
```

结果：未发现明显相关全局 npm 包。

## brew 探测

执行过：

```txt
brew list | grep -Ei 'netease|cloud|music|ncm|163|musicfox'
```

结果：未发现明显相关 brew 包。

## 本地文件探测

发现本机存在网易云音乐桌面应用相关目录：

```txt
/Users/zhang/Music/网易云音乐
/Users/zhang/Library/Application Scripts/com.netease.163music
/Users/zhang/Library/Application Scripts/43B53CMF9D.com.netease.163music
/Users/zhang/Library/Group Containers/43B53CMF9D.com.netease.163music
/Users/zhang/Library/Containers/com.netease.163music
```

这说明桌面客户端或相关数据目录存在，但目前没有在 PATH 中找到 CLI 命令。

## 当前结论

`opendio` 的 `netease-cli` provider 先保留 dry-run 骨架。下一步需要用户提供或确认：

1. CLI 的安装方式或项目名。
2. 实际可执行命令名。
3. 是否已有登录态。
4. 基础命令帮助输出，例如：

```txt
<命令> --help
```

## 后续接入目标

确认命令后，需要补全这些能力：

```js
search(query)
getTrack(id)
getPlaylist(id)
getLikedSongs()
getDailyRecommend()
getStreamUrl(id)
getLyrics(id)
```

## 安全约束

- 不读取或记录 cookie、token、账号敏感信息。
- 不把登录态写进文档。
- 先只记录命令形态和非敏感输出。


## 2026-05-07 开发平台确认

用户说明：所谓“CLI”不是本机已有命令，而是在网易云音乐开放平台申请的 **云音乐CLI / 网易云音乐 CLI** 能力。

入口：

```txt
https://developer.music.163.com/st/developer/
```

可公开访问的开发平台文档搜索接口：

```txt
GET https://developer.music.163.com/api/openplatform/apidoc/search?keyword=CLI&limit=20&offset=0
```

搜索结果确认存在这些文档：

- `云音乐CLI`
- `网易云音乐 CLI`
- `OpenClaw ncm-cli 快速上手指南`

已通过浏览器自动化打开文档：

```txt
https://developer.music.163.com/st/developer/document?docId=f29d362acaa7459ab6ce050eb4d34e26
```

文档标题：`OpenClaw ncm-cli 快速上手指南`

### 文档关键信息

文档说明：在 OpenClaw 中安装和配置网易云音乐命令行工具 `ncm-cli`，用于智能音乐推荐与播放功能。

前置要求：

- 已安装 OpenClaw 客户端
- 已完成网易云音乐开放平台入驻流程

安装步骤：

在 OpenClaw 对话框中输入：

```txt
https://github.com/NetEase/skills，你好，请帮忙安装这个仓库下的 skills，并按引导安装 ncm-cli
```

凭证配置：

`appId` 和 `privateKey` 从网易云音乐开放平台后台获取。文档示例让用户通过对话提供：

```txt
你好，appId 和 privateKey 信息如下：
appId = b30xxxxx
privateKey = xxxxxx
请帮忙完成配置
```

登录：

```txt
请发起后台登录，并将登录链接提供给我
```

系统会生成登录链接，用户在浏览器完成账号授权。

功能示例：

```txt
能根据我的听歌偏好给我推荐 3 首歌吗？请同时给出推荐理由
```

支持能力包括：

- 歌曲搜索与播放
- 播放控制：暂停、切换、音量调节
- 歌单管理
- 音乐偏好分析

### 当前结论

下一步不应继续在 PATH 中盲找 `netease`。正确方向是安装/接入网易官方 `ncm-cli` OpenClaw skill：

```txt
https://github.com/NetEase/skills
```

但因为这涉及第三方 skill/凭证/privateKey/登录授权，必须先经过用户确认与安全审查。不要擅自安装或让用户直接粘贴 privateKey 到普通项目文档。
