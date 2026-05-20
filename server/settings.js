import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
const settingsFile = path.join(dataDir, 'settings.json');

export const defaultSettings = {
  musicProvider: process.env.MUSIC_PROVIDER || 'netease-cli',
  weatherLocation: process.env.WEATHER_LOCATION || 'Shanghai',
  enableWeatherContext: process.env.ENABLE_WEATHER_CONTEXT !== '0',
  useOpenClawDirector: process.env.USE_OPENCLAW_DIRECTOR === '1',
  ttsProvider: process.env.TTS_PROVIDER || 'fish',
  fishApiKey: process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY || '',
  fishModel: process.env.FISH_AUDIO_MODEL || 's1',
  fishReferenceId: process.env.FISH_AUDIO_REFERENCE_ID || process.env.FISH_REFERENCE_ID || '',
  fishFormat: process.env.FISH_AUDIO_FORMAT || 'mp3',
  fishLatency: process.env.FISH_AUDIO_LATENCY || 'balanced',
  djTtsVoice: process.env.DJ_TTS_VOICE || 'Tingting',
  djTtsRate: Number(process.env.DJ_TTS_RATE || 185),
  djTtsVolume: Number(process.env.DJ_TTS_VOLUME || 88),
  djDuckVolume: Number(process.env.DJ_DUCK_VOLUME || 18),
};

function normalize(raw = {}) {
  return {
    ...defaultSettings,
    ...raw,
    enableWeatherContext: raw.enableWeatherContext ?? defaultSettings.enableWeatherContext,
    useOpenClawDirector: raw.useOpenClawDirector ?? defaultSettings.useOpenClawDirector,
    ttsProvider: String((raw.ttsProvider ?? defaultSettings.ttsProvider) || 'fish').trim() || 'fish',
    fishApiKey: String(raw.fishApiKey ?? defaultSettings.fishApiKey ?? '').trim(),
    fishModel: String((raw.fishModel ?? defaultSettings.fishModel) || 's1').trim() || 's1',
    fishReferenceId: String(raw.fishReferenceId ?? defaultSettings.fishReferenceId ?? '').trim(),
    fishFormat: String((raw.fishFormat ?? defaultSettings.fishFormat) || 'mp3').trim() || 'mp3',
    fishLatency: String((raw.fishLatency ?? defaultSettings.fishLatency) || 'balanced').trim() || 'balanced',
    djTtsRate: Math.max(80, Math.min(320, Math.round(Number(raw.djTtsRate ?? defaultSettings.djTtsRate) || 185))),
    djTtsVolume: Math.max(0, Math.min(100, Math.round(Number(raw.djTtsVolume ?? defaultSettings.djTtsVolume) || 88))),
    djDuckVolume: Math.max(0, Math.min(100, Math.round(Number(raw.djDuckVolume ?? defaultSettings.djDuckVolume) || 18))),
    weatherLocation: String((raw.weatherLocation ?? defaultSettings.weatherLocation) || 'Shanghai').trim() || 'Shanghai',
    djTtsVoice: String((raw.djTtsVoice ?? defaultSettings.djTtsVoice) || 'Tingting').trim() || 'Tingting',
  };
}

export async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    return normalize(raw);
  } catch {
    return normalize(defaultSettings);
  }
}

export async function saveSettings(patch = {}) {
  const current = await loadSettings();
  const next = normalize({ ...current, ...patch });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
