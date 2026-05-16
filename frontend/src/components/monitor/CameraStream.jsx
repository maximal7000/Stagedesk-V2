/**
 * Kamera-Stream-Player. Unterstützt:
 *   - img    : MJPEG / Bild-Stream (direkt im <img>)
 *   - video  : MP4 oder Browser-natives HLS (Safari)
 *   - hls    : HLS-Stream via hls.js (Chromium/Firefox)
 *   - iframe : eingebettete Seite/Embed
 *
 * RTSP-Quellen müssen extern in HLS oder MJPEG umgewandelt werden, z.B.
 * mit go2rtc oder mediamtx als Proxy auf dem Pi. URL hier ist dann der
 * HLS-Endpoint des Proxys (.m3u8).
 */
import { useEffect, useRef } from 'react';

export default function CameraStream({ url, typ, title }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (typ !== 'hls' || !url || !videoRef.current) return;
    const video = videoRef.current;

    // Safari + iOS spielen HLS nativ
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      return;
    }

    // hls.js lazy laden
    let hls = null;
    let cancelled = false;
    import('hls.js').then((mod) => {
      if (cancelled) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) {
        video.src = url;  // letzter Versuch
        return;
      }
      hls = new Hls({ lowLatencyMode: true, maxLiveSyncPlaybackRate: 1.5 });
      hls.loadSource(url);
      hls.attachMedia(video);
    }).catch(() => { if (!cancelled) video.src = url; });

    return () => { cancelled = true; if (hls) try { hls.destroy(); } catch {} };
  }, [url, typ]);

  if (!url) return null;

  if (typ === 'iframe') {
    return (
      <iframe src={url} className="w-full h-full min-h-[240px] border-0" title={title || 'Kamera'} />
    );
  }
  if (typ === 'hls' || typ === 'video') {
    return (
      <video ref={videoRef}
        {...(typ === 'video' ? { src: url } : {})}
        autoPlay muted playsInline loop
        className="w-full h-full object-contain" />
    );
  }
  // img (MJPEG / Bild-Stream)
  return <img src={url} alt={title || 'Kamera'} className="w-full h-full object-contain" />;
}
