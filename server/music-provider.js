import { createApplePreviewProvider } from './providers/apple-preview.js';
import { createNeteaseCliProvider } from './providers/netease-cli.js';

export function createMusicProvider() {
  const providerName = process.env.MUSIC_PROVIDER || 'apple-preview';
  if (providerName === 'netease-cli') return createNeteaseCliProvider();
  return createApplePreviewProvider();
}

export async function getProviderLibrary({ fragments }) {
  const provider = createMusicProvider();
  try {
    const playlist = await provider.listLibrary?.({ playlist: fragments.playlist });
    return { provider, playlist: playlist?.length ? playlist : fragments.playlist, providerFailed: false };
  } catch (error) {
    console.warn(`[music-provider] ${provider.name} library failed: ${error.message}`);
    return { provider, playlist: fragments.playlist, providerFailed: true };
  }
}

export async function hydrateTrack(provider, track) {
  if (!track) return null;
  if ((track.provider || track.source) === 'netease-cli' && track.originalId && track.encryptedId) {
    const streamUrl = await provider.getStreamUrl?.(track);
    return { ...track, url: streamUrl || track.url, provider: 'netease-cli', source: 'netease-cli' };
  }
  if (provider?.name === 'netease-cli' && !track.originalId && !track.encryptedId && track.url) {
    return { ...track, provider: track.provider || track.source || 'apple-preview', source: track.source || track.provider || 'apple-preview' };
  }
  const streamUrl = await provider.getStreamUrl?.(track);
  return {
    ...track,
    url: streamUrl || track.url,
    provider: track.provider || track.source || provider.name,
  };
}

export async function pickTrack({ fragments, userText = '' }) {
  const { provider, playlist } = await getProviderLibrary({ fragments });
  const track = await provider.pickTrack?.({ playlist, userText, env: fragments.env });
  return hydrateTrack(provider, track);
}
