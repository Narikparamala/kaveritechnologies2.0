
/*
# Kaveri Technologies Academy - Seed Data

## Overview
Realistic seed data for courses, chapters, lessons, projects, achievements, and platform settings.
*/

-- ============================================================
-- PLATFORM SETTINGS
-- ============================================================
INSERT INTO platform_settings (key, value, description) VALUES
  ('platform_name', 'Kaveri Technologies Academy', 'Platform display name'),
  ('tagline', 'Learn Python. Build Projects. Become Industry Ready.', 'Platform tagline'),
  ('contact_email', 'info@kaveritech.com', 'Support email'),
  ('contact_phone', '+91 98765 43210', 'Support phone'),
  ('max_file_upload_mb', '50', 'Max file upload size in MB'),
  ('xp_per_lesson', '10', 'XP awarded per lesson completion'),
  ('xp_per_quiz', '50', 'XP awarded per quiz pass'),
  ('xp_per_assignment', '30', 'XP awarded per assignment submission'),
  ('maintenance_mode', 'false', 'Maintenance mode flag')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ACHIEVEMENTS
-- ============================================================
INSERT INTO achievements (title, description, icon, badge_color, xp_reward, condition_type, condition_value) VALUES
  ('First Step', 'Complete your first lesson', 'BookOpen', '#2563EB', 50, 'lessons_completed', 1),
  ('Python Beginner', 'Complete 10 lessons', 'Code', '#14B8A6', 100, 'lessons_completed', 10),
  ('Week Warrior', 'Maintain a 7-day learning streak', 'Flame', '#F59E0B', 200, 'streak_days', 7),
  ('Quiz Master', 'Pass 5 quizzes', 'Trophy', '#22C55E', 150, 'quizzes_passed', 5),
  ('Project Builder', 'Submit your first project', 'Hammer', '#8B5CF6', 100, 'projects_submitted', 1),
  ('Fast Learner', 'Complete a course in under 30 days', 'Zap', '#F59E0B', 300, 'course_speed', 30),
  ('Course Finisher', 'Complete your first course', 'Award', '#2563EB', 500, 'courses_completed', 1),
  ('Top Performer', 'Reach the top 10 on the leaderboard', 'Star', '#EF4444', 1000, 'leaderboard_rank', 10),
  ('Code Ninja', 'Save 10 code snippets', 'Terminal', '#1E293B', 75, 'snippets_saved', 10),
  ('Dedicated Learner', 'Maintain a 30-day streak', 'Calendar', '#14B8A6', 500, 'streak_days', 30)
ON CONFLICT DO NOTHING;

-- ============================================================
-- COURSES
-- ============================================================
DO $$
DECLARE
  c1_id uuid := 'a1b2c3d4-0001-0001-0001-000000000001';
  c2_id uuid := 'a1b2c3d4-0002-0002-0002-000000000002';
  c3_id uuid := 'a1b2c3d4-0003-0003-0003-000000000003';
  ch1_1 uuid := 'b1b2c3d4-0001-0001-0001-000000000001';
  ch1_2 uuid := 'b1b2c3d4-0001-0001-0001-000000000002';
  ch1_3 uuid := 'b1b2c3d4-0001-0001-0001-000000000003';
  ch1_4 uuid := 'b1b2c3d4-0001-0001-0001-000000000004';
  ch1_5 uuid := 'b1b2c3d4-0001-0001-0001-000000000005';
  ch1_6 uuid := 'b1b2c3d4-0001-0001-0001-000000000006';
  ch2_1 uuid := 'b2b2c3d4-0002-0002-0002-000000000001';
  ch2_2 uuid := 'b2b2c3d4-0002-0002-0002-000000000002';
  ch2_3 uuid := 'b2b2c3d4-0002-0002-0002-000000000003';
  ch2_4 uuid := 'b2b2c3d4-0002-0002-0002-000000000004';
  ch3_1 uuid := 'b3b2c3d4-0003-0003-0003-000000000001';
  ch3_2 uuid := 'b3b2c3d4-0003-0003-0003-000000000002';
  ch3_3 uuid := 'b3b2c3d4-0003-0003-0003-000000000003';
  ch3_4 uuid := 'b3b2c3d4-0003-0003-0003-000000000004';
