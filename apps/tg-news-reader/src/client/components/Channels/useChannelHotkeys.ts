import { useEffect } from 'react';
import { useChannels } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';

/**
 * Global hotkeys for channel list navigation.
 * Uses e.code so they work regardless of keyboard layout (Russian, Czech, etc.).
 *
 * [ (BracketLeft)  — previous channel in the current group
 * ] (BracketRight) — next channel in the current group
 *
 * If no channel is currently selected, both keys select the first channel.
 */
export function useChannelHotkeys() {
  const { data: allChannels = [] } = useChannels();
  const { selectedChannelId, setSelectedChannelId, selectedGroupId } = useUIStore();

  const channels = allChannels.filter((ch) =>
    selectedGroupId === null ? !ch.groupId : ch.groupId === selectedGroupId,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable) return;
      if (channels.length === 0) return;

      e.preventDefault();

      const currentIdx = channels.findIndex((ch) => ch.id === selectedChannelId);

      if (e.code === 'BracketLeft') {
        // Previous channel — clamp at 0; if none selected (-1), go to first
        const prevIdx = Math.max(0, currentIdx - 1);
        setSelectedChannelId(channels[prevIdx].id);
      } else {
        // Next channel — clamp at end; if none selected (-1), go to first
        const nextIdx = currentIdx < 0 ? 0 : Math.min(channels.length - 1, currentIdx + 1);
        setSelectedChannelId(channels[nextIdx].id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels, selectedChannelId, setSelectedChannelId]);
}
