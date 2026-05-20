import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadFragments } from './context.js';
import { getProviderLibrary, hydrateTrack } from './music-provider.js';
import { askDJ } from './radio-agent.js';
import { createRadioProgramSmart } from './radio-director.js';
import { createMpvPlayer } from './player/mpv-player.js';
import { synthesizeDjSpeech, playDjSpeech, playDjSpeechWithDucking } from './tts.js';
import { loadFeedback, recordFeedback, summarizeFeedback } from './feedback.js';
import { loadSettings, saveSettings } from './settings.js';
import { askOpenClawAgent } from './openclaw-agent.js';

const PORT = Number(process.env.PORT || 8765);
const root = path.resolve(import.meta.dirname, '..');
const webDir = path.join(root, 'web');
const clients = new Set();
const player = createMpvPlayer();

let state = {
  live: true,
  status: 'idle',
  current: null,
  dj: null,
  voice: null,
  queue: [],
  messages: [],
  feedback: null,
  updatedAt: new Date().toISOString(),
};

let executorBusy = false;
const playerActionLocks = new Set();
let lastAutoAdvanceTrackId = null;
let lastAutoAdvanceAt = 0;
let lastPlaybackSnapshot = null;

function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function publicState() {
  return { ...state, player: player.status };
}

async function currentPublicState() {
  await player.refreshState().catch(() => {});
  await player.ensureLyricsForCurrent?.(state.current).catch(() => {});
  return publicState();
}

function buildQueue(playlist = [], current = null) {
  return playlist
    .filter(track => track && (!current || String(track.id) !== String(current.id)))
    .slice(0, 8);
}

function buildProgram({ current, dj, queue = [] } = {}) {
  const nowTitle = current?.title || current?.name || '当前歌曲';
  const nowArtist = current?.artist || '';
  const next = queue[0];
  const nextTitle = next?.title || next?.name;
  return [
    {
      id: 'talk-opening',
      type: 'talk',
      label: 'DJ',
      title: '开场串场',
      text: dj?.say || `这里是 opendio。现在播放《${nowTitle}》。`,
      status: 'ready',
    },
    {
      id: current?.id ? `song-${current.id}` : 'song-current',
      type: 'song',
      label: 'SONG',
      title: nowTitle,
      artist: nowArtist,
      track: current,
      status: 'current',
    },
    ...(next ? [{
      id: next.id ? `song-${next.id}` : 'song-next',
      type: 'song',
      label: 'NEXT',
      title: nextTitle,
      artist: next.artist || '',
      track: next,
      status: 'queued',
    }] : []),
    ...(next ? [{
      id: 'talk-next',
      type: 'talk',
      label: 'DJ',
      title: '下一首预告',
      text: `下一首候选：${next.artist ? next.artist + ' 的' : ''}《${nextTitle}》。`,
      status: 'queued',
    }] : []),
  ];
}

async function readJSONBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

async function runExclusivePlayerAction(key, handler) {
  if (playerActionLocks.has(key)) {
    return { skipped: true, reason: `${key} already running`, state: await currentPublicState() };
  }
  playerActionLocks.add(key);
  try {
    return await handler();
  } finally {
    playerActionLocks.delete(key);
  }
}

