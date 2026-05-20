import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_COMMAND = '/Users/zhang/.npm-global/bin/ncm-cli';
const SAFE_FALLBACK_QUERY = '周杰伦';
const NCM_CONFIG_DIR = process.env.NCM_CLI_CONFIG_DIR || path.join(process.env.HOME || '', '.config/ncm-cli');
const NCM_QUEUE_FILE = path.join(NCM_CONFIG_DIR, 'queue.json');
const NCM_WORKER_LOG = path.join(NCM_CONFIG_DIR, 'bg-worker.log');

function isDryRun(value) {
  if (process.env.MUSIC_PROVIDER === 'netease-cli') return false;
  if (value === undefined) return true;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function runCommand(command, args = [], { timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
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

function parseJsonResult(result) {
  if (result.code !== 0) {
    throw new Error(`ncm-cli exited with ${result.code}: ${result.stderr.slice(0, 300)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ncm-cli returned non-JSON output: ${error.message}`);
  }
}

function extractSongs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload?.result?.songs)) return payload.result.songs;
  return [];
}

function artistName(song) {
  const artists = song.artists || song.fullArtists || song.ar || [];
  if (Array.isArray(artists) && artists.length) {
    return artists.map(a => a?.name).filter(Boolean).join(' / ');
  }
  return song.artist || song.author || '未知艺人';
}

function albumName(song) {
  if (typeof song.album === 'string') return song.album;
  return song.album?.name || song.al?.name || '';
}

function isPlayable(song) {
  if (song.visible === false) return false;
  if (song.playFlag === false) return false;
  return true;
}

function mapSong(song, index = 0) {
  const originalId = song.originalId ?? song.songId ?? song.resourceId ?? song.id;
  const encryptedId = song.id && song.id !== originalId ? song.id : song.encryptedId;
  const title = song.title || song.name || '未知歌曲';
  return {
    id: String(originalId ?? encryptedId ?? `netease-${index}`),
    title,
    name: title,
    artist: artistName(song),
    album: albumName(song),
    coverUrl: song.coverImgUrl || song.coverUrl || song.album?.coverImgUrl || song.al?.picUrl || null,
    originalId,
    encryptedId,
    visible: song.visible !== false,
    playFlag: song.playFlag !== false,
    jumpUrl: song.jumpUrl || (originalId ? `orpheus://song/${originalId}` : null),
    duration: song.duration || song.dt || null,
    reason: song.alg ? `来自网易云每日推荐：${song.alg}` : '来自网易云音乐 ncm-cli',
    source: 'netease-cli',
    provider: 'netease-cli',
    raw: undefined,
  };
}

function scoreTrack(track, userText = '', env = {}) {
  const text = userText.toLowerCase();
  const hay = `${track.title} ${track.artist} ${track.album} ${track.reason || ''}`.toLowerCase();
  let score = Math.random() * 0.5;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (hay.includes(token)) score += 2;
  }
  const hour = env.hour ?? new Date().getHours();
  if (hour >= 20 || hour < 6) score += 0.2;
  return score;
}

