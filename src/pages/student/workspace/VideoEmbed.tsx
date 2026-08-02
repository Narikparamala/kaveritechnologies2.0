import { useState } from 'react';
import { Play, Maximize2, Volume2 } from 'lucide-react';

interface VideoEmbedProps {
  videoUrl: string;
  title?: string;
}

function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

function isGoogleDrive(url: string): string | null {
  const m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function VideoEmbed({ videoUrl, title }: VideoEmbedProps) {
  const [playing, setPlaying] = useState(false);
  const ytId = getYouTubeId(videoUrl);
  const driveId = isGoogleDrive(videoUrl);

  if (ytId) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 shadow-lg">
        {!playing ? (
          <button
            onClick={() => setPlaying(true)}
            className="relative w-full aspect-video group"
          >
            <img
              src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`}
              alt={title ?? 'Video thumbnail'}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Play size={28} className="text-slate-900 ml-1" fill="currentColor" />
              </div>
            </div>
            {title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white text-sm font-medium">{title}</p>
              </div>
            )}
          </button>
        ) : (
          <div className="relative w-full aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              title={title ?? 'Lesson video'}
            />
          </div>
        )}
      </div>
    );
  }

  if (driveId) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 shadow-lg">
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          title={title ?? 'Lesson video'}
        />
      </div>
    );
  }

  if (isDirectVideo(videoUrl)) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 shadow-lg">
        <video
          controls
          className="w-full aspect-video"
          preload="metadata"
          title={title ?? 'Lesson video'}
        >
          <source src={videoUrl} />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
        <Play size={20} fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title ?? 'Watch Video'}</p>
        <p className="text-xs text-slate-400 truncate">{videoUrl}</p>
      </div>
      <Maximize2 size={16} className="text-slate-400 flex-shrink-0" />
    </a>
  );
}
