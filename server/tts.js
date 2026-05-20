import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { loadSettings } from './settings.js';

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, 'public', 'generated', 'dj-voice');
const SAY_VOICE = process.env.DJ_TTS_VOICE || 'Tingting';
const SAY_RATE = process.env.DJ_TTS_RATE || '185';
const TTS_VOLUME = process.env.DJ_TTS_VOLUME || '88';
const MPV_COMMAND = process.env.MPV_COMMAND || '/Users/zhang/.local/bin/mpv';
const AFPLAY_COMMAND = process.env.AFPLAY_COMMAND || '/usr/bin/afplay';
const FISH_TTS_URL = process.env.FISH_AUDIO_TTS_URL || 'https://api.fish.audio/v1/tts';

function run(command, args = [], { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ''}` };
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });
  });
}

function cleanText(text = '') {
  return String(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*_#<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

async function synthesizeFishSpeech(safeText, { settings }) {
  const apiKey = settings.fishApiKey || process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY;
  const referenceId = settings.fishReferenceId || process.env.FISH_AUDIO_REFERENCE_ID || process.env.FISH_REFERENCE_ID;
  const model = settings.fishModel || process.env.FISH_AUDIO_MODEL || 's1';
  if (!apiKey) return { ok: false, skipped: true, provider: 'fish', reason: 'missing Fish Audio API key' };
  const format = settings.fishFormat || 'mp3';
  await fs.mkdir(cacheDir, { recursive: true });
  const key = crypto.createHash('sha1').update(`fish|${model}|${referenceId || 'default'}|${format}|${safeText}`).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, `${key}.${format}`);
  try {
    await fs.access(file);
    return { ok: true, cached: true, provider: 'fish', file, text: safeText, model, referenceId, format };
  } catch {}

  const body = {
    text: safeText,
    ...(referenceId ? { reference_id: referenceId } : {}),
    format,
    latency: settings.fishLatency || 'balanced',
    normalize: true,
    prosody: {
      speed: Math.max(0.5, Math.min(2, Number(settings.djTtsRate || 185) / 185)),
      volume: 0,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.FISH_AUDIO_TIMEOUT_MS || 45000));
  try {
    const res = await fetch(FISH_TTS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        model,
        'content-type': 'application/json',
        accept: format === 'wav' ? 'audio/wav' : format === 'opus' ? 'audio/opus' : 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      return { ok: false, provider: 'fish', file, text: safeText, model, referenceId, format, error: `Fish Audio HTTP ${res.status}: ${errorText.slice(0, 300)}` };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(file, audio);
    return { ok: true, cached: false, provider: 'fish', file, text: safeText, model, referenceId, format };
  } catch (error) {
    return { ok: false, provider: 'fish', file, text: safeText, model, referenceId, format, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeMacSpeech(safeText, { voice, rate } = {}) {
  await fs.mkdir(cacheDir, { recursive: true });
  const key = crypto.createHash('sha1').update(`mac|${voice}|${rate}|${safeText}`).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, `${key}.aiff`);
  try {
    await fs.access(file);
    return { ok: true, cached: true, provider: 'mac-say', file, text: safeText, voice, rate };
  } catch {}

  const result = await run('/usr/bin/say', ['-v', voice, '-r', String(rate), '-o', file, '--', safeText], { timeoutMs: 25000 });
  if (result.code !== 0) {
    return { ok: false, provider: 'mac-say', file, text: safeText, voice, rate, error: (result.stderr || result.stdout || '').slice(0, 500) };
  }
  return { ok: true, cached: false, provider: 'mac-say', file, text: safeText, voice, rate };
}

export async function synthesizeDjSpeech(text, { voice, rate } = {}) {
  const settings = await loadSettings().catch(() => ({}));
  voice = voice || settings.djTtsVoice || SAY_VOICE;
  rate = rate || settings.djTtsRate || SAY_RATE;
  const safeText = cleanText(text);
  if (!safeText) return { ok: false, skipped: true, reason: 'empty text' };

  if ((settings.ttsProvider || 'fish') === 'fish') {
    const fish = await synthesizeFishSpeech(safeText, { settings });
    if (fish.ok) return fish;
    const fallback = await synthesizeMacSpeech(safeText, { voice, rate });
    return { ...fallback, fallbackFrom: 'fish', fishError: fish.error || fish.reason || 'Fish Audio unavailable' };
  }

  return synthesizeMacSpeech(safeText, { voice, rate });
}

export async function playDjSpeech(text, options = {}) {
  if (process.env.ENABLE_DJ_TTS === '0') return { ok: false, skipped: true, reason: 'disabled' };
  const speech = await synthesizeDjSpeech(text, options);
  if (!speech.ok) return speech;
  const settings = await loadSettings().catch(() => ({}));
  const volume = Math.max(0, Math.min(1, Number(settings.djTtsVolume ?? TTS_VOLUME) / 100));
  const result = await run(AFPLAY_COMMAND, ['-v', String(volume), speech.file], { timeoutMs: 12000 });
  return {
    ...speech,
    played: result.code === 0,
    playCode: result.code,
    playError: result.code === 0 ? null : ((result.stderr || result.stdout || '') || (result.timedOut ? 'afplay timed out while playing DJ speech' : null)).slice?.(0, 500) || null,
  };
}

export async function playDjSpeechWithDucking(text, { player = null, duckVolume, restoreVolume = null, ...options } = {}) {
  const settings = await loadSettings().catch(() => ({}));
  duckVolume = Number(duckVolume ?? settings.djDuckVolume ?? process.env.DJ_DUCK_VOLUME ?? 18);
  if (!player) return playDjSpeech(text, options);
  let before = null;
  try {
    before = await player.refreshState?.();
    const currentVolume = Number(before?.volume);
    const targetRestore = restoreVolume !== null && restoreVolume !== undefined && Number.isFinite(Number(restoreVolume))
      ? Number(restoreVolume)
      : (Number.isFinite(currentVolume) && currentVolume > 0 ? currentVolume : 80);
    await player.volume?.(duckVolume).catch(() => {});
    const speech = await playDjSpeech(text, options);
    await player.volume?.(targetRestore).catch(() => {});
    return { ...speech, ducked: true, duckVolume, restoreVolume: targetRestore };
  } catch (error) {
    const speech = await playDjSpeech(text, options).catch(err => ({ ok: false, error: err.message }));
    return { ...speech, ducked: false, duckError: error.message };
  }
}