function parseAgentAction(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { type: 'chat', confidence: 0, reason: 'empty' };
  const normalized = raw.toLowerCase();
  const has = (...patterns) => patterns.some(pattern => pattern.test(raw) || pattern.test(normalized));

  const asksForMoodChange = has(/(换|播|放|来|推荐|安排).*(轻松|安静|提神|工作|睡觉|夜晚|晚上|早上|通勤|学习|专注|氛围|心情|柔和|热闹|开心|低落|舒缓)/, /(轻松|安静|提神|工作|睡觉|夜晚|晚上|早上|通勤|学习|专注|氛围|心情|柔和|热闹|开心|低落|舒缓).*(一点|一些|的歌|音乐|电台)/);
  if (asksForMoodChange) return { type: 'replan', userText: raw, confidence: 0.86, reason: 'user asked for a mood/program change' };
  if (has(/下一首|下首|切歌|跳过|换一首(?!.*(轻松|安静|提神|工作|睡觉|夜晚|晚上|早上|通勤|学习|专注|氛围|心情|柔和|热闹|开心|低落|舒缓))|换首(?!.*(轻松|安静|提神|工作|睡觉|夜晚|晚上|早上|通勤|学习|专注|氛围|心情|柔和|热闹|开心|低落|舒缓))|next\b|skip\b/)) return { type: 'next', confidence: 0.95, reason: 'user asked for next/skip' };
  if (has(/暂停|停一下|pause\b/)) return { type: 'pause', confidence: 0.95, reason: 'user asked to pause' };
  if (has(/继续播放|接着放|继续听|播放继续|resume\b|play\b/)) return { type: 'resume', confidence: 0.9, reason: 'user asked to resume' };
  if (has(/停止播放|别放了|关掉音乐|stop\b/)) return { type: 'stop', confidence: 0.9, reason: 'user asked to stop' };
  if (has(/大声|声音大|音量大|调高音量|加大音量|volume up/)) return { type: 'volume', volume: 85, confidence: 0.75, reason: 'user asked louder' };
  if (has(/小声|声音小|音量小|调低音量|降低音量|volume down/)) return { type: 'volume', volume: 45, confidence: 0.75, reason: 'user asked quieter' };
  const volumeMatch = raw.match(/(?:音量|volume)\D{0,6}(\d{1,3})/i) || raw.match(/(\d{1,3})\s*%/);
  if (volumeMatch) return { type: 'volume', volume: Math.max(0, Math.min(100, Number(volumeMatch[1]))), confidence: 0.85, reason: 'user specified volume' };
  if (has(/解释.*(这首|当前|歌)|这首.*(讲|解释|介绍)|为什么.*放|介绍.*(这首|当前)/)) return { type: 'explain', confidence: 0.8, reason: 'user asked about current song' };
  if (has(/讲.*(这首|当前|歌)|说说.*(这首|当前|歌)|聊聊.*(这首|当前|歌)/)) return { type: 'explain', confidence: 0.75, reason: 'user asked to talk about current song' };
  return { type: 'chat', confidence: 0.35, reason: 'no executable intent matched' };
}

async function executeAgentAction(action, text) {
  switch (action?.type) {
    case 'next': {
      const result = await executeNextProgramStep({ source: 'agent-chat', recordSkip: true });
      return { ok: !result?.skipped, type: 'next', result, summary: result?.skipped ? `下一首暂时没执行：${result.reason || 'executor busy'}` : `已切到下一首：${state.current?.artist ? state.current.artist + ' - ' : ''}${state.current?.title || state.current?.name || '当前歌曲'}` };
    }
    case 'pause': {
      const playerResult = await player.pause();
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return { ok: playerResult.ok !== false, type: 'pause', result: playerResult, summary: '已暂停播放。' };
    }
    case 'resume': {
      const playerResult = await player.resume();
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return { ok: playerResult.ok !== false, type: 'resume', result: playerResult, summary: '已继续播放。' };
    }
    case 'stop': {
      const playerResult = await player.stop();
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return { ok: playerResult.ok !== false, type: 'stop', result: playerResult, summary: '已停止播放。' };
    }
    case 'volume': {
      const playerResult = await player.volume(action.volume);
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return { ok: playerResult.ok !== false, type: 'volume', result: playerResult, summary: `音量已调到 ${action.volume}%。` };
    }
    case 'replan': {
      const nextState = await plan(action.userText || text || '按用户要求重新编排电台');
      const speech = nextState.dj?.say ? await playDjSpeechWithDucking(nextState.dj.say, { player }).catch(error => ({ ok: false, error: error.message })) : null;
      if (speech) state = { ...state, voice: speech, updatedAt: new Date().toISOString() };
      const playPayload = await runExclusivePlayerAction('play', async () => {
        const playerResult = await player.playTrack(nextState.current);
        const publicPayload = await currentPublicState();
        broadcast('state', publicPayload);
        return { player: playerResult, state: publicPayload };
      });
      const trackLabel = `${state.current?.artist ? state.current.artist + ' - ' : ''}${state.current?.title || state.current?.name || '当前歌曲'}`;
      const playOk = playPayload.player?.ok !== false;
      const playError = playPayload.player?.lastError || playPayload.player?.reason || '';
      return { ok: playOk, type: 'replan', result: { ...playPayload, voice: speech }, summary: playOk ? `已按你的要求重新编排：${trackLabel}` : `已重新编排到 ${trackLabel}，但播放器没播起来${playError ? '：' + playError : ''}` };
    }
    case 'explain': {
      return { ok: true, type: 'explain', result: null, summary: null };
    }
    default:
      return { ok: true, type: 'chat', result: null, summary: null };
  }
}