BEGIN

-- Courses
INSERT INTO courses (id, title, slug, short_description, description, difficulty, duration_hours, category, is_published, is_featured, enrollment_count, certificate_eligible) VALUES
  (c1_id, 'Python Fundamentals', 'python-fundamentals', 'Master Python from scratch with hands-on projects and real-world examples.',
   'A comprehensive introduction to Python programming. Perfect for absolute beginners, this course takes you from zero to writing functional Python programs. You will learn variables, data types, control flow, functions, and object-oriented programming through practical examples and mini-projects.',
   'beginner', 40, 'python', true, true, 1250, true),
  (c2_id, 'Python Intermediate: Data Structures & OOP', 'python-intermediate', 'Deep dive into advanced Python with data structures, OOP, file handling, and modules.',
   'Take your Python skills to the next level. This course covers advanced data structures, object-oriented programming, decorators, generators, file handling, exception handling, and working with external libraries. Ideal for developers with basic Python knowledge.',
   'intermediate', 60, 'python', true, true, 890, true),
  (c3_id, 'Python for Data Science & Web', 'python-data-web', 'Learn APIs, Flask, FastAPI, Pandas, NumPy, and web scraping for real-world applications.',
   'A professional-level course covering web development with Flask and FastAPI, data science with Pandas and NumPy, web scraping, automation, and working with databases. Build real-world applications and add them to your portfolio.',
   'advanced', 80, 'python', true, false, 445, true)
ON CONFLICT (slug) DO NOTHING;

-- Chapters - Python Fundamentals
INSERT INTO chapters (id, course_id, title, description, order_index) VALUES
  (ch1_1, c1_id, 'Getting Started with Python', 'Setup, basics, and your first program', 1),
  (ch1_2, c1_id, 'Variables & Data Types', 'Numbers, strings, booleans, and type conversion', 2),
  (ch1_3, c1_id, 'Control Flow', 'Conditionals, loops, and program logic', 3),
  (ch1_4, c1_id, 'Functions', 'Defining, calling, and organizing code with functions', 4),
  (ch1_5, c1_id, 'Collections', 'Lists, tuples, sets, and dictionaries', 5),
  (ch1_6, c1_id, 'Strings & Modules', 'String manipulation and Python standard library', 6)
ON CONFLICT DO NOTHING;

-- Chapters - Python Intermediate
INSERT INTO chapters (id, course_id, title, description, order_index) VALUES
  (ch2_1, c2_id, 'Object-Oriented Programming', 'Classes, objects, inheritance, and polymorphism', 1),
  (ch2_2, c2_id, 'Advanced Functions', 'Decorators, generators, lambda, and closures', 2),
  (ch2_3, c2_id, 'File & Exception Handling', 'File I/O and robust error handling', 3),
  (ch2_4, c2_id, 'Modules & Packages', 'Standard library, pip, and virtual environments', 4)
ON CONFLICT DO NOTHING;

-- Chapters - Python Data Science & Web
INSERT INTO chapters (id, course_id, title, description, order_index) VALUES
  (ch3_1, c3_id, 'APIs and HTTP', 'Working with REST APIs and JSON', 1),
  (ch3_2, c3_id, 'Flask Web Framework', 'Building web applications with Flask', 2),
  (ch3_3, c3_id, 'Data Science with Pandas & NumPy', 'Data analysis and manipulation', 3),
  (ch3_4, c3_id, 'Web Scraping & Automation', 'BeautifulSoup, Selenium, and automation', 4)
ON CONFLICT DO NOTHING;

