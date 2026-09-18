/**
 * Media embed helpers for lesson materials.
 *
 * Detects and normalizes embeddable URLs for:
 * - Canva slide decks
 * - Google Slides presentations
 * - YouTube videos
 *
 * Students never see raw embed URLs — they see inline viewers.
 */

export type EmbedInfo = {
  type: 'canva' | 'google-slides' | 'youtube';
  embedUrl: string;
  ratio: number | null;
  title: string;
};

// ── Canva ──────────────────────────────────────────────────────────────
const CANVA_DESIGN_RE =
  /^https:\/\/www\.canva\.com\/design\/([A-Za-z0-9_-]+)(?:\/(?!view\b|edit\b|preview\b)([A-Za-z0-9_-]+))?(?:\/(view|edit|preview))?/;
// Canva short links (canva.link/XXXX) redirect to /design/{id}/{token}/edit —
// the embed form is derived from the short code alone.
const CANVA_SHORT_RE = /^https:\/\/canva\.link\/([A-Za-z0-9]+)/;

function parseCanva(url: string): EmbedInfo | null {
  const short = CANVA_SHORT_RE.exec(url.trim());
  if (short) {
    const [, code] = short;
    return {
      type: 'canva',
      // Canva resolves the short code server-side for /design/... URLs.
      embedUrl: `https://www.canva.com/design/${code}/view?embed`,
      ratio: parseRatio(url),
      title: 'Canva Slides',
    };
  }
  const match = CANVA_DESIGN_RE.exec(url.trim());
  if (!match) return null;
  const [, designId, token] = match;
  const embedUrl = token
    ? `https://www.canva.com/design/${designId}/${token}/view?embed`
    : `https://www.canva.com/design/${designId}/view?embed`;
  const ratio = parseRatio(url);
  return { type: 'canva', embedUrl, ratio, title: 'Canva Slides' };
}

// ── Google Slides ──────────────────────────────────────────────────────
// Share link:  https://docs.google.com/presentation/d/{id}/edit?usp=sharing
// Embed link:  https://docs.google.com/presentation/d/{id}/embed?start=false&loop=false
const GOOGLE_SLIDES_RE =
  /^https:\/\/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)\/(edit|view|preview)/;

function parseGoogleSlides(url: string): EmbedInfo | null {
  const match = GOOGLE_SLIDES_RE.exec(url.trim());
  if (!match) return null;
  const [, id] = match;
  const embedUrl = `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`;
  return { type: 'google-slides', embedUrl, ratio: 16 / 9, title: 'Google Slides' };
}

// ── YouTube ────────────────────────────────────────────────────────────
// Standard:   https://www.youtube.com/watch?v={id}
// Short:      https://youtu.be/{id}
// Embed:      https://www.youtube.com/embed/{id}
const YT_STANDARD_RE = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/;
const YT_SHORT_RE = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/;
const YT_EMBED_RE = /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/;

function parseYouTube(url: string): EmbedInfo | null {
  const trimmed = url.trim();
  const match =
    YT_STANDARD_RE.exec(trimmed) ||
    YT_SHORT_RE.exec(trimmed) ||
    YT_EMBED_RE.exec(trimmed);
  if (!match) return null;
  const [, id] = match;
  const embedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  return { type: 'youtube', embedUrl, ratio: 16 / 9, title: 'YouTube Video' };
}

// ── Shared ─────────────────────────────────────────────────────────────
function parseRatio(url: string): number | null {
  try {
    const r = new URL(url).searchParams.get('ratio');
    if (!r) return null;
    const n = Number(r);
    return n > 0 && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Detect the embeddable type for a resource URL.
 * Returns null for non-embeddable URLs (PDFs, generic links, etc.).
 */
export function detectEmbed(url: string | null | undefined): EmbedInfo | null {
  if (!url) return null;
  return parseCanva(url) ?? parseGoogleSlides(url) ?? parseYouTube(url);
}

/**
 * Legacy helpers kept for backward compat with canva.ts imports.
 */
export function isCanvaUrl(url: string | null | undefined): boolean {
  return Boolean(url && (CANVA_DESIGN_RE.test(url.trim()) || CANVA_SHORT_RE.test(url.trim())));
}

export function toCanvaEmbedUrl(url: string): { embedUrl: string; ratio: number | null } | null {
  const info = parseCanva(url);
  if (!info) return null;
  return { embedUrl: info.embedUrl, ratio: info.ratio };
}
