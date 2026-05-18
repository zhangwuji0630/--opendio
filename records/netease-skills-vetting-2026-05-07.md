# NetEase skills 安装前审查报告 - 2026-05-07

## Source Check

- Source: GitHub
- Repo: `https://github.com/NetEase/skills`
- Owner: `NetEase`
- Description: `agent skills`
- Stars: 160
- Forks: 3
- Default branch: `master`
- Last GitHub updated: `2026-05-05T14:51:10Z`
- Last pushed: `2026-03-31T06:42:40Z`
- License: repo root 未声明；各 skill 内含 Apache-2.0 `LICENSE.txt`

## Files Reviewed

Downloaded archive and reviewed 9 files, 1380 lines total:

```txt
README.md
.gitignore
ncm-cli-setup/SKILL.md
ncm-cli-setup/LICENSE.txt
ncm-cli-setup/scripts/install_mpv.py
netease-music-cli/SKILL.md
netease-music-cli/LICENSE.txt
netease-music-assistant/SKILL.md
netease-music-assistant/LICENSE.txt
```

## Repo Structure

```txt
ncm-cli-setup           # 安装配置 ncm-cli / mpv
netease-music-cli       # 调用 ncm-cli 搜索、播放、控制、歌单
netease-music-assistant # 推荐/偏好分析/定时推送等上层助手
```

## Confirmed Install/Config Flow

文档要求：

```bash
npm install -g @music163/ncm-cli
ncm-cli --version
ncm-cli config set appId <你的AppId>
ncm-cli config set privateKey <你的PrivateKey>
ncm-cli config set player mpv      # 或 orpheus
ncm-cli login --background
```

播放功能依赖：

- `mpv` 内置播放器，或
- `orpheus` 调用 macOS 网易云音乐客户端

## Permissions / Actions Requested

### Files

可能读写：

```txt
~/.config/ncm/ncm-preference.json
~/.config/ncm/ncm-history.json
~/.config/ncm/ncm-schedule.json
```

可能配置 ncm-cli 自身凭证位置，具体由 `@music163/ncm-cli` 决定。

### Commands

明确涉及：

```bash
npm install -g @music163/ncm-cli
ncm-cli --version
ncm-cli configure / config set ...
ncm-cli login --background
ncm-cli login --check
ncm-cli commands
ncm-cli search song --keyword "xxx" --userInput "..."
ncm-cli playlist create --playlistName "..." --userInput "..."
mpv --version
python3 scripts/install_mpv.py
brew install mpv
sudo port install mpv
sudo apt-get update -q && sudo apt-get install -y mpv
sudo dnf install -y mpv
sudo yum install -y epel-release && sudo yum install -y mpv
sudo pacman -S --noconfirm mpv
sudo zypper install -y mpv
winget/choco/scoop install mpv
```

### Network

- GitHub: install skill / repo
- npm registry: install `@music163/ncm-cli`
- 网易云音乐开放平台 / 网易云 API
- 登录授权链接
- mpv 安装来源取决于包管理器

### Credentials

明确需要：

```txt
appId
privateKey
网易云账号登录授权
```

## Red Flags / Risks

### 1. Credential handling: HIGH

Skill 文档让用户配置 `appId` 与 `privateKey`。这本身是功能必需，但属于敏感凭证。

建议：

- 不把 privateKey 写进项目 md、memory、日志或 git。
- 配置时只通过 `ncm-cli config set privateKey ...` 或官方交互流程。
- 配置后检查 shell history 是否会记录敏感值；如会，改用交互配置或临时禁用历史。

### 2. Global npm install: MEDIUM-HIGH

`npm install -g @music163/ncm-cli` 会安装第三方全局包并暴露命令。

建议：

- 安装前单独审 `@music163/ncm-cli` npm 包信息。
- 优先安装官方包名，不使用非官方替代。

### 3. mpv installer has sudo/package-manager commands: HIGH if executed automatically

`install_mpv.py` 会根据系统调用包管理器，Linux/macOS 某些路径使用 `sudo`。macOS Homebrew 路径为 `brew install mpv`，但 MacPorts 用 `sudo port install mpv`。

建议：

- 不自动运行 `python3 scripts/install_mpv.py`。
- 本机 macOS 可先检查 `mpv --version`。
- 若需要安装，优先用户确认后用明确命令安装。
- 若想避免 mpv，可使用 `orpheus` 调用本地网易云客户端。

### 4. netease-music-assistant has scheduler/crontab behavior: HIGH / not needed for opendio MVP

`netease-music-assistant` 包含调度管理，会更新 `ncm-schedule.json`，并指示修改系统 crontab。

这不适合 opendio 当前阶段；OpenClaw 已有 cron 工具，不应让 skill 自行写系统 crontab。

建议：

- 当前不要启用/使用 `netease-music-assistant`。
- 只考虑 `ncm-cli-setup` 和 `netease-music-cli` 的必要部分。
- 定时推荐后续统一用 OpenClaw cron，而不是系统 crontab。

### 5. Feishu/IM push behavior: MEDIUM-HIGH / not needed

assistant skill 文档提到通过 OpenClaw 向飞书等 IM 渠道推送推荐和封面图片。

建议：

- 当前 opendio 不需要对外推送。
- 禁止默认向飞书/IM 发送内容，除非用户单独确认。

### 6. Content safety policy embedded in skill: PRODUCT constraint, not security risk

两个 skill 都要求对用户搜索内容做内容安全检查。这会影响搜索行为，但不是系统安全风险。

## Risk Level

🔴 HIGH

原因：涉及 privateKey、登录授权、全局 npm 安装、潜在包管理器安装、系统 crontab、IM 推送能力。

## Verdict

⚠️ INSTALL WITH CAUTION / PARTIAL USE ONLY

不建议整套无脑安装并全量启用。建议路线：

1. 先单独审 `@music163/ncm-cli` npm 包。
2. 如果通过，再只安装/配置 `ncm-cli`。
3. opendio 代码直接调用 `ncm-cli`，不启用 `netease-music-assistant` 的调度和推送逻辑。
4. 播放器优先选：
   - `orpheus`：调用本地网易云客户端，少装 mpv；或
   - `mpv`：如果确实需要内置播放，再单独确认安装。
5. 凭证配置不要写入项目文档和日志。

## Recommended Next Step

下一步不是直接安装 NetEase skills，而是审 npm 包：

```bash
npm view @music163/ncm-cli --json
npm pack @music163/ncm-cli --dry-run
```

如需安装，建议后续明确执行：

```bash
npm install -g @music163/ncm-cli
ncm-cli --version
ncm-cli commands
```

但安装前需用户再次确认。
