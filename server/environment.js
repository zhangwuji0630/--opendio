function timeBlock(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late-night';
}

function timeBlockLabel(block) {
  return {
    morning: '早间启动',
    midday: '午间过渡',
    afternoon: '下午续航',
    evening: '晚间松弛',
    'late-night': '深夜低声',
  }[block] || '当前时段';
}

async function fetchJson(url, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'opendio/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function weatherMood(code) {
  if (code == null) return { label: '未知天气', hint: '天气信息暂不可用，先按当前时段来排。' };
  if (code === 0) return { label: '晴', hint: '天气清爽，可以放一点明亮但不刺耳的歌。' };
  if ([1, 2, 3].includes(code)) return { label: '多云', hint: '天气有点柔和，适合旋律感和松弛感。' };
  if ([45, 48].includes(code)) return { label: '雾', hint: '空气有点朦胧，适合低一点、空间感强的声音。' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: '雨', hint: '下雨时适合更贴近、安静、有情绪的歌。' };
  if (code >= 71 && code <= 77) return { label: '雪', hint: '雪天适合柔软、慢一点、有留白的歌。' };
  if (code >= 95) return { label: '雷雨', hint: '外面天气重，音乐可以稳一点，别太躁。' };
  return { label: '变化天气', hint: '天气有变化，适合保持稳定、不要突然跳太远。' };
}

async function geocode(location) {
  const query = encodeURIComponent(location || 'Shanghai');
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=zh&format=json`);
  const item = data?.results?.[0];
  if (!item) return null;
  return {
    name: item.name,
    country: item.country,
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone,
  };
}

export async function loadEnvironmentContext(extra = {}, settings = {}) {
  const now = new Date();
  const hour = now.getHours();
  const block = timeBlock(hour);
  const base = {
    nowISO: now.toISOString(),
    hour,
    timeLabel: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
    timeBlock: block,
    timeBlockLabel: timeBlockLabel(block),
    location: settings.weatherLocation || process.env.WEATHER_LOCATION || 'Shanghai',
    weather: null,
    weatherHint: null,
    ...extra,
  };

  if (settings.enableWeatherContext === false || process.env.ENABLE_WEATHER_CONTEXT === '0') return base;

  try {
    const place = await geocode(base.location);
    if (!place) return { ...base, weatherHint: '没查到天气位置，先按当前时段来排。' };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const data = await fetchJson(url);
    const current = data?.current || {};
    const mood = weatherMood(Number(current.weather_code));
    return {
      ...base,
      location: place.name || base.location,
      weather: {
        label: mood.label,
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        precipitation: current.precipitation,
        windSpeed: current.wind_speed_10m,
        code: current.weather_code,
      },
      weatherHint: mood.hint,
    };
  } catch (error) {
    return { ...base, weatherHint: `天气暂时没接上：${error.message}` };
  }
}
