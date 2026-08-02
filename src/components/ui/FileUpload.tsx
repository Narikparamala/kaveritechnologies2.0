import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { Upload, X, FileText, Image, Video, File, Loader2 } from 'lucide-react';
import { formatFileSize, getFileTypeLabel } from '../../services/fileUpload';

interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  onUpload: (file: File) => Promise<string>;
  onRemove?: () => void;
  currentUrl?: string | null;
  currentName?: string | null;
  label?: string;
  hint?: string;
  compact?: boolean;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return Image;
  if (['mp4', 'webm'].includes(ext)) return Video;
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return FileText;
  return File;
}

export function FileUpload({
  accept = '*',
  maxSizeMB = 100,
  onUpload,
  onRemove,
  currentUrl,
  currentName,
  label,
  hint,
  compact = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Maximum size: ${maxSizeMB} MB`);
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (currentUrl) {
    const displayName = currentName || currentUrl.split('/').pop() || 'File';
    const Icon = getFileIcon(displayName);
    return (
      <div>
        {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
            <Icon size={16} className="text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{displayName}</p>
            <p className="text-xs text-slate-400">{getFileTypeLabel(displayName)}</p>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              View
            </a>
            {onRemove && (
              <button
                onClick={onRemove}
                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                type="button"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed transition-all
          ${dragOver
            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700'
          }
          ${compact ? 'p-4' : 'p-6'}
          flex flex-col items-center justify-center text-center
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        {uploading ? (
          <Loader2 className="animate-spin text-primary-500 mb-2" size={compact ? 20 : 28} />
        ) : (
          <Upload className="text-slate-400 mb-2" size={compact ? 20 : 28} />
        )}
        <p className={`font-medium text-slate-600 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          {uploading ? 'Uploading...' : 'Drop file here or click to browse'}
        </p>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
