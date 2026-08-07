-- One-time role bootstrap: update ONLY profiles.role for existing users matched by lowercase email
-- Idempotent: safe to re-run, only touches matching rows

UPDATE profiles
SET role = 'student',
      updated_at = now()
WHERE lower(email) = 'narikparamala@gmail.com'
  AND role IS DISTINCT FROM 'student';

UPDATE profiles
SET role = 'faculty',
      updated_at = now()
WHERE lower(email) = 'paramalanarik@gmail.com'
  AND role IS DISTINCT FROM 'faculty';

UPDATE profiles
SET role = 'super_admin',
      updated_at = now()
WHERE lower(email) = 'mitshutaki002@gmail.com'
  AND role IS DISTINCT FROM 'super_admin';