export function createNeteaseCliProvider({
  command = process.env.NETEASE_CLI || DEFAULT_COMMAND,
  dryRun = isDryRun(process.env.NETEASE_CLI_DRY_RUN),
} = {}) {
  async function runJson(args, options) {
    const result = await runCommand(command, args, options);
    return parseJsonResult(result);
  }


  async function logTitleMap() {
    try {
      const raw = await fs.readFile(NCM_WORKER_LOG, 'utf8');
      const byEncryptedId = new Map();
      let pending = null;
      for (const line of raw.split(/\r?\n/)) {
        const playing = line.match(/正在播放：(.+?) - (.+?) \|/);
        if (playing) {
          pending = { title: playing[1].trim(), artist: playing[2].trim() };
          continue;
        }
        const session = line.match(/session 已保存: id=([0-9A-Fa-f]{32})/);
        if (session && pending) {
          byEncryptedId.set(session[1].toUpperCase(), pending);
        }
      }
      return byEncryptedId;
    } catch {
      return new Map();
    }
  }

  async function readQueueSongs() {
    try {
      const [raw, names] = await Promise.all([fs.readFile(NCM_QUEUE_FILE, 'utf8'), logTitleMap()]);
      const parsed = JSON.parse(raw);
      return (parsed.items || []).map((item, index) => {
        const encryptedId = item.encryptedId || (/^[0-9A-Fa-f]{32}$/.test(item.url || '') ? item.url : null);
        const named = encryptedId ? names.get(String(encryptedId).toUpperCase()) : null;
        const title = item.title && item.title !== item.encryptedId ? item.title : (named?.title || '');
        const artist = item.artist || named?.artist || '';
        return mapSong({
          id: encryptedId || item.originalId || item.url,
          originalId: item.originalId,
          encryptedId,
          title,
          name: title,
          artist,
          duration: item.duration || null,
          visible: true,
          playFlag: true,
        }, index);
      }).filter(track => track.originalId && track.encryptedId);
    } catch {
      return [];
    }
  }

  async function readWorkerLogSongs() {
    try {
      const raw = await fs.readFile(NCM_WORKER_LOG, 'utf8');
      const rows = [];
      const re = /正在播放：(.+?) - (.+?) \|/g;
      let match;
      while ((match = re.exec(raw))) {
        rows.push({ title: match[1].trim(), artist: match[2].trim() });
      }
      return rows.slice(-30).map((song, index) => mapSong({ ...song, id: `log-${index}`, visible: true, playFlag: true }, index));
    } catch {
      return [];
    }
  }

  async function recommendDaily() {
    const queueSongs = await readQueueSongs();
    if (queueSongs.length) return queueSongs;
    return readWorkerLogSongs();
  }

  async function searchSongs(query = SAFE_FALLBACK_QUERY) {
    const safeQuery = String(query || SAFE_FALLBACK_QUERY).slice(0, 80).toLowerCase();
    const local = [...await readQueueSongs(), ...await readWorkerLogSongs()];
    return local.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(safeQuery) || safeQuery.split(/\s+/).some(token => token && `${track.title} ${track.artist}`.toLowerCase().includes(token)));
  }

  async function favoriteLibrary() {
    return readQueueSongs();
  }

  async function libraryCandidates() {
    const seen = new Set();
    const merged = [];
    const add = (songs) => {
      for (const song of songs || []) {
        const key = song.originalId || song.id || song.encryptedId || `${song.title}:${song.artist}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(song);
      }
    };
    add(await recommendDaily());
    try {
      add(await favoriteLibrary());
    } catch (error) {
      console.warn(`[netease-cli] favorite library failed: ${error.message}`);
    }
    return merged;
  }

  return {
    name: 'netease-cli',
    command,
    dryRun,

    async probe() {
      if (dryRun) {
        return { ok: false, dryRun: true, command, note: 'Set MUSIC_PROVIDER=netease-cli or NETEASE_CLI_DRY_RUN=0 to enable read-only ncm-cli calls.' };
      }
      const result = await runCommand(command, ['login', '--check'], { timeoutMs: 10000 });
      return { ok: result.code === 0, command, code: result.code, stderr: result.stderr.slice(0, 300) };
    },

    async listLibrary({ playlist = [] } = {}) {
      if (dryRun) return playlist;
      try {
        const candidates = await libraryCandidates();
        return candidates.length ? candidates : playlist;
      } catch (error) {
        console.warn(`[netease-cli] library candidates failed: ${error.message}`);
        return playlist;
      }
    },

    async pickTrack({ playlist = [], userText = '', env = {} } = {}) {
      if (dryRun) return playlist[0] || null;
      let candidates = playlist.filter(track => track?.provider === 'netease-cli' || track?.source === 'netease-cli');
      if (!candidates.length) candidates = await libraryCandidates();
      if (/周杰伦|搜索|想听|找|song|music/i.test(userText || '')) {
        try {
          const query = (userText.match(/[\u4e00-\u9fa5A-Za-z0-9 _-]{2,}/)?.[0] || SAFE_FALLBACK_QUERY).trim();
          const searched = await searchSongs(query);
          if (searched.length) candidates = searched;
        } catch (error) {
          console.warn(`[netease-cli] search failed: ${error.message}`);
        }
      }
      return candidates.map(track => ({ track, score: scoreTrack(track, userText, env) }))
        .sort((a, b) => b.score - a.score)[0]?.track || playlist[0] || null;
    },

    async search(query) {
      if (dryRun) return [];
      return searchSongs(query);
    },

    async next({ userText = '下一首，保持当前氛围', env = {} } = {}) {
      const playlist = dryRun ? [] : await libraryCandidates();
      return this.pickTrack({ playlist, userText, env });
    },

    async now({ userText = '启动电台，适合现在的第一首', env = {} } = {}) {
      const playlist = dryRun ? [] : await libraryCandidates();
      return this.pickTrack({ playlist, userText, env });
    },

    async getStreamUrl(track) {
      return track?.jumpUrl || track?.url || null;
    },

    async getLyrics() {
      return null;
    },
  };
}
