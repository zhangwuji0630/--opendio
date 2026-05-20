import { spawn } from 'node:child_process';

const OPENCLAW_COMMAND = process.env.OPENCLAW_AGENT_COMMAND || 'openclaw';
const OPENCLAW_SESSION_ID = process.env.OPENCLAW_AGENT_SESSION_ID || 'opendio-radio-agent';
const OPENCLAW_TIMEOUT_SECONDS = Number(process.env.OPENCLAW_AGENT_TIMEOUT_SECONDS || 90);

function compactTrack(track) {
  if (!track) return null;
  return {
    title: track.title || track.name || '',
    artist: track.artist || '',
    provider: track.provider || track.source || '',
  };
}

function buildAgentPrompt({ text, state, action = null, actionResult = null } = {}) {
  const current = compactTrack(state?.current);
  const program = (state?.program || []).slice(0, 6).map(item => ({
    type: item.type,
    label: item.label,
    status: item.status,
    title: item.title,
    artist: item.artist,
    text: item.type === 'talk' ? item.text : undefined,
  }));
  const context = {
    app: 'opendio personal AI radio',
    role: '你是 opendio 里的 OpenClaw 电台 agent。用中文简洁回复用户，可以根据当前歌曲、节目流、用户意图和外层已执行动作给建议。',
    current,
    player: state?.player ? { status: state.player.status, position: state.player.position, duration: state.player.duration } : null,
    program,
    recentMessages: (state?.messages || []).slice(-8),
    detectedAction: action,
    actionResult: actionResult ? { ok: actionResult.ok, type: actionResult.type, summary: actionResult.summary } : null,
  };
  const actionInstruction = actionResult?.summary && actionResult.ok
    ? `\n\n外层接口已经执行了动作：${actionResult.summary}。回复时可以确认这个结果，不要说“我不能控制播放器”。`
    : actionResult?.summary
      ? `\n\n外层接口尝试执行动作，但结果需要谨慎说明：${actionResult.summary}。不要假装动作完全成功。`
      : action?.type && action.type !== 'chat' && action.type !== 'explain'
        ? `\n\n外层识别到动作 ${action.type}，但没有可确认的执行摘要。请谨慎回复，不要假装成功。`
        : '';
  return `用户在 opendio 电台页面里对 agent 说：\n${text}\n\n当前电台上下文：\n${JSON.stringify(context, null, 2)}${actionInstruction}\n\n请直接回复用户，语气像 opendio 的贴身电台搭子，简短自然。`;
}

function extractReply(json) {
  return json?.result?.payloads?.[0]?.text
    || json?.result?.meta?.finalAssistantVisibleText
    || json?.result?.meta?.finalAssistantRawText
    || json?.payloads?.[0]?.text
    || json?.finalAssistantVisibleText
    || json?.reply
    || json?.text
    || '';
}

export function askOpenClawAgent({ text, state, action = null, actionResult = null } = {}) {
  return new Promise((resolve) => {
    const prompt = buildAgentPrompt({ text, state, action, actionResult });
    const args = [
      'agent',
      '--session-id', OPENCLAW_SESSION_ID,
      '--message', prompt,
      '--json',
      '--timeout', String(OPENCLAW_TIMEOUT_SECONDS),
    ];
    const child = spawn(OPENCLAW_COMMAND, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), (OPENCLAW_TIMEOUT_SECONDS + 8) * 1000);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: (stderr || stdout || `openclaw exited ${code}`).slice(0, 800) });
      try {
        const json = JSON.parse(stdout || '{}');
        const reply = extractReply(json).trim();
        if (!reply) return resolve({ ok: false, error: 'OpenClaw returned empty reply', raw: stdout.slice(0, 800) });
        resolve({ ok: true, reply, sessionId: OPENCLAW_SESSION_ID });
      } catch (error) {
        resolve({ ok: false, error: `OpenClaw JSON parse failed: ${error.message}`, raw: stdout.slice(0, 800) });
      }
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
  });
}
