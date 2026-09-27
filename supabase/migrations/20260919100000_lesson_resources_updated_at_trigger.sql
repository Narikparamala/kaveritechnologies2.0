-- lesson_resources never bumped updated_at (no trigger), unlike every other
-- content table (courses, assignments, announcements, ... all use the shared
-- set_updated_at()). This made fresh-vs-stale rows indistinguishable when
-- debugging sync issues. Mirrors the existing convention; additive + idempotent.

DROP TRIGGER IF EXISTS lesson_resources_updated_at ON public.lesson_resources;

CREATE TRIGGER lesson_resources_updated_at
  BEFORE UPDATE ON public.lesson_resources
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
