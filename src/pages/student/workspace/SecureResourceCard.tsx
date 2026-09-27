import { useState } from 'react';
import { Play, ChevronLeft, FileText, Video, Download, Lock } from 'lucide-react';
import { detectEmbed } from '../../../lib/mediaEmbeds';

interface SecureResourceCardProps {
  resource: {
    id: string;
    title: string;
    description?: string | null;
    external_url?: string | null;
    file_url?: string | null;
    is_locked?: boolean | null;
    resource_type?: string;
  };
}

/**
 * Student-safe resource card. Embeddable links (Canva, Google Slides, YouTube)
 * always render inline in an iframe — students never see or copy the raw URL.
 * Only non-embeddable files fall back to Download, and the link is never shown.
 */
export function SecureResourceCard({ resource }: SecureResourceCardProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const embed = detectEmbed(resource.external_url);

  const icon = embed?.type === 'youtube'
    ? <Video size={16} className="text-red-500 flex-shrink-0" />
    : <FileText size={16} className="text-primary-600 flex-shrink-0" />;
  const embedLabel = embed?.type === 'youtube' ? 'Watch video' : 'View slides';
  const hideLabel = embed?.type === 'youtube' ? 'Hide video' : 'Hide slides';

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{resource.title}</p>
          {resource.description && <p className="text-xs text-slate-400 mt-0.5">{resource.description}</p>}
        </div>
        {resource.is_locked ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 flex-shrink-0"><Lock size={11} /> Locked</span>
        ) : embed ? (
          <button
            onClick={() => setShowPlayer(s => !s)}
            className="btn-primary text-xs py-1.5 flex items-center gap-1 flex-shrink-0"
          >
            {showPlayer ? <ChevronLeft size={11} /> : <Play size={11} />}
            {showPlayer ? hideLabel : embedLabel}
          </button>
        ) : resource.file_url ? (
          <a
            href={resource.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0"
          >
            <Download size={11} /> Download
          </a>
        ) : null}
      </div>
      {embed && showPlayer && (
        <div className="px-3 pb-3">
          <div className="relative w-full" style={{ paddingTop: embed.ratio ? `${(1 / embed.ratio) * 100}%` : '56.25%' }}>
            {embed.type === 'youtube' ? (
              <iframe
                src={embed.embedUrl}
                title={resource.title}
                className="absolute inset-0 w-full h-full rounded-lg border border-slate-200 dark:border-slate-700"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <iframe
                src={embed.embedUrl}
                title={resource.title}
                className="absolute inset-0 w-full h-full rounded-lg border border-slate-200 dark:border-slate-700"
                loading="lazy"
                allow="fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {embed.type === 'youtube'
              ? 'Video plays right here — sharing outside the academy is not possible from this viewer.'
              : 'Slides view right here — presentation, fullscreen and page navigation work inside the frame.'}
          </p>
        </div>
      )}
    </div>
  );
}