-- Lessons - Getting Started
INSERT INTO lessons (chapter_id, course_id, title, slug, notes_markdown, code_example, explanation, order_index, duration_minutes, xp_reward, is_free_preview) VALUES
  (ch1_1, c1_id, 'Introduction to Python', 'intro-to-python',
   E'## Welcome to Python\n\nPython is a high-level, interpreted programming language known for its simplicity and readability.\n\n### Why Learn Python?\n- **Easy to Read**: Python code reads almost like English\n- **Versatile**: Web, data science, AI, automation\n- **Large Community**: Millions of developers worldwide\n- **High Demand**: Top choice for employers',
   E'print("Hello, World!")\nprint("Welcome to Kaveri Technologies Academy!")',
   'Every Python journey begins with a simple print statement. The print() function outputs text to the console.',
   1, 15, 10, true),
  (ch1_1, c1_id, 'Setting Up Python Environment', 'python-setup',
   E'## Setting Up Your Python Environment\n\n### Installation\n1. Download Python from python.org\n2. Choose Python 3.x (latest stable)\n3. Run installer — check "Add Python to PATH"\n\n### Verify\n```bash\npython --version\n```',
   E'import sys\nprint(f"Python version: {sys.version}")\nprint(f"Path: {sys.executable}")',
   'Setting up the right development environment is crucial. We recommend VS Code with the Python extension.',
   2, 20, 10, true),
  (ch1_2, c1_id, 'Variables and Assignment', 'variables-assignment',
   E'## Variables in Python\n\nA variable is a named storage location for data.\n\n### Rules\n- Case-sensitive\n- Must start with letter or underscore\n- Cannot be Python keywords',
   E'name = "Priya"\nage = 22\ngpa = 3.8\nis_enrolled = True\n\nprint(f"Student: {name}, Age: {age}")',
   'Variables store data that can be used and changed throughout your program. Python uses dynamic typing.',
   1, 20, 10, false),
  (ch1_2, c1_id, 'Data Types in Python', 'data-types',
   E'## Python Data Types\n\n| Type | Example |\n|------|---------|\n| int | 42 |\n| float | 3.14 |\n| str | "hello" |\n| bool | True |',
   E'x = 42\ny = 3.14\ntext = "Hello"\nactive = True\nprint(type(x), type(y), type(text), type(active))',
   'Understanding data types is fundamental to programming. Python is dynamically typed.',
   2, 25, 10, false),
  (ch1_3, c1_id, 'If Statements and Conditionals', 'if-statements',
   E'## Conditional Statements\n\nConditionals let your program make decisions.\n\n```python\nif condition:\n    # true branch\nelif another:\n    # elif branch\nelse:\n    # default\n```',
   E'score = 85\nif score >= 90:\n    grade = "A"\nelif score >= 80:\n    grade = "B"\nelse:\n    grade = "C"\nprint(f"Grade: {grade}")',
   'Conditionals are the backbone of decision-making in programs. Python uses indentation to define code blocks.',
   1, 25, 10, false),
  (ch1_3, c1_id, 'For Loops and While Loops', 'loops',
   E'## Loops in Python\n\n### For Loop\n```python\nfor item in sequence:\n    # process item\n```\n\n### While Loop\n```python\nwhile condition:\n    # repeat\n```',
   E'for i in range(1, 6):\n    print(f"Count: {i}")\n\ncount = 0\nwhile count < 3:\n    print(f"While: {count}")\n    count += 1',
   'Loops are essential for processing collections of data and automating repetitive tasks.',
   2, 30, 10, false),
  (ch1_4, c1_id, 'Defining and Calling Functions', 'functions-basics',
   E'## Python Functions\n\nFunctions are reusable blocks of code.\n\n```python\ndef function_name(params):\n    """Docstring"""\n    return value\n```\n\n### Why Functions?\n- DRY Principle\n- Modularity\n- Reusability',
   E'def greet(name):\n    return f"Hello, {name}!"\n\ndef calculate_grade(score, passing=60):\n    return "Pass" if score >= passing else "Fail"\n\nprint(greet("Arjun"))\nprint(calculate_grade(75))',
   'Functions are the building blocks of organized, maintainable code.',
   1, 30, 10, false),
  (ch1_5, c1_id, 'Lists and List Operations', 'lists',
   E'## Python Lists\n\nLists are ordered, mutable collections.\n\n### Methods\n- append(x)\n- insert(i, x)\n- remove(x)\n- pop(i)\n- sort()',
   E'students = ["Alice", "Bob", "Charlie"]\nstudents.append("Diana")\nstudents.sort()\nfor i, s in enumerate(students, 1):\n    print(f"{i}. {s}")',
   'Lists are Python''s most versatile data structure. List comprehensions provide an elegant way to transform data.',
   1, 30, 10, false)
