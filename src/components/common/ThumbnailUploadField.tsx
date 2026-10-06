import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { uploadFile } from '../../services/fileUpload';
import ImageCropperModal from './ImageCropperModal';

/**
 * Course cover field: paste an external URL, or pick a local image, crop &
 * adjust it to the card's 16:9 frame, and it uploads to Supabase storage and
 * fills in the URL automatically. Used by the faculty course create/edit
 * forms so every cover ships pre-cropped to exactly what the card shows.
 */
export default function ThumbnailUploadField({
  value,
  onChange,
  label = 'Cover Image',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const { error: toastError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toastError('Not an image', 'Choose a JPG, PNG, WebP or GIF file.');
      return;
    }
    setPickedFile(file);
    setCropperOpen(true);
  };

  const handleApply = async (cropped: File) => {
    setCropperOpen(false);
    setPickedFile(null);
    setUploading(true);
    try {
      // Course covers live in a shared folder — the course may not exist yet
      // (create flow), so the path is not keyed by course id.
      const result = await uploadFile(cropped, ['course-thumbnails']);
      onChange(result.publicUrl);
    } catch (error) {
      toastError('Upload failed', error instanceof Error ? error.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-start gap-3">
        <div className="relative aspect-video w-36 flex-none overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          {value ? (
            <>
              <img src={value} alt="Cover preview" className="h-full w-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
                title="Remove image"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
              <ImagePlus size={20} strokeWidth={1.5} />
              <span className="text-[10px] font-medium">No cover yet</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input className="input" placeholder="https://... (paste an external image URL)" value={value} onChange={event => onChange(event.target.value)} />
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handlePick} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary flex items-center gap-2 !py-2 text-xs"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {uploading ? 'Uploading…' : 'Upload & crop image'}
          </button>
          <p className="text-xs text-slate-400">Upload crops to the card's exact 16:9 frame — drag to adjust, zoom to fit.</p>
        </div>
      </div>

      <ImageCropperModal
        open={cropperOpen}
        file={pickedFile}
        title="Crop & adjust cover"
        onCancel={() => { setCropperOpen(false); setPickedFile(null); }}
        onApply={file => void handleApply(file)}
      />
    </div>
  );
}
