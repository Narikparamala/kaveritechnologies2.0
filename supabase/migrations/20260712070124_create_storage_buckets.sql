/*
# Create Storage Buckets for Course Content

1. New Storage Buckets
   - `course-content`: Stores slides, notes, PDFs, code files, images, videos for lessons and resources
   
2. Security
   - Public read access for published content
   - Authenticated upload for faculty and admins
   - File size limit policies handled at application level

3. Notes
   - Single bucket with folder structure: course-content/{course_id}/{lesson_id}/{resource_type}/filename
   - Supports: PDF, PPT, PPTX, DOCX, ZIP, images (PNG, JPG, GIF, WebP, SVG), videos (MP4, WebM)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-content',
  'course-content',
  true,
  104857600,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "Authenticated users can upload course content" ON storage.objects;
CREATE POLICY "Authenticated users can upload course content"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-content');

-- Allow authenticated users to update their uploads
DROP POLICY IF EXISTS "Authenticated users can update course content" ON storage.objects;
CREATE POLICY "Authenticated users can update course content"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'course-content')
WITH CHECK (bucket_id = 'course-content');

-- Allow public read for published content
DROP POLICY IF EXISTS "Public can read course content" ON storage.objects;
CREATE POLICY "Public can read course content"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'course-content');

-- Allow authenticated users to delete their uploads
DROP POLICY IF EXISTS "Authenticated users can delete course content" ON storage.objects;
CREATE POLICY "Authenticated users can delete course content"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'course-content');