async function plan(userText = '', { announce = true } = {}) {
  state.status = 'thinking';
  state.updatedAt = new Date().toISOString();
  await player.refreshState().catch(() => {});
  broadcast('state', publicState());

  const fragments = await loadFragments();
  const { provider, playlist } = await getProviderLibrary({ fragments });
  const candidates = await Promise.all((playlist || []).slice(0, 12).map(track => hydrateTrack(provider, track).catch(() => track)));
  const feedback = summarizeFeedback(await loadFeedback());
  const directed = await createRadioProgramSmart({ userText, fragments: { ...fragments, feedback }, candidates, currentTrack: state.current, recentMessages: state.messages });
  const track = directed.currentTrack || await hydrateTrack(provider, await provider.pickTrack?.({ playlist, userText, env: fragments.env }));
  const baseDj = directed.dj || await askDJ({ fragments, userText, track });
  const dj = announce ? baseDj : { ...baseDj, say: '', muted: true };
  const voice = announce && dj.say ? await synthesizeDjSpeech(dj.say).catch(error => ({ ok: false, error: error.message })) : null;
  const queue = directed.queue?.length ? directed.queue : buildQueue(playlist, track);

  state = {
    ...state,
    status: 'playing',
    current: track,
    dj,
    director: { mood: directed.mood, energy: directed.energy, reason: directed.reason },
    feedback,
    voice,
    queue,
    program: directed.program?.length ? directed.program : buildProgram({ current: track, dj, queue }),
    messages: [
      ...state.messages.slice(-30),
      ...(userText ? [{ role: 'user', text: userText, at: new Date().toISOString() }] : []),
      ...(dj.say ? [{ role: 'dj', text: dj.say, at: new Date().toISOString() }] : []),
    ],
    updatedAt: new Date().toISOString(),
  };
  broadcast('state', publicState());
  return publicState();
}

