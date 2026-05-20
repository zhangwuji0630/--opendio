import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_NCM_COMMAND = process.env.NETEASE_CLI || '/Users/zhang/.npm-global/bin/ncm-cli';
const NCM_CONFIG_DIR = process.env.NCM_CLI_CONFIG_DIR || path.join(process.env.HOME || '', '.config/ncm-cli');
const NCM_WORKER_LOG = path.join(NCM_CONFIG_DIR, 'bg-worker.log');

function runCommand(command, args = [], { timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ''}` };
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
  });
}

function parseJSONOutput(result) {
  try { return JSON.parse(result.stdout || '{}'); } catch { return null; }
}

function commandFailed(result) {
  if (result.code !== 0) return true;
  const parsed = parseJSONOutput(result);
  return parsed && parsed.success === false;
}

function parseLrc(raw = '') {
  return String(raw)
    .split(/\r?\n/)
    .flatMap(line => {
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      const text = line.replace(/\[[^\]]+\]/g, '').trim();
      if (!matches.length || !text) return [];
      return matches.map(match => {
        const min = Number(match[1] || 0);
        const sec = Number(match[2] || 0);
        const fracRaw = match[3] || '0';
        const frac = Number(fracRaw.padEnd(3, '0').slice(0, 3)) / 1000;
        return { time: min * 60 + sec + frac, text };
      });
    })
    .filter(line => Number.isFinite(line.time) && line.text)
    .sort((a, b) => a.time - b.time);
}

function compactTrack(track) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title || track.name,
    artist: track.artist,
    album: track.album,
    provider: track.provider || track.source,
    originalId: track.originalId,
    encryptedId: track.encryptedId,
    jumpUrl: track.jumpUrl,
    coverUrl: track.coverUrl,
    duration: track.duration,
    lyrics: track.lyrics,
  };
}

function compactError(result) {
  return (result.stderr || result.stdout || `command exited with ${result.code}`).trim().slice(0, 800);
}

async function waitForPlaybackEvidence(track, startedAtMs, { timeoutMs = 8000 } = {}) {
  let lastSize = 0;
  try { lastSize = (await fs.stat(NCM_WORKER_LOG)).size; } catch {}
  const encryptedId = String(track?.encryptedId || '').toUpperCase();
  const originalId = String(track?.originalId || '');
  const title = String(track?.title || track?.name || '');
  const artist = String(track?.artist || '');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(NCM_WORKER_LOG, 'utf8');
      const fresh = raw.slice(Math.max(0, lastSize - 300));
      const tail = fresh.slice(-12000);
      const hasFreshTitle = title && artist && tail.includes(`正在播放：${title} - ${artist}`);
      const hasFreshId = encryptedId && tail.toUpperCase().includes(`ID=${encryptedId}`);
      const hasOriginal = originalId && tail.includes(originalId);
      const hasFailure = tail.includes(`已跳过：${encryptedId}`) || tail.includes('获取链接失败') || tail.includes('后台播放失败');
      if (hasFreshTitle || hasFreshId || hasOriginal) return { ok: true };
      if (hasFailure) return { ok: false, reason: 'ncm-cli reported playback failure' };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { ok: null, reason: 'no fresh playback evidence' };
}


export function createMpvPlayer({ command = DEFAULT_NCM_COMMAND } = {}) {
  let status = 'idle';
  let current = null;
  let lastError = null;
  let updatedAt = new Date().toISOString();
  let position = 0;
  let duration = null;
  let volume = null;
  let lyrics = [];

  function snapshot(extra = {}) {
    return {
      backend: 'ncm-cli+mpv',
      status,
      current,
      lastError,
      position,
      duration,
      volume,
      lyrics,
      updatedAt,
      ...extra,
    };
  }

  async function refreshState() {
    const result = await runCommand(command, ['state'], { timeoutMs: 5000 });
    updatedAt = new Date().toISOString();
    if (result.code !== 0) return snapshot({ ok: false, code: result.code });
    const parsed = parseJSONOutput(result);
    const playerState = parsed?.state || parsed;
    if (playerState && typeof playerState === 'object') {
      if (playerState.status) status = playerState.status;
      if (Number.isFinite(Number(playerState.position))) position = Number(playerState.position);
      if (Number.isFinite(Number(playerState.duration))) duration = Number(playerState.duration);
      if (Number.isFinite(Number(playerState.volume))) volume = Number(playerState.volume);
      else if (volume == null) volume = 80;
      if (!current && playerState.title) current = { title: playerState.title };
      if (!duration && current?.duration) duration = Number(current.duration) / (Number(current.duration) > 10000 ? 1000 : 1);
    }
    return snapshot({ ok: true, code: result.code });
  }

  async function loadLyrics(track) {
    lyrics = [];
    const songId = track?.encryptedId || track?.id || track?.originalId;
    if (!songId) return lyrics;
    const result = await runCommand(command, ['song', 'lyric', '--songId', String(songId), '--output', 'json'], { timeoutMs: 12000 });
    if (result.code !== 0) return lyrics;
    const parsed = parseJSONOutput(result);
    const raw = parsed?.data?.lyric || parsed?.lyric || '';
    lyrics = parseLrc(raw).slice(0, 500);
    return lyrics;
  }

  async function ensureLyricsForCurrent(track = current) {
    if (!lyrics.length && track) await loadLyrics(track).catch(() => []);
    return lyrics;
  }

  async function control(args, nextStatus) {
    const result = await runCommand(command, args, { timeoutMs: 10000 });
    updatedAt = new Date().toISOString();
    if (commandFailed(result)) {
      status = 'error';
      lastError = compactError(result);
      return snapshot({ ok: false, code: result.code });
    }
    status = nextStatus;
    lastError = null;
    if (args[0] === 'pause') {
      await refreshState().catch(() => snapshot());
      if (status === 'stopped') status = 'paused';
    } else {
      await refreshState().catch(() => snapshot());
      if (args[0] === 'resume' && status === 'stopped') status = 'playing';
    }
    return snapshot({ ok: true, code: result.code });
  }

  return {
    get status() {
      refreshState().catch(() => {});
      return snapshot();
    },

    refreshState,
    ensureLyricsForCurrent,

    async probe() {
      const [login, player] = await Promise.all([
        runCommand(command, ['login', '--check'], { timeoutMs: 10000 }),
        runCommand(command, ['config', 'get', 'player'], { timeoutMs: 10000 }),
      ]);
      return snapshot({
        ok: login.code === 0 && player.code === 0 && /mpv/i.test(player.stdout + player.stderr),
        loginCode: login.code,
        playerCode: player.code,
        player: (player.stdout || player.stderr).trim(),
      });
    },

    async playTrack(track) {
      if (!track) {
        status = 'error';
        lastError = 'No track selected.';
        return snapshot({ ok: false });
      }
      current = compactTrack(track);
      position = 0;
      duration = Number(track.duration) > 0 ? Number(track.duration) / (Number(track.duration) > 10000 ? 1000 : 1) : null;
      lyrics = [];
      updatedAt = new Date().toISOString();
      if ((track.provider || track.source) !== 'netease-cli' || !track.originalId || !track.encryptedId) {
        const query = [track.title || track.name, track.artist].filter(Boolean).join(' ').trim();
        if (!query) {
          status = 'error';
          lastError = 'Track missing playable Netease ids and searchable title.';
          return snapshot({ ok: false });
        }
        const publicResult = track.url ? await runCommand('open', [track.url], { timeoutMs: 10000 }) : null;
        if (publicResult && publicResult.code === 0) {
          status = 'playing';
          lastError = 'ncm-cli track ids unavailable; opened public preview URL fallback.';
          return snapshot({ ok: true, code: 0, fallback: 'open-url' });
        }
        status = 'error';
        lastError = 'Netease track missing originalId/encryptedId.';
        return snapshot({ ok: false });
      }

      status = 'starting';
      const startedAtMs = Date.now();
      const result = await runCommand(command, [
        'play',
        '--song',
        '--encrypted-id', String(track.encryptedId),
        '--original-id', String(track.originalId),
      ], { timeoutMs: 20000 });
      updatedAt = new Date().toISOString();
      if (commandFailed(result)) {
        status = 'error';
        lastError = compactError(result);
        return snapshot({ ok: false, code: result.code });
      }
      const evidence = await waitForPlaybackEvidence(track, startedAtMs).catch(() => ({ ok: null }));
      if (evidence.ok === false) {
        status = 'error';
        lastError = evidence.reason || 'ncm-cli playback failed after command success.';
        return snapshot({ ok: false, code: result.code });
      }
      status = 'playing';
      position = 0;
      duration = Number(track.duration) > 0 ? Number(track.duration) / (Number(track.duration) > 10000 ? 1000 : 1) : duration;
      lastError = evidence.ok === null ? (evidence.reason || null) : null;
      await loadLyrics(track).catch(() => []);
      await refreshState().catch(() => snapshot());
      if (status === 'stopped' && evidence.ok) status = 'playing';
      if (status === 'playing') lastError = null;
      return snapshot({ ok: true, code: result.code, playbackEvidence: evidence.ok });
    },

    async seek(seconds) {
      const safe = Math.max(0, Number(seconds) || 0);
      const result = await runCommand(command, ['seek', String(safe)], { timeoutMs: 10000 });
      updatedAt = new Date().toISOString();
      if (result.code !== 0) {
        lastError = compactError(result);
        return snapshot({ ok: false, code: result.code });
      }
      position = safe;
      lastError = null;
      await refreshState().catch(() => snapshot());
      return snapshot({ ok: true, code: result.code });
    },

    async volume(level) {
      const safe = Math.max(0, Math.min(100, Math.round(Number(level) || 0)));
      const result = await runCommand(command, ['volume', String(safe)], { timeoutMs: 10000 });
      updatedAt = new Date().toISOString();
      if (result.code !== 0) {
        lastError = compactError(result);
        return snapshot({ ok: false, code: result.code });
      }
      volume = safe;
      lastError = null;
      await refreshState().catch(() => snapshot());
      return snapshot({ ok: true, code: result.code });
    },

    async lyrics(track = current) {
      await loadLyrics(track).catch(() => []);
      return snapshot({ ok: true });
    },

    pause() { return control(['pause'], 'paused'); },
    resume() { return control(['resume'], 'playing'); },
    stop() { return control(['stop'], 'stopped'); },
    next() { return control(['next'], 'playing'); },
    prev() { return control(['prev'], 'playing'); },
  };
}
