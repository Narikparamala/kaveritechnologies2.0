import { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from '../ui/Modal';

/**
 * Drag-and-zoom image cropper for course cover images.
 *
 * The crop frame is always 16:9 (matches the course-card aspect ratio), so
 * what the faculty member frames here is exactly what students see on the
 * card — no more letterboxed white slabs or surprise crops. Exports a
 * 1280x720 JPEG rendered on an offscreen canvas (dependency-free).
 */

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Offset = { x: number; y: number };
type Dims = { w: number; h: number };

export default function ImageCropperModal({
  open,
  file,
  title = 'Crop cover image',
  onCancel,
  onApply,
}: {
  open: boolean;
  file: File | null;
  title?: string;
  onCancel: () => void;
  onApply: (cropped: File) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragging = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const pinch = useRef<{ distance: number; baseZoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<Dims | null>(null);
  const [viewportDims, setViewportDims] = useState<Dims>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the selected file into an object URL + read its natural size.
  useEffect(() => {
    if (!open || !file) {
      setImageUrl(null);
      setImageSize(null);
      imageRef.current = null;
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const img = new Image();
    imageRef.current = img;
    img.onload = () => setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError('This file could not be read as an image. Try a JPG or PNG.');
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // Track the frame size so the cover math can run in pixels.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !open) return;
    const measure = () => setViewportDims({ w: viewport.clientWidth, h: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [open]);

  const clampOffset = useCallback((next: Offset, zoomValue: number): Offset => {
    if (!imageSize || !viewportDims.w) return { x: 0, y: 0 };
    const baseScale = Math.max(viewportDims.w / imageSize.w, viewportDims.h / imageSize.h);
    const maxX = Math.max(0, (imageSize.w * baseScale * zoomValue - viewportDims.w) / 2);
    const maxY = Math.max(0, (imageSize.h * baseScale * zoomValue - viewportDims.h) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [imageSize, viewportDims]);

  const applyZoom = useCallback((nextZoom: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(clamped);
    setOffset(current => clampOffset(current, clamped));
  }, [clampOffset]);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), baseZoom: zoom };
      dragging.current = null;
      return;
    }
    viewportRef.current?.setPointerCapture(event.pointerId);
    dragging.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) applyZoom(pinch.current.baseZoom * (distance / pinch.current.distance));
      return;
    }

    if (dragging.current?.pointerId === event.pointerId) {
      const d = dragging.current;
      setOffset(clampOffset(
        { x: d.baseX + (event.clientX - d.startX), y: d.baseY + (event.clientY - d.startY) },
        zoom,
      ));
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (dragging.current?.pointerId === event.pointerId) dragging.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    applyZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  };

  /** Render the visible frame to a 1280x720 canvas and hand back a File. */
  const handleApply = () => {
    if (!imageSize || !imageRef.current || !viewportDims.w) return;
    setApplying(true);
    try {
      const baseScale = Math.max(viewportDims.w / imageSize.w, viewportDims.h / imageSize.h);
      const renderScale = baseScale * zoom;
      // Portion of the source image visible inside the 16:9 frame.
      const srcW = viewportDims.w / renderScale;
      const srcH = viewportDims.h / renderScale;
      const srcX = (imageSize.w - srcW) / 2 - offset.x / renderScale;
      const srcY = (imageSize.h - srcH) / 2 - offset.y / renderScale;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not supported in this browser.');
      // White base so transparent PNGs don't export with a black background.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      ctx.drawImage(imageRef.current, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

      canvas.toBlob(blob => {
        setApplying(false);
        if (!blob) {
          setError('Could not process the image. Try a different file.');
          return;
        }
        const baseName = (file?.name ?? 'cover').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'cover';
        onApply(new File([blob], `${baseName}-cover.jpg`, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    } catch (applyError) {
      setApplying(false);
      setError(applyError instanceof Error ? applyError.message : 'Could not process the image.');
    }
  };

  const baseScale = imageSize && viewportDims.w
    ? Math.max(viewportDims.w / imageSize.w, viewportDims.h / imageSize.h)
    : 0;
  const renderW = imageSize && baseScale ? imageSize.w * baseScale * zoom : 0;
  const renderH = imageSize && baseScale ? imageSize.h * baseScale * zoom : 0;

  return (
    <Modal open={open} onClose={() => { if (!applying) onCancel(); }} title={title} size="lg">
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>
        )}

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          className="relative aspect-video w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-slate-900 active:cursor-grabbing"
          aria-label="Crop area — drag to reposition, scroll or pinch to zoom"
        >
          {imageUrl && renderW > 0 && (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: `${renderW}px`,
                height: `${renderH}px`,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          {/* Rule-of-thirds guides */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="border border-white/15" />
            ))}
          </div>
          {imageUrl && !imageSize && !error && (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading image…</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => applyZoom(zoom / 1.2)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={event => applyZoom(Number(event.target.value))}
            className="flex-1 accent-primary-600"
            aria-label="Zoom"
          />
          <button type="button" onClick={() => applyZoom(zoom * 1.2)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Reset crop">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        <p className="text-xs text-slate-400">Drag to reposition · scroll or pinch to zoom · exports 1280×720 (16:9), exactly what students see on the card.</p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={applying} className="btn-secondary">Cancel</button>
          <button type="button" onClick={handleApply} disabled={!imageSize || applying} className="btn-primary flex items-center gap-2">
            {applying ? <Loader2 size={14} className="animate-spin" /> : <Crop size={14} />}
            Apply crop
          </button>
        </div>
      </div>
    </Modal>
  );
}
