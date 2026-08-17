-- Update live_sessions to allow created_by to be nullable for seed data
ALTER TABLE live_sessions ALTER COLUMN created_by DROP NOT NULL;

-- Seed sample live sessions for demo
DO $$
DECLARE
  v_course_id uuid;
  v_creator_id uuid;
BEGIN
  -- Get Python Fundamentals course
  SELECT id INTO v_course_id FROM courses WHERE slug = 'python-fundamentals' LIMIT 1;
  -- Get any admin or faculty ID, or fallback to any user
  SELECT id INTO v_creator_id FROM profiles WHERE role IN ('faculty', 'super_admin') LIMIT 1;
  
  IF v_creator_id IS NULL THEN
    SELECT id INTO v_creator_id FROM profiles LIMIT 1;
  END IF;
  
  -- Insert upcoming session
  INSERT INTO live_sessions (course_id, title, description, session_date, duration_minutes, google_meet_url, status, slides_unlocked, materials_unlocked, created_by)
  VALUES (
    v_course_id,
    'Introduction to Python Fundamentals',
    'Live interactive session covering Python basics, variables, and data types. Bring your questions!',
    now() + interval '2 days',
    90,
    'https://meet.google.com/abc-defg-hij',
    'scheduled',
    false,
    false,
    v_creator_id
  );
  
  -- Insert another upcoming session
  INSERT INTO live_sessions (course_id, title, description, session_date, duration_minutes, google_meet_url, status, slides_unlocked, materials_unlocked, created_by)
  VALUES (
    v_course_id,
    'Control Flow and Functions Workshop',
    'Hands-on workshop practicing if-else, loops, and function definitions.',
    now() + interval '5 days',
    75,
    'https://meet.google.com/xyz-test-meet',
    'scheduled',
    false,
    false,
    v_creator_id
  );
  
  -- Insert a completed session
  INSERT INTO live_sessions (course_id, title, description, session_date, duration_minutes, google_meet_url, status, slides_unlocked, materials_unlocked, created_by)
  VALUES (
    v_course_id,
    'Data Structures Deep Dive',
    'Completed session on lists, dictionaries, sets, and tuples.',
    now() - interval '3 days',
    90,
    'https://meet.google.com/old-session-link',
    'completed',
    true,
    true,
    v_creator_id
  );
  
  -- Insert a live session (currently happening)
  INSERT INTO live_sessions (course_id, title, description, session_date, duration_minutes, google_meet_url, status, slides_unlocked, materials_unlocked, created_by)
  VALUES (
    v_course_id,
    'Live Coding Session: Functions in Action',
    'Join us for a live coding demonstration of Python functions.',
    now() - interval '30 minutes',
    60,
    'https://meet.google.com/live-now-session',
    'live',
    false,
    false,
    v_creator_id
  );
END $$;

-- Add session_resources for the completed session
INSERT INTO session_resources (session_id, title, resource_type, is_locked, order_index)
SELECT 
  ls.id,
  'Python Basics Slides',
  'slides',
  false,
  1
FROM live_sessions ls
WHERE ls.title = 'Data Structures Deep Dive' AND ls.status = 'completed';

INSERT INTO session_resources (session_id, title, resource_type, content, is_locked, order_index)
SELECT 
  ls.id,
  'Session Notes: Data Structures',
  'notes',
  '# Data Structures in Python

## Lists
- Ordered, mutable sequences
- Can contain mixed types
- Common operations: append, insert, remove, pop

## Dictionaries
- Key-value pairs
- Fast lookup by key
- Common operations: get, keys, values, items

## Sets
- Unordered collection of unique elements
- Useful for membership testing
- Set operations: union, intersection, difference

## Tuples
- Ordered, immutable sequences
- Can be used as dictionary keys
- Good for fixed collections',
  false,
  2
FROM live_sessions ls
WHERE ls.title = 'Data Structures Deep Dive' AND ls.status = 'completed';

INSERT INTO session_resources (session_id, title, resource_type, content, is_locked, order_index)
SELECT 
  ls.id,
  'Practice: Data Structures',
  'practice_questions',
  '# Practice Questions

1. Create a list of the first 10 even numbers
2. Given a dictionary of student grades, find the average
3. Remove duplicates from a list using a set
4. Create a tuple of coordinates',
  false,
  3
FROM live_sessions ls
WHERE ls.title = 'Data Structures Deep Dive' AND ls.status = 'completed';

INSERT INTO session_resources (session_id, title, resource_type, content, is_locked, order_index)
SELECT 
  ls.id,
  'Code Examples: Data Structures',
  'code_example',
  '# List operations
numbers = [1, 2, 3, 4, 5]
numbers.append(6)
numbers.insert(0, 0)
print(numbers)  # [0, 1, 2, 3, 4, 5, 6]

# Dictionary operations
student = {"name": "Priya", "age": 22, "gpa": 3.9}
print(student.get("name"))  # Priya

# Set operations
unique_numbers = set([1, 1, 2, 2, 3, 3])
print(unique_numbers)  # {1, 2, 3}

# Tuple operations
coordinates = (10, 20, 30)
x, y, z = coordinates  # unpacking',
  false,
  4
FROM live_sessions ls
WHERE ls.title = 'Data Structures Deep Dive' AND ls.status = 'completed';