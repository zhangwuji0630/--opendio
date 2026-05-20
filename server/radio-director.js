import { spawn } from 'node:child_process';
import { loadSettings } from './settings.js';

function textTokens(text = '') {
  return String(text).toLowerCase().split(/[\s,，。.!！?？、/]+/).filter(Boolean);
}

function trackTitle(track) {
  return track?.title || track?.name || '未知歌曲';
}

function trackArtist(track) {
  return track?.artist || '未知艺人';
}

function hourMood(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 10) return { mood: '清醒一点的早间启动', energy: 0.62, hint: '适合从轻快、熟悉、不过分吵的歌开始。' };
  if (hour >= 10 && hour < 14) return { mood: '午间过渡', energy: 0.52, hint: '适合稳定、旋律感强、不要太重的歌。' };
  if (hour >= 14 && hour < 18) return { mood: '下午续航', energy: 0.58, hint: '适合提神但不打断工作的歌。' };
  if (hour >= 18 && hour < 22) return { mood: '晚间松弛', energy: 0.46, hint: '适合有情绪、有画面感、可以慢慢听的歌。' };
  return { mood: '深夜低声电台', energy: 0.32, hint: '适合低音量、柔和、留一点空间的歌。' };
}

function scoreTrack(track, { userText = '', env = {}, index = 0, feedback = null } = {}) {
  const tokens = textTokens(userText);
  const hay = `${trackTitle(track)} ${trackArtist(track)} ${track.album || ''} ${track.reason || ''}`.toLowerCase();
  let score = Math.max(0, 1 - index * 0.025) + Math.random() * 0.08;
  const key = String(track?.id || track?.originalId || `${trackTitle(track)}:${trackArtist(track)}`);
  const liked = new Map(feedback?.likes || []);
  const skipped = new Map(feedback?.skips || []);
  const disliked = new Map(feedback?.dislikes || []);
  score += (liked.get(key) || 0) * 0.35;
  score -= (skipped.get(key) || 0) * 0.22;
  score -= (disliked.get(key) || 0) * 1.8;
  for (const token of tokens) {
    if (token.length >= 2 && hay.includes(token)) score += 1.6;
  }
  const hour = Number(env.hour ?? new Date().getHours());
  if (hour >= 22 || hour < 6) {
    if (/live|伴奏|钢琴|民谣|慢|夜|月|梦|雨|海|唯一|出现|离开/i.test(hay)) score += 0.35;
    if (/remix|dj|电音|嗨|炸/i.test(hay)) score -= 0.4;
  } else if (hour >= 10 && hour < 18) {
    if (/live|remix|说唱|rock|摇滚/i.test(hay)) score += 0.12;
  }
  if (/不要|不想|别/.test(userText) && tokens.some(token => hay.includes(token))) score -= 2.5;
  return score;
}

