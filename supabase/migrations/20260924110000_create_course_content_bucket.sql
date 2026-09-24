-- ============================================================================
-- FIX: the client service src/services/fileUpload.ts uploads lesson resources,
-- recorded videos and course thumbnails to the bucket "course-content", but
-- that bucket did not exist — every faculty file upload failed with
-- "The bucket was not found".
--
-- Create it with a strict MIME whitelist (SVG deliberately excluded: publicly
-- served SVG can embed scripts and is an XSS vector) and staff-only write
-- policies. The bucket is public-read so uploaded resource URLs work for
-- students; paths are unguessable (course/lesson UUIDs + timestamp).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-content', 'course-content', true, 104857600,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]::text[]
)
on conflict (id) do nothing;

-- Staff-only write access; authenticated users may list/read metadata.
drop policy if exists course_content_staff_insert on storage.objects;
drop policy if exists course_content_staff_update on storage.objects;
drop policy if exists course_content_staff_delete on storage.objects;
drop policy if exists course_content_authenticated_read on storage.objects;

create policy course_content_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-content'
    and (public.is_faculty() or public.is_admin())
  );

create policy course_content_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'course-content'
    and (public.is_faculty() or public.is_admin())
  )
  with check (
    bucket_id = 'course-content'
    and (public.is_faculty() or public.is_admin())
  );

create policy course_content_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-content'
    and (public.is_faculty() or public.is_admin())
  );

create policy course_content_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'course-content');
