import { streamIframeUrl } from '@/lib/cloudflare-stream';

export function StreamClip({ uid, title }: { uid: string; title: string }) {
  return (
    <div className="relative h-full w-full">
      <iframe
        src={streamIframeUrl(uid)}
        title={title}
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
