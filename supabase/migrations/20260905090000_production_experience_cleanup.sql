-- Remove demo announcements that carried unsupported marketing claims
-- ("join thousands of learners", Python-only messaging, "Python Playground").
-- These were inserted by the 02_seed_data migration as platform demo content.
-- They must not appear on a production platform that has not approved such claims.
-- Only the exact seeded global rows are removed; user/faculty-created announcements are untouched.

delete from public.announcements
where is_global = true
  and title in (
    'Welcome to Kaveri Technologies Academy!',
    'New Course: Python for Data Science',
    'Platform Update - New Features Added'
  );
