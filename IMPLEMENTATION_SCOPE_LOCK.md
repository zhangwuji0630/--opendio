# opendio implementation scope lock

This file is the implementation guardrail for the current build.

## User instruction

全部统一一起落，可以用多 agent 一起完成，模型必须是 gpt-5.5，必须确保任务不跑偏。

## Non-negotiable constraints

1. Do not freely redesign UI.
2. Keep the existing Claudio white-card pixel player as the Player Detail page.
3. Do not overwrite the white-card player with a new ugly layout.
4. Build a separate Radio Home page for the first-level app view.
5. Radio Home must inherit Claudio/mmguo pixel visual language:
   - dark dotted/pixel background
   - controlled blue/violet glow
   - thin borders
   - pixel/dot-matrix typography
   - green live status
   - restrained black/gray panels
6.常驻输入框是主功能，不要隐藏成快捷键或 TALK 临时入口。
7. Debug fields such as BACKEND/PLAYER can exist only as small hidden/dev status, not main product UI.
8. No privateKey, secrets, tokens in chat/docs/memory/logs/git.
9. Current backend netease-cli + mpv playback must remain usable.
10. Model for subagents must be gpt-5.5.

## Target pages

### `/` Radio Home

First-level app page.

Must include:
- Claudio header/avatar
- big time/date/ON AIR
- now playing
- playback controls
- queue
- Claudio live chat/reply stream
- always-visible input: `Say something to the DJ...`
- mic button placeholder
- send button
- connected status
- visual style consistent with current Claudio pixel design

### `/player` Player Detail

Second-level player page.

Must be the restored existing Claudio white-card page.

Must include:
- current song
- play/pause
- transcript/DJ text
- later lyrics/progress

Do not visually redesign.

### Profile/Taste panel

Opened from Radio Home by clicking avatar/Claudio.

Must include:
- Claudio identity
- taste.md summary
- routines/mood tags
- ON AIR / GENRES / LISTENER stats
- style consistent with Radio Home, not a random new layout

## Functional target

Implement together:

1. Routing/static serving
   - `/` -> Radio Home
   - `/player` -> white-card Player Detail
   - avoid breaking existing assets

2. Radio Home frontend
   - renders `/api/now`
   - submits `/api/chat`
   - controls `/api/player/play|pause|resume|stop|next|prev`
   - chat reply updates without hiding input

3. Player Detail frontend
   - keeps old visual design
   - still renders `/api/now`
   - play/pause works with mpv for netease-cli tracks

4. Backend queue
   - improve `/api/now` queue so it uses real netease daily/library candidates when provider is netease-cli
   - fallback local only if netease fails
   - do not add write actions to 网易云

5. Player state
   - expose status cleanly
   - do not overclaim mpv position/duration if not implemented

6. Profile data
   - read existing data files if needed
   - no sensitive data

## Acceptance checks

- `node --check server/index.js`
- `node --check server/player/mpv-player.js`
- `/` served page contains Radio Home markers and constant input
- `/player` served page contains white-card Claudio player markers
- `/api/now` returns `provider=netease-cli` when service is launched with `MUSIC_PROVIDER=netease-cli NETEASE_CLI_DRY_RUN=0`
- `/api/player/probe` returns ok true if mpv/ncm-cli are ready
- No `LOGIN/DARK/LIGHT` ugly clone may replace the restored white-card player
- No secrets written

## Implementation style

Small, conservative edits. Prefer adding files over destroying the working page. If unsure, stop and report.