async function refreshDjForCurrent(userText = '继续电台节目') {
  try {
    if (!state.current) return state.dj;
    const fragments = await loadFragments();
    const feedback = summarizeFeedback(await loadFeedback());
    const directed = await createRadioProgramSmart({ userText, fragments: { ...fragments, feedback }, candidates: [state.current, ...(state.queue || [])], currentTrack: state.current, recentMessages: state.messages });
    const dj = directed.dj || await askDJ({ fragments, userText, track: state.current });
    const voice = await synthesizeDjSpeech(dj.say).catch(error => ({ ok: false, error: error.message }));
    state = {
      ...state,
      dj,
      director: { mood: directed.mood, energy: directed.energy, reason: directed.reason },
      feedback,
      voice,
      program: directed.program?.length ? directed.program : buildProgram({ current: state.current, dj, queue: state.queue || [] }),
      messages: [...state.messages.slice(-30), { role: 'dj', text: dj.say, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    broadcast('state', publicState());
    return dj;
  } catch (error) {
    console.warn(`[program] dj refresh failed: ${error.message}`);
    return state.dj;
  }
}

async function refillProgram(reason = '后台补节目流') {
  try {
    const previousCurrent = state.current;
    const fragments = await loadFragments();
    const { provider, playlist } = await getProviderLibrary({ fragments });
    const candidates = await Promise.all([state.current, ...buildQueue(playlist, state.current)].filter(Boolean).slice(0, 12).map(track => hydrateTrack(provider, track).catch(() => track)));
    const feedback = summarizeFeedback(await loadFeedback());
    const directed = await createRadioProgramSmart({ userText: reason, fragments: { ...fragments, feedback }, candidates, currentTrack: state.current, recentMessages: state.messages });
    state = {
      ...state,
      queue: directed.queue?.length ? directed.queue : buildQueue(playlist, state.current),
      director: { mood: directed.mood, energy: directed.energy, reason: directed.reason },
      feedback,
      program: directed.program?.length ? directed.program : buildProgram({ current: state.current, dj: state.dj, queue: buildQueue(playlist, state.current) }),
      updatedAt: new Date().toISOString(),
    };
    if (previousCurrent?.id === state.current?.id) broadcast('state', publicState());
  } catch (error) {
    console.warn(`[program] refill failed: ${error.message}`);
  }
}

function pickFastNext() {
  const program = state.program || [];
  const nextSongIndex = program.findIndex(item => item.type === 'song' && item.status === 'queued' && item.track);
  const nextSong = nextSongIndex >= 0 ? program[nextSongIndex] : null;
  const talkBefore = nextSongIndex > 0 ? program.slice(0, nextSongIndex).reverse().find(item => item.type === 'talk' && item.status === 'queued' && item.text) : null;
  const fallbackTrack = state.queue?.[0] || null;
  return {
    track: nextSong?.track || fallbackTrack,
    songId: nextSong?.id || (fallbackTrack?.id ? `song-${fallbackTrack.id}` : null),
    talk: talkBefore || null,
  };
}

function markProgramAdvancing({ songId, talkId } = {}) {
  const nextProgram = (state.program || []).map(item => {
    if (talkId && item.id === talkId) return { ...item, status: 'played' };
    if (songId && item.id === songId) return { ...item, label: 'SONG', status: 'current' };
    if (item.type === 'song' && item.status === 'current') return { ...item, label: 'PLAYED', status: 'played' };
    return item;
  });
  state = { ...state, program: nextProgram, updatedAt: new Date().toISOString() };
}

async function executeNextProgramStep({ source = 'manual-next', recordSkip = false } = {}) {
  if (executorBusy) return { skipped: true, reason: 'executor busy' };
  executorBusy = true;
  try {
    if (recordSkip) {
      await recordFeedback({ type: 'next', track: state.current, context: { source, playerStatus: player.status?.status } }).catch(() => {});
    }
    const nextStep = pickFastNext();
    const fastTrack = nextStep.track;
  if (fastTrack) {
      const nextQueue = (state.queue || []).filter(track => String(track.id) !== String(fastTrack.id));
      state = {
        ...state,
        current: fastTrack,
        queue: nextQueue,
        status: 'playing',
        updatedAt: new Date().toISOString(),
      };
      markProgramAdvancing({ songId: nextStep.songId, talkId: nextStep.talk?.id });
      if (!(state.program || []).some(item => item.type === 'song' && item.status === 'queued') && nextQueue.length) {
        const later = nextQueue[0];
        state = {
          ...state,
          program: [
            ...(state.program || []),
            {
              id: 'talk-bridge-auto',
              type: 'talk',
              label: 'DJ',
              title: '过渡串场',
              text: `这首之后，我会继续接到 ${later.artist ? later.artist + ' 的' : ''}《${later.title || later.name}》。`,
              status: 'queued',
              role: 'bridge',
            },
            {
              id: later.id ? `song-${later.id}` : 'song-auto-next',
              type: 'song',
              label: 'NEXT',
              title: later.title || later.name,
              artist: later.artist || '',
              track: later,
              reason: later.reason || '自动续播',
              status: 'queued',
            },
          ],
        };
      }
      markProgramLabels();
      broadcast('state', publicState());
      const speech = nextStep.talk?.text ? await playDjSpeechWithDucking(nextStep.talk.text, { player }).catch(error => ({ ok: false, error: error.message })) : null;
      if (speech) state = { ...state, voice: speech, updatedAt: new Date().toISOString() };
      const result = await player.playTrack(fastTrack);
      if (result?.ok === false) {
        const retry = await tryFallbackPlayableTrack({
          failedTrack: fastTrack,
          source,
          attemptedIds: [fastTrack.id, fastTrack.originalId, fastTrack.encryptedId],
        });
        const publicPayload = await currentPublicState();
        broadcast('state', publicPayload);
        refillProgram(`${source} 播放失败后后台补队列`).catch(() => {});
        return { state: publicPayload, player: retry?.player || result, voice: speech, fast: true, fallback: retry, executor: { ranTalk: Boolean(nextStep.talk?.text), talkId: nextStep.talk?.id || null, songId: nextStep.songId || null, source } };
      }
      const publicPayload = await currentPublicState();
      broadcast('state', publicPayload);
      refillProgram(`${source} 后后台补队列`).catch(() => {});
      return { state: publicPayload, player: result, voice: speech, fast: true, executor: { ranTalk: Boolean(nextStep.talk?.text), talkId: nextStep.talk?.id || null, songId: nextStep.songId || null, source } };
    }
    const nextState = await plan('下一首，保持当前氛围');
    const speech = nextState.dj?.say ? await playDjSpeechWithDucking(nextState.dj.say, { player }).catch(error => ({ ok: false, error: error.message })) : null;
    if (speech) state = { ...state, voice: speech, updatedAt: new Date().toISOString() };
    const result = await player.playTrack(nextState.current);
    const publicPayload = await currentPublicState();
    broadcast('state', publicPayload);
    return { state: publicPayload, player: result, voice: speech, fast: false, executor: { ranTalk: Boolean(nextState.dj?.say), source } };
  } finally {
    executorBusy = false;
  }
}

function markProgramLabels() {
  let queuedSongSeen = 0;
  state = {
    ...state,
    program: (state.program || []).map(item => {
      if (item.type !== 'song' || item.status !== 'queued') return item;
      queuedSongSeen += 1;
      return { ...item, label: queuedSongSeen === 1 ? 'NEXT' : 'LATER' };
    }),
    updatedAt: new Date().toISOString(),
  };
}

function trackKey(track) {
  return String(track?.id || track?.originalId || track?.encryptedId || '').trim();
}

async function tryFallbackPlayableTrack({ failedTrack, source = 'playback', attemptedIds = [] } = {}) {
  const attempted = new Set(attemptedIds.map(String).filter(Boolean));
  if (failedTrack) attempted.add(trackKey(failedTrack));
  const candidates = [...(state.queue || []), ...(state.program || []).map(item => item?.track).filter(Boolean)]
    .filter(track => {
      const key = trackKey(track);
      return key && !attempted.has(key);
    })
    .slice(0, 5);

  for (const candidate of candidates) {
    const result = await player.playTrack(candidate);
    attempted.add(trackKey(candidate));
    if (result?.ok === false) continue;

    const nextQueue = (state.queue || []).filter(track => trackKey(track) !== trackKey(candidate));
    state = {
      ...state,
      current: candidate,
      queue: nextQueue,
      status: 'playing',
      program: buildProgram({
        current: candidate,
        dj: { ...state.dj, say: `刚刚那首暂时没播起来，我自动换到《${candidate.title || candidate.name || '下一首'}》。` },
        queue: nextQueue,
      }),
      updatedAt: new Date().toISOString(),
    };
    markProgramLabels();
    return { ok: true, player: result, track: candidate, attempted: attempted.size, source };
  }

  state = {
    ...state,
    status: 'error',
    dj: { ...state.dj, say: '这几首都暂时没播起来，可能是网易云链接不可用或登录状态波动。' },
    updatedAt: new Date().toISOString(),
  };
  return { ok: false, player: player.status, attempted: attempted.size, source };
}

function rememberPlaybackSnapshot(snapshot) {
  if (!snapshot) return;
  const position = Number(snapshot.position);
  const duration = Number(snapshot.duration);
  if (snapshot.status === 'playing' && Number.isFinite(position) && Number.isFinite(duration) && duration > 20) {
    lastPlaybackSnapshot = {
      trackId: String(state.current?.id || snapshot.current?.id || snapshot.current?.originalId || ''),
      position,
      duration,
      at: Date.now(),
    };
  }
}

function shouldAutoAdvance(snapshot) {
  const status = snapshot?.status;
  const currentId = state.current?.id || snapshot?.current?.id || snapshot?.current?.originalId;
  const position = Number(snapshot?.position);
  const duration = Number(snapshot?.duration);
  const now = Date.now();
  if (!currentId || executorBusy) return false;
  if (lastAutoAdvanceTrackId === String(currentId) && now - lastAutoAdvanceAt < 15000) return false;
  if (status === 'playing' && Number.isFinite(position) && Number.isFinite(duration) && duration > 20) {
    return duration - position <= 2;
  }
  if ((status === 'stopped' || status === 'ended') && Number.isFinite(position) && Number.isFinite(duration) && duration > 20) {
    return duration - position <= 3;
  }
  if ((status === 'stopped' || status === 'ended') && lastPlaybackSnapshot?.trackId === String(currentId)) {
    return Date.now() - lastPlaybackSnapshot.at < 30000 && lastPlaybackSnapshot.duration - lastPlaybackSnapshot.position <= 5;
  }
  return false;
}

async function tickProgramExecutor() {
  try {
    if (!state.current || !(state.program || []).some(item => item.type === 'song' && item.status === 'queued')) return;
    const snapshot = await player.refreshState();
    rememberPlaybackSnapshot(snapshot);
    if (!shouldAutoAdvance(snapshot)) return;
    lastAutoAdvanceTrackId = String(state.current?.id || snapshot?.current?.id || snapshot?.current?.originalId);
    lastAutoAdvanceAt = Date.now();
    const result = await executeNextProgramStep({ source: 'auto-advance' });
    if (!result?.skipped) console.log(`[executor] auto advanced to ${state.current?.title || 'next track'}`);
  } catch (error) {
    console.warn(`[executor] auto advance failed: ${error.message}`);
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/player') pathname = '/player.html';
  const file = path.normalize(path.join(webDir, pathname));
  if (!file.startsWith(webDir)) return sendJSON(res, { error: 'forbidden' }, 403);
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.end(data);
  } catch {
    sendJSON(res, { error: 'not found' }, 404);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });
      clients.add(res);
      res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/api/now') {
      return sendJSON(res, await currentPublicState());
    }
    if (url.pathname === '/api/player/status') {
      await player.refreshState().catch(() => {});
      return sendJSON(res, player.status);
    }
    if (url.pathname === '/api/player/probe') return sendJSON(res, await player.probe());

    if (url.pathname === '/api/player/play' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const payload = await runExclusivePlayerAction('play', async () => {
        if (body.track) {
          state = {
            ...state,
            current: body.track,
            queue: state.queue,
            program: buildProgram({ current: body.track, dj: state.dj, queue: state.queue }),
            status: 'playing',
            updatedAt: new Date().toISOString(),
          };
        }
        const shouldSpeak = body.speak === true;
        const nextState = body.next ? await plan('下一首，保持当前氛围', { announce: shouldSpeak }) : publicState();
        const freshPlayer = await player.refreshState().catch(() => player.status);
        if (!body.track && !body.next && ['playing', 'starting'].includes(freshPlayer?.status)) {
          const publicPayload = await currentPublicState();
          return { state: publicPayload, player: { ...freshPlayer, ok: true, noOp: true, reason: 'already playing' } };
        }
        if (!body.track && !body.next && freshPlayer?.status === 'paused') {
          const result = await player.resume();
          const publicPayload = await currentPublicState();
          broadcast('state', publicPayload);
          return { state: publicPayload, player: result };
        }
        const speech = shouldSpeak && nextState.dj?.say ? await playDjSpeechWithDucking(nextState.dj.say, { player }).catch(error => ({ ok: false, error: error.message })) : null;
        if (speech) state = { ...state, voice: speech, updatedAt: new Date().toISOString() };
        const result = await player.playTrack(nextState.current);
        if (result?.ok === false) {
          const retry = await tryFallbackPlayableTrack({
            failedTrack: nextState.current,
            source: 'play',
            attemptedIds: [nextState.current?.id, nextState.current?.originalId, nextState.current?.encryptedId],
          });
          const publicPayload = await currentPublicState();
          broadcast('state', publicPayload);
          return { state: publicPayload, player: retry?.player || result, fallback: retry };
        }
        const publicPayload = await currentPublicState();
        broadcast('state', publicPayload);
        return { state: publicPayload, player: result };
      });
      return sendJSON(res, payload);
    }

    if (url.pathname === '/api/player/pause' && req.method === 'POST') {
      const result = await player.pause();
      const publicPayload = await currentPublicState();
      broadcast('state', publicPayload);
      return sendJSON(res, { state: publicPayload, player: result });
    }

    if (url.pathname === '/api/player/resume' && req.method === 'POST') {
      const result = await player.resume();
      const publicPayload = await currentPublicState();
      broadcast('state', publicPayload);
      return sendJSON(res, { state: publicPayload, player: result });
    }

    if (url.pathname === '/api/player/stop' && req.method === 'POST') {
      const result = await player.stop();
      const publicPayload = await currentPublicState();
      broadcast('state', publicPayload);
      return sendJSON(res, { state: publicPayload, player: result });
    }

    if (url.pathname === '/api/player/next' && req.method === 'POST') {
      const result = await executeNextProgramStep({ source: 'player-next', recordSkip: true });
      return sendJSON(res, result);
    }

    if (url.pathname === '/api/player/prev' && req.method === 'POST') {
      const result = await player.prev();
      const publicPayload = await currentPublicState();
      broadcast('state', publicPayload);
      return sendJSON(res, { state: publicPayload, player: result });
    }

    if (url.pathname === '/api/player/seek' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const result = await player.seek(body.seconds ?? body.position ?? 0);
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return sendJSON(res, { state: nextState, player: result });
    }

    if (url.pathname === '/api/player/volume' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const result = await player.volume(body.volume ?? body.level ?? 80);
      const nextState = await currentPublicState();
      broadcast('state', nextState);
      return sendJSON(res, { state: nextState, player: result });
    }

    if (url.pathname === '/api/player/lyrics') {
      const result = await player.lyrics(state.current);
      const nextState = await currentPublicState();
      return sendJSON(res, { state: nextState, player: result });
    }

    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const settings = await saveSettings(body);
      const nextState = { ...publicState(), settings };
      broadcast('state', nextState);
      return sendJSON(res, { ok: true, settings });
    }

    if (url.pathname === '/api/settings') {
      return sendJSON(res, { settings: await loadSettings() });
    }

    if (url.pathname === '/api/taste') return sendJSON(res, {
      taste: await fs.readFile(path.join(root, 'data/taste.md'), 'utf8'),
      routines: await fs.readFile(path.join(root, 'data/routines.md'), 'utf8'),
      moodRules: await fs.readFile(path.join(root, 'data/mood-rules.md'), 'utf8'),
    });
    if (url.pathname === '/api/plan/today') return sendJSON(res, { plan: state.queue, current: state.current });
    if (url.pathname === '/api/next') return sendJSON(res, await plan('下一首，保持当前氛围'));

    if (url.pathname === '/api/agent/chat' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const text = String(body.text || body.message || '').trim();
      if (!text) return sendJSON(res, { ok: false, error: 'empty message' }, 400);
      const userMessage = { role: 'user', text, at: new Date().toISOString(), source: 'opendio-agent' };
      state = { ...state, messages: [...state.messages.slice(-30), userMessage], updatedAt: new Date().toISOString() };
      broadcast('state', publicState());
      const action = parseAgentAction(text);
      const actionResult = await executeAgentAction(action, text);
      const agent = await askOpenClawAgent({ text, state: await currentPublicState(), action, actionResult });
      const fallbackReply = actionResult?.summary || `OpenClaw agent 暂时没接上：${agent.error || 'unknown error'}`;
      const reply = agent.ok ? agent.reply : fallbackReply;
      state = {
        ...state,
        agent: { ...agent, action, actionResult },
        messages: [...state.messages.slice(-30), { role: 'agent', text: reply, at: new Date().toISOString(), source: 'openclaw', action: action.type, actionResult: actionResult?.summary || null }],
        updatedAt: new Date().toISOString(),
      };
      broadcast('state', publicState());
      return sendJSON(res, { ok: agent.ok || actionResult?.ok === true, reply, agent, action, actionResult, state: publicState() }, (agent.ok || actionResult?.ok === true) ? 200 : 502);
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const text = body.text || '';
      if (/不想听|不要|别放|跳过|讨厌|不喜欢/.test(text)) {
        await recordFeedback({ type: 'dislike', track: state.current, text, context: { source: 'chat', userText: text, playerStatus: player.status?.status } }).catch(() => {});
      } else if (/喜欢|好听|可以|不错|收藏|爱听/.test(text)) {
        await recordFeedback({ type: 'like', track: state.current, text, context: { source: 'chat', userText: text, playerStatus: player.status?.status } }).catch(() => {});
      }
      return sendJSON(res, await plan(text, { announce: true }));
    }

    if (url.pathname === '/api/feedback' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const event = await recordFeedback({
        type: body.type || 'note',
        text: body.text || '',
        track: body.track || state.current,
        context: { source: 'api', playerStatus: player.status?.status, userText: body.userText || '' },
      });
      const feedback = summarizeFeedback(await loadFeedback());
      state = { ...state, feedback, updatedAt: new Date().toISOString() };
      broadcast('state', publicState());
      return sendJSON(res, { ok: true, event, feedback });
    }

    if (url.pathname === '/api/feedback') {
      const events = await loadFeedback({ limit: 120 });
      return sendJSON(res, { events, summary: summarizeFeedback(events) });
    }

    return serveStatic(req, res);
  } catch (error) {
    sendJSON(res, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`opendio listening on http://localhost:${PORT}`);
  plan('启动电台，适合现在的第一首').catch((error) => {
    console.error(`[startup] initial plan failed: ${error.message}`);
  });
  setInterval(tickProgramExecutor, Number(process.env.PROGRAM_EXECUTOR_INTERVAL_MS || 3000)).unref();
});
