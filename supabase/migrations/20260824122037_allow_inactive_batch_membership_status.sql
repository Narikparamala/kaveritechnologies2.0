alter table public.batch_students drop constraint if exists batch_students_status_check;
alter table public.batch_students add constraint batch_students_status_check check (status = any (array['active'::text,'inactive'::text,'removed'::text,'completed'::text,'transferred'::text]));;
