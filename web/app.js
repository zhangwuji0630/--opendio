const $ = (id) => document.getElementById(id);
const audio = $('audio');
const clock = $('clock');
const title = $('title');
const artist = $('artist');
const reason = $('reason');
const djText = $('djText');
const input = $('input');
const canvas = $('wave');
const ctx = canvas.getContext('2d');

let state = null;
let phase = 0;

function tickClock() {
  const d = new Date();
  clock.textContent = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickClock, 1000); tickClock();

function applyState(next) {
  state = next;
  if (!state?.current) return;
  title.textContent = state.current.title;
  artist.textContent = state.current.artist;
  reason.textContent = state.dj?.reason || state.current.reason || '';
  djText.textContent = state.dj?.say || '我在听。';
  if (audio.src !== state.current.url) {
    audio.src = state.current.url;
    audio.load();
  }
}

async function fetchNow() {
  const r = await fetch('/api/now');
  applyState(await r.json());
}

const stream = new EventSource('/stream');
stream.addEventListener('state', (event) => applyState(JSON.parse(event.data)));
stream.onerror = () => setTimeout(fetchNow, 1000);
fetchNow();

$('chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  djText.textContent = '让我想一下。';
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  applyState(await r.json());
  speakDJ();
});

$('nextBtn').addEventListener('click', async () => {
  const r = await fetch('/api/next');
  applyState(await r.json());
  speakDJ();
});

$('playBtn').addEventListener('click', () => {
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});

function speakDJ() {
  if (!('speechSynthesis' in window) || !state?.dj?.say) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(state.dj.say);
  u.lang = 'zh-CN';
  u.rate = 0.92;
  u.pitch = 0.82;
  speechSynthesis.speak(u);
}

function drawWave() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bars = 96;
  const playing = !audio.paused;
  phase += playing ? 0.055 : 0.012;
  for (let i = 0; i < bars; i++) {
    const x = (i / bars) * w;
    const center = Math.sin((i / bars) * Math.PI);
    const a = Math.sin(i * 0.31 + phase * 2.3) * 0.5 + 0.5;
    const b = Math.sin(i * 0.12 + phase * 1.2) * 0.5 + 0.5;
    const amp = (a * 0.7 + b * 0.3) * center;
    const bh = 12 + amp * h * (playing ? 0.78 : 0.28);
    const y = (h - bh) / 2;
    const grd = ctx.createLinearGradient(0, y, 0, y + bh);
    grd.addColorStop(0, 'rgba(104,168,255,.95)');
    grd.addColorStop(1, 'rgba(207,117,255,.7)');
    ctx.fillStyle = grd;
    ctx.globalAlpha = 0.42 + amp * 0.5;
    ctx.fillRect(x, y, 3, bh);
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(drawWave);
}
drawWave();
