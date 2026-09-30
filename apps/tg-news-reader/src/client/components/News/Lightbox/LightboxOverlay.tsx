import { useUIStore } from '../../../store/uiStore';
import { LightboxViewer } from './LightboxViewer';

interface LightboxOverlayProps {
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

export function LightboxOverlay(props: LightboxOverlayProps) {
  const lightbox = useUIStore((s) => s.lightbox);
  return lightbox ? <LightboxViewer key={lightbox.channelId} lightbox={lightbox} {...props} /> : null;
}
