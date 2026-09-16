/**
 * Backward-compatible re-export.
 * All embed logic lives in mediaEmbeds.ts — this file exists so existing
 * imports (`from '../../lib/canva'`) continue to resolve.
 */
export { isCanvaUrl, toCanvaEmbedUrl, detectEmbed } from './mediaEmbeds';
export type { EmbedInfo } from './mediaEmbeds';
