import fs from 'node:fs/promises';
import path from 'node:path';
import { loadEnvironmentContext } from './environment.js';
import { loadSettings } from './settings.js';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
const readText = (name) => fs.readFile(path.join(dataDir, name), 'utf8');

export async function loadFragments(extra = {}) {
  const [persona, taste, routines, moodRules, playlistRaw] = await Promise.all([
    readText('dj-profile.md'),
    readText('taste.md'),
    readText('routines.md'),
    readText('mood-rules.md'),
    readText('playlists.json'),
  ]);

  const now = new Date();
  const env = await loadEnvironmentContext(extra, await loadSettings());
  return {
    persona,
    taste,
    routines,
    moodRules,
    playlist: JSON.parse(playlistRaw),
    env,
  };
}

export function buildContextText(fragments, userText) {
  return [
    '## DJ Persona', fragments.persona,
    '## Taste', fragments.taste,
    '## Routines', fragments.routines,
    '## Mood Rules', fragments.moodRules,
    '## Environment', JSON.stringify(fragments.env, null, 2),
    '## User Input', userText || '(no user input)',
  ].join('\n\n');
}
