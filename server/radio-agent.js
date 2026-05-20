import { spawn } from 'node:child_process';
import { buildContextText } from './context.js';

function localFallback(track, userText, fragments) {
  const time = fragments.env.timeLabel;
  const intent = userText?.trim();
  let say;
  if (intent) {
    say = `收到。现在 ${time}，我先给你放 ${track.artist} 的《${track.title}》。${track.reason}。`;
  } else {
    say = `现在是 ${time}。先从 ${track.artist} 的《${track.title}》开始，声音放轻一点。`;
  }
  return {
    say,
    play: [track.id],
    reason: track.reason,
    segue: `接下来是 ${track.title}。`,
    source: 'local-fallback'
  };
}

export async function askDJ({ fragments, userText, track }) {
  // MVP 默认不用外部编排：Director 已负责主要节目流。保留一个通用 OpenClaw CLI 增强入口，失败自动 fallback。
  if (process.env.USE_OPENCLAW_DJ !== '1') return localFallback(track, userText, fragments);

  const prompt = `${buildContextText(fragments, userText)}\n\n请只输出 JSON：{ "say": string, "play": [song_id], "reason": string, "segue": string }。候选歌曲优先使用：${track.id}`;

  return await new Promise((resolve) => {
    const command = process.env.OPENCLAW_DJ_COMMAND || 'openclaw';
    const args = process.env.OPENCLAW_DJ_ARGS ? process.env.OPENCLAW_DJ_ARGS.split(/\s+/).filter(Boolean) : ['agent', 'run', '--json'];
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(prompt);
    child.stdin.end();
    let out = '';
    let err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', () => {
      try {
        const parsed = JSON.parse(out);
        const text = typeof parsed === 'string' ? parsed : (parsed.result || parsed.content || out);
        const json = typeof text === 'string' ? JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text) : text;
        resolve({ ...json, source: 'openclaw-cli' });
      } catch {
        resolve({ ...localFallback(track, userText, fragments), source: 'fallback-after-openclaw-error', error: err.slice(0, 500) });
      }
    });
    child.on('error', () => resolve(localFallback(track, userText, fragments)));
  });
}
