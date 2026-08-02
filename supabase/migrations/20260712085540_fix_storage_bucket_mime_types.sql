/*
# Fix storage bucket MIME types

1. Changes
  - Remove restrictive allowed_mime_types on course-content bucket
  - This allows all file types to be uploaded (slides, videos, docs, etc.)
  - The bucket remains public for reading, authenticated-only for writing

2. Why
  - Some file types were being rejected due to MIME type mismatches
  - Browser-detected MIME types don't always match the allowlist
  - Security is already handled by RLS policies (authenticated upload only)
*/

UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'course-content';
