/**
 * Canva embed helpers.
 *
 * Canva share links (`https://www.canva.com/design/{id}/{token}/view`) do not
 * render in iframes — the embeddable form appends `?embed`. Legacy single-token
 * links (`/design/{id}/view`) are tolerated for robustness. Edit links are
 * normalized to view mode so students can never open an editor.
 */
export type CanvaEmbedInfo = {
  embedUrl: string;
  ratio: number | null;
};

// Standard: /design/{designId}/{token}/view  |  Legacy: /design/{designId}/view
// The token segment must not be one of the mode keywords.
const CANVA_DESIGN_RE = /^https:\/\/www\.canva\.com\/design\/([A-Za-z0-9_-]+)(?:\/(?!view\b|edit\b|preview\b)([A-Za-z0-9_-]+))?(?:\/(view|edit|preview))?/;

/**
 * Returns the embeddable URL for a Canva design link, or null when the URL is
 * not a Canva design link. Edit/preview links are converted to view mode; an
 * existing `?embed` query is replaced, never duplicated.
 */
export function toCanvaEmbedUrl(url: string): CanvaEmbedInfo | null {
  const trimmed = url.trim();
  const match = CANVA_DESIGN_RE.exec(trimmed);
  if (!match) return null;
  const [, designId, token] = match;
  const embedUrl = token
    ? `https://www.canva.com/design/${designId}/${token}/view?embed`
    : `https://www.canva.com/design/${designId}/view?embed`;
  try {
    const parsed = new URL(trimmed);
    const ratioParam = parsed.searchParams.get('ratio');
    const ratio = ratioParam ? Number(ratioParam) : null;
    return { embedUrl, ratio: ratio && Number.isFinite(ratio) ? ratio : null };
  } catch {
    return { embedUrl, ratio: null };
  }
}

export function isCanvaUrl(url: string | null | undefined): boolean {
  return Boolean(url && CANVA_DESIGN_RE.test(url.trim()));
}