function pickTracks(candidates = [], options = {}) {
  const seen = new Set();
  return candidates
    .filter(Boolean)
    .filter(track => {
      const key = track.id || track.originalId || `${trackTitle(track)}:${trackArtist(track)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((track, index) => ({ track, score: scoreTrack(track, { ...options, index }) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.track)
    .slice(0, 4);
}

function compactCandidate(track, index) {
  return {
    index,
    id: String(track?.id || track?.originalId || index),
    title: trackTitle(track),
    artist: trackArtist(track),
    album: track?.album || '',
    reason: track?.reason || '',
  };
}

function runOpenClawDirector(prompt, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const command = process.env.OPENCLAW_DIRECTOR_COMMAND || 'openclaw';
    const args = process.env.OPENCLAW_DIRECTOR_ARGS
      ? process.env.OPENCLAW_DIRECTOR_ARGS.split(/\s+/).filter(Boolean)
      : ['agent', 'run', '--json'];
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: stderr.slice(0, 500) || `${command} exited ${code}` });
      try {
        const parsed = JSON.parse(stdout || '{}');
        const text = typeof parsed === 'string' ? parsed : (parsed.result || parsed.content || parsed.message || stdout);
        const jsonText = typeof text === 'string' ? (text.match(/\{[\s\S]*\}/)?.[0] || text) : JSON.stringify(text);
        resolve({ ok: true, json: JSON.parse(jsonText) });
      } catch (error) {
        resolve({ ok: false, error: `parse failed: ${error.message}`, raw: stdout.slice(0, 500) });
      }
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
  });
}

function normalizeLlmProgram(json, { candidates = [], fallback }) {
  const byId = new Map(candidates.map(track => [String(track.id || track.originalId), track]));
  const byIndex = candidates;
  const items = Array.isArray(json?.program) ? json.program : [];
  if (!items.some(item => item.type === 'song')) return null;

  const program = [];
  let currentTrack = null;
  const queue = [];
  let songSeen = 0;
  for (const item of items.slice(0, 8)) {
    if (item?.type === 'talk') {
      const text = String(item.text || item.title || '').trim().slice(0, 180);
      if (!text) continue;
      program.push({
        id: item.id || `talk-${program.length + 1}`,
        type: 'talk',
        label: 'DJ',
        title: item.title || (songSeen ? '过渡串场' : '开场串场'),
        text,
        status: songSeen ? 'queued' : 'ready',
        role: item.role || (songSeen ? 'bridge' : 'opening'),
      });
      continue;
    }
    if (item?.type === 'song') {
      const track = byId.get(String(item.trackId || item.id || '')) || byIndex[Number(item.candidateIndex)] || null;
      if (!track) continue;
      const isCurrent = !currentTrack;
      if (isCurrent) currentTrack = track;
      else queue.push(track);
      songSeen += 1;
      program.push({
        id: track.id ? `song-${track.id}` : `song-${songSeen}`,
        type: 'song',
        label: isCurrent ? 'SONG' : (songSeen === 2 ? 'NEXT' : 'LATER'),
        title: trackTitle(track),
        artist: trackArtist(track),
        track,
        reason: item.reason || track.reason || '',
        status: isCurrent ? 'current' : 'queued',
      });
    }
  }
  if (!currentTrack) return null;
  const firstTalk = program.find(item => item.type === 'talk')?.text || fallback?.dj?.say || `现在播放 ${trackArtist(currentTrack)} 的《${trackTitle(currentTrack)}》。`;
  return {
    mood: String(json?.mood || fallback?.mood || '私人电台').slice(0, 40),
    energy: Number.isFinite(Number(json?.energy)) ? Number(json.energy) : fallback?.energy,
    reason: String(json?.reason || fallback?.reason || 'LLM 编排').slice(0, 160),
    currentTrack,
    queue: queue.length ? queue : fallback?.queue || [],
    dj: {
      say: firstTalk,
      play: [currentTrack.id],
      reason: String(json?.reason || currentTrack.reason || '').slice(0, 180),
      segue: program.find(item => item.type === 'talk' && item.role === 'bridge')?.text || fallback?.dj?.segue || '',
      source: 'radio-director-openclaw',
    },
    program,
  };
}

export async function createRadioProgramSmart(input = {}) {
  const fallback = createRadioProgram(input);
  const settings = await loadSettings().catch(() => ({}));
  if (settings.useOpenClawDirector !== true && process.env.USE_OPENCLAW_DIRECTOR !== '1') return fallback;
  const { userText = '', fragments = {}, candidates = [], recentMessages = [] } = input;
  const compact = candidates.slice(0, 12).map(compactCandidate);
  const prompt = `你是私人 AI 电台的 Radio Director。根据用户输入、时间、偏好资料和候选歌曲，编排一小段电台节目。\n\n要求：\n- 只输出 JSON，不要 markdown。\n- program 必须包含 talk 和 song。\n- 第一首 song 是马上要播放的当前歌曲。\n- 后续 song 是 NEXT/LATER。\n- talk 要像自然电台 DJ，中文，短一点。\n- song 必须从 candidates 里选，用 trackId 或 candidateIndex 引用，不能编造歌曲。\n\n输出结构：{ "mood": string, "energy": number, "reason": string, "program": [ {"type":"talk","text":string,"role":"opening|bridge"}, {"type":"song","trackId":string,"candidateIndex":number,"reason":string} ] }\n\n用户输入：${userText || '(无)'}\n环境：${JSON.stringify(fragments.env || {})}\nTaste：${String(fragments.taste || '').slice(0, 1200)}\nRoutines：${String(fragments.routines || '').slice(0, 900)}\nMood Rules：${String(fragments.moodRules || '').slice(0, 900)}\nFeedback：${JSON.stringify(fragments.feedback || {})}\n最近消息：${JSON.stringify((recentMessages || []).slice(-6))}\nCandidates：${JSON.stringify(compact, null, 2)}`;
  const result = await runOpenClawDirector(prompt, { timeoutMs: Number(process.env.OPENCLAW_DIRECTOR_TIMEOUT_MS || 30000) });
  if (!result.ok) return { ...fallback, directorError: result.error, dj: { ...fallback.dj, source: 'radio-director-local-fallback' } };
  const normalized = normalizeLlmProgram(result.json, { candidates, fallback });
  if (!normalized) return { ...fallback, directorError: 'invalid llm program', dj: { ...fallback.dj, source: 'radio-director-local-fallback' } };
  return normalized;
}

export function createRadioProgram({ userText = '', fragments = {}, candidates = [], currentTrack = null, recentMessages = [] } = {}) {
  const env = fragments.env || {};
  const hour = Number(env.hour ?? new Date().getHours());
  const mood = hourMood(hour);
  const weatherPhrase = env.weather?.label ? `，外面${env.weather.label}${Number.isFinite(Number(env.weather.temperature)) ? `，约 ${Math.round(Number(env.weather.temperature))}°C` : ''}` : '';
  const contextHint = env.weatherHint || mood.hint;
  const picked = pickTracks(candidates, { userText, env, feedback: fragments.feedback });
  const current = picked[0] || currentTrack || candidates[0] || null;
  const nextTracks = picked.filter(track => String(track?.id) !== String(current?.id)).slice(0, 2);
  const intent = String(userText || '').trim();
  const nowLabel = env.timeLabel || new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
  const currentName = current ? `${trackArtist(current)} 的《${trackTitle(current)}》` : '这一首';
  const next = nextTracks[0];

  const openingText = intent
    ? `收到。现在 ${nowLabel}${weatherPhrase}，我按“${intent.slice(0, 36)}”来排一小段：先放 ${currentName}。${contextHint}`
    : `现在是 ${nowLabel}${weatherPhrase}，这段我先按${env.timeBlockLabel || mood.mood}来排。先从 ${currentName} 开始，声音放轻一点。${contextHint}`;

  const program = [
    {
      id: 'talk-opening',
      type: 'talk',
      label: 'DJ',
      title: '开场串场',
      text: openingText,
      status: 'ready',
      role: 'opening',
    },
  ];

  if (current) {
    program.push({
      id: current.id ? `song-${current.id}` : 'song-current',
      type: 'song',
      label: 'SONG',
      title: trackTitle(current),
      artist: trackArtist(current),
      track: current,
      reason: current.reason || mood.hint,
      status: 'current',
    });
  }

  if (next) {
    program.push({
      id: 'talk-bridge-1',
      type: 'talk',
      label: 'DJ',
      title: '过渡串场',
      text: `这首之后，我会把情绪接到 ${trackArtist(next)} 的《${trackTitle(next)}》，不要突然跳太远。`,
      status: 'queued',
      role: 'bridge',
    });
    program.push({
      id: next.id ? `song-${next.id}` : 'song-next',
      type: 'song',
      label: 'NEXT',
      title: trackTitle(next),
      artist: trackArtist(next),
      track: next,
      reason: next.reason || '延续当前节目段落',
      status: 'queued',
    });
  }

  const secondNext = nextTracks[1];
  if (secondNext) {
    program.push({
      id: secondNext.id ? `song-${secondNext.id}` : 'song-later',
      type: 'song',
      label: 'LATER',
      title: trackTitle(secondNext),
      artist: trackArtist(secondNext),
      track: secondNext,
      reason: secondNext.reason || '作为后续备选',
      status: 'queued',
    });
  }

  return {
    mood: mood.mood,
    energy: mood.energy,
    reason: intent ? `根据用户输入“${intent.slice(0, 60)}”和当前时间编排。` : `根据当前时间 ${nowLabel} 编排。`,
    currentTrack: current,
    queue: [...nextTracks, ...picked.slice(3)].filter(Boolean),
    dj: {
      say: openingText,
      play: current ? [current.id] : [],
      reason: current?.reason || contextHint,
      segue: next ? `下一首接 ${trackArtist(next)} 的《${trackTitle(next)}》。` : '后面继续保持这个氛围。',
      source: 'radio-director-local',
    },
    program,
  };
}
