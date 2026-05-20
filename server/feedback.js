import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
const feedbackFile = path.join(dataDir, 'feedback-events.jsonl');

function compactTrack(track = {}) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title || track.name,
    artist: track.artist,
    album: track.album,
    provider: track.provider || track.source,
    originalId: track.originalId,
    encryptedId: track.encryptedId,
  };
}

function safeText(text = '') {
  return String(text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 240);
}

export async function recordFeedback({ type, track, text = '', context = {} } = {}) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    type: safeText(type || 'note'),
    text: safeText(text),
    track: compactTrack(track),
    context: {
      source: safeText(context.source || 'opendio'),
      playerStatus: safeText(context.playerStatus || ''),
      userText: safeText(context.userText || ''),
    },
  };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.appendFile(feedbackFile, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export async function loadFeedback({ limit = 80 } = {}) {
  try {
    const raw = await fs.readFile(feedbackFile, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean).slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function summarizeFeedback(events = []) {
  const likes = new Map();
  const skips = new Map();
  const dislikes = new Map();
  const notes = [];
  for (const event of events) {
    const key = event.track?.id || `${event.track?.title || ''}:${event.track?.artist || ''}`;
    if (event.type === 'like' && key) likes.set(key, (likes.get(key) || 0) + 1);
    if ((event.type === 'skip' || event.type === 'next') && key) skips.set(key, (skips.get(key) || 0) + 1);
    if ((event.type === 'dislike' || event.type === 'ban') && key) dislikes.set(key, (dislikes.get(key) || 0) + 1);
    if (event.text) notes.push(event.text);
  }
  return {
    likes: [...likes.entries()].slice(-30),
    skips: [...skips.entries()].slice(-30),
    dislikes: [...dislikes.entries()].slice(-30),
    notes: notes.slice(-20),
    recent: events.slice(-12),
  };
}
