-- ============================================================
-- PHASE A: Assign narikparamala@gmail.com to all Python courses
-- Idempotent: uses ON CONFLICT DO NOTHING on (course_id, faculty_id)
-- Does NOT modify users, roles, passwords, or unrelated data
-- ============================================================

INSERT INTO course_faculty (course_id, faculty_id)
SELECT c.id, p.id
FROM courses c
CROSS JOIN profiles p
WHERE lower(p.email) = 'narikparamala@gmail.com'
  AND p.role = 'faculty'
  AND (
    lower(c.title) LIKE '%python%'
    OR lower(c.slug) LIKE '%python%'
    OR lower(c.category) = 'python'
    OR lower(c.description) LIKE '%python%'
  )
ON CONFLICT (course_id, faculty_id) DO NOTHING;

-- Verification: read-only result
SELECT
  p.email AS faculty_email,
  c.title AS course_title,
  c.slug AS course_slug,
  CASE WHEN cf.id IS NOT NULL THEN 'assigned' ELSE 'not assigned' END AS assignment_status
FROM profiles p
CROSS JOIN courses c
LEFT JOIN course_faculty cf ON cf.course_id = c.id AND cf.faculty_id = p.id
WHERE lower(p.email) = 'narikparamala@gmail.com'
  AND (
    lower(c.title) LIKE '%python%'
    OR lower(c.slug) LIKE '%python%'
    OR lower(c.category) = 'python'
    OR lower(c.description) LIKE '%python%'
  )
ORDER BY c.title;
