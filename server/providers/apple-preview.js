export function createApplePreviewProvider() {
  return {
    name: 'apple-preview',

    async listLibrary({ playlist = [] } = {}) {
      return playlist;
    },

    async pickTrack({ playlist = [], userText = '', env = {} } = {}) {
      const text = userText.toLowerCase();
      const hour = env.hour ?? new Date().getHours();
      const scored = playlist.map((track) => {
        let score = 0;
        const hay = `${track.title} ${track.artist} ${(track.mood || []).join(' ')} ${track.reason}`.toLowerCase();

        for (const token of text.split(/\s+/).filter(Boolean)) {
          if (hay.includes(token)) score += 2;
        }
        if (/夜|晚|深夜|night|氛围|松|柔|写|内容|bgm|bmg|累|舒服|安静/i.test(userText)) {
          for (const m of track.mood || []) {
            if (['night', 'late-night', 'soft', 'writing', 'dreamy', 'content', 'focus'].includes(m)) score += 2;
          }
        }
        if (/节奏|提神|下午|groove|beat|动/i.test(userText)) {
          for (const m of track.mood || []) {
            if (['groove', 'content', 'focus'].includes(m)) score += 2;
          }
        }
        if (hour >= 20 || hour < 6) {
          for (const m of track.mood || []) {
            if (['night', 'late-night', 'soft', 'dreamy', 'melancholy'].includes(m)) score += 1;
          }
        }
        score += Math.random() * 0.5;
        return { track, score };
      }).sort((a, b) => b.score - a.score);

      return scored[0]?.track || playlist[0] || null;
    },

    async getStreamUrl(track) {
      return track?.url || null;
    },

    async getLyrics() {
      return null;
    },
  };
}