ON CONFLICT DO NOTHING;

END $$;

-- ============================================================
-- PROJECTS
-- ============================================================
INSERT INTO projects (title, description, difficulty, category, estimated_hours, tech_tags, requirements) VALUES
  ('Number Guessing Game', 'Build an interactive number guessing game where the computer picks a random number.', 'beginner', 'games', 3, ARRAY['python', 'random', 'loops'], 'Use random module, implement guess tracking, provide hints'),
  ('Student Grade Calculator', 'Create a program that manages student grades and calculates averages.', 'beginner', 'general', 4, ARRAY['python', 'functions', 'lists'], 'Input subjects and marks, calculate percentage, assign grade'),
  ('To-Do List CLI App', 'Build a command-line to-do list application with file persistence.', 'beginner', 'general', 5, ARRAY['python', 'file-handling', 'json'], 'Add/remove/complete tasks, save to JSON file'),
  ('Weather Dashboard', 'Build a weather dashboard that fetches real-time weather data from an API.', 'intermediate', 'apis', 8, ARRAY['python', 'requests', 'api', 'json'], 'Use OpenWeatherMap API, show temperature, humidity, 5-day forecast'),
  ('Expense Tracker with SQLite', 'Create a personal expense tracking application with categories and reports.', 'intermediate', 'general', 10, ARRAY['python', 'sqlite', 'pandas'], 'CRUD operations, category management, monthly summary'),
  ('Web Scraper for Job Listings', 'Build a web scraper that collects job listings from public boards.', 'intermediate', 'automation', 8, ARRAY['python', 'beautifulsoup', 'requests', 'csv'], 'Parse HTML, extract job details, handle pagination, export to CSV'),
  ('FastAPI REST API', 'Build a production-ready REST API for a library management system.', 'advanced', 'web', 15, ARRAY['python', 'fastapi', 'pydantic', 'jwt'], 'User auth, book CRUD, borrowing system, Swagger docs'),
  ('Machine Learning Text Classifier', 'Create a text classification model for news articles using scikit-learn.', 'advanced', 'ai', 20, ARRAY['python', 'scikit-learn', 'pandas', 'nlp'], 'Data preprocessing, TF-IDF, train models, evaluate accuracy'),
  ('Automated Report Generator', 'Build an automation system that generates PDF reports on a schedule.', 'advanced', 'automation', 12, ARRAY['python', 'reportlab', 'pandas', 'schedule'], 'Read CSV/Excel, generate PDFs, schedule, send via email'),
  ('Discord Bot', 'Create a feature-rich Discord bot with commands and API integrations.', 'intermediate', 'apis', 10, ARRAY['python', 'discord.py', 'async', 'api'], 'Basic commands, weather/joke APIs, role management')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE ANNOUNCEMENTS
-- ============================================================
INSERT INTO announcements (title, content, is_global) VALUES
  ('Welcome to Kaveri Technologies Academy!', 'We are thrilled to have you here. Start your Python journey today and join thousands of learners who have transformed their careers with us.', true),
  ('New Course: Python for Data Science', 'We are excited to announce our new advanced course — Python for Data Science & Web. Enroll today to get early access!', true),
  ('Platform Update - New Features Added', 'We have added a Python Playground, improved quiz experience, and faster certificate generation. Check out the new features!', true)
ON CONFLICT DO NOTHING;
