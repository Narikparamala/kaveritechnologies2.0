// Safe static demo data — never touches the database
// Used only for /demo/* routes

export const DEMO_STUDENT = {
  id: 'demo-student-kiran',
  full_name: 'Kiran Kumar',
  email: 'kiran.demo@kaveritechacademy.in',
  role: 'student' as const,
  avatar_url: null,
  level: 3,
  xp_points: 1250,
  streak_days: 6,
  completed_lessons: 12,
  total_lessons: 32,
  phone: null,
  bio: 'Passionate Python learner exploring web development and data science.',
  is_active: true,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  last_active_date: '2026-07-08',
};

export const DEMO_FACULTY = {
  id: 'demo-faculty-priya',
  full_name: 'Priya Sharma',
  email: 'priya.demo@kaveritechacademy.in',
  role: 'faculty' as const,
  avatar_url: null,
  level: 8,
  xp_points: 5800,
  streak_days: 22,
  phone: '+91 98765 00001',
  bio: 'Python Trainer with 8+ years of industry experience. Specializes in web development and data science.',
  is_active: true,
  created_at: '2025-09-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  last_active_date: '2026-07-08',
};

export const DEMO_ADMIN = {
  id: 'demo-admin-arun',
  full_name: 'Arun Reddy',
  email: 'admin.demo@kaveritechacademy.in',
  role: 'super_admin' as const,
  avatar_url: null,
  level: 12,
  xp_points: 9200,
  streak_days: 45,
  phone: '+91 98765 00002',
  bio: 'Platform Administrator at Kaveri Technologies Academy.',
  is_active: true,
  created_at: '2025-06-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  last_active_date: '2026-07-08',
};

export const DEMO_COURSES = [
  {
    id: 'demo-course-1',
    title: 'Python Full Stack Development',
    slug: 'python-full-stack',
    short_description: 'Build complete web apps with Python, Flask, and modern databases.',
    difficulty: 'intermediate' as const,
    duration_hours: 60,
    enrollment_count: 890,
    is_published: true,
    is_featured: true,
    progress: 38,
    enrolled_at: '2026-06-01',
    faculty: 'Priya Sharma',
    category: 'python',
  },
  {
    id: 'demo-course-2',
    title: 'Python Fundamentals',
    slug: 'python-fundamentals',
    short_description: 'Master Python from scratch with hands-on projects.',
    difficulty: 'beginner' as const,
    duration_hours: 40,
    enrollment_count: 1250,
    is_published: true,
    is_featured: true,
    progress: 100,
    enrolled_at: '2026-05-01',
    faculty: 'Dr. Kavitha Murthy',
    category: 'python',
  },
];

export const DEMO_CHAPTERS = [
  {
    id: 'demo-ch-1',
    title: 'Getting Started with Python',
    order_index: 1,
    lessons: [
      { id: 'demo-l-1', title: 'Introduction to Python', slug: 'intro', duration_minutes: 15, completed: true, is_free_preview: true },
      { id: 'demo-l-2', title: 'Setting Up Your Environment', slug: 'setup', duration_minutes: 20, completed: true, is_free_preview: true },
    ],
  },
  {
    id: 'demo-ch-2',
    title: 'Variables & Data Types',
    order_index: 2,
    lessons: [
      { id: 'demo-l-3', title: 'Variables and Assignment', slug: 'variables', duration_minutes: 20, completed: true, is_free_preview: false },
      { id: 'demo-l-4', title: 'Data Types in Python', slug: 'data-types', duration_minutes: 25, completed: true, is_free_preview: false },
      { id: 'demo-l-5', title: 'Type Conversion', slug: 'type-conversion', duration_minutes: 15, completed: false, is_free_preview: false },
    ],
  },
  {
    id: 'demo-ch-3',
    title: 'Control Flow',
    order_index: 3,
    lessons: [
      { id: 'demo-l-6', title: 'Conditional Statements', slug: 'conditionals', duration_minutes: 25, completed: false, is_free_preview: false },
      { id: 'demo-l-7', title: 'For Loops and While Loops', slug: 'loops', duration_minutes: 30, completed: false, is_free_preview: false },
    ],
  },
];

export const DEMO_LESSONS: Record<string, {
  id: string; title: string; chapter: string; notes_markdown: string;
  code_example: string; explanation: string; duration_minutes: number; xp_reward: number;
  prevId: string | null; nextId: string | null;
}> = {
  'intro': {
    id: 'demo-l-1',
    title: 'Introduction to Python',
    chapter: 'Getting Started with Python',
    duration_minutes: 15,
    xp_reward: 10,
    prevId: null,
    nextId: 'variables',
    notes_markdown: `## Welcome to Python

Python is a high-level, interpreted programming language known for its simplicity and readability. Created by Guido van Rossum in 1991, Python has become one of the most popular programming languages in the world.

### Why Learn Python?
- **Easy to Read**: Python code reads almost like English
- **Versatile**: Web, data science, AI, automation, and more
- **Large Community**: Millions of developers worldwide
- **High Demand**: Top choice for employers globally

### The Python Philosophy
> Beautiful is better than ugly.
> Simple is better than complex.
> Readability counts.

Python is used by companies like Google, Netflix, Instagram, Spotify, and NASA.`,
    code_example: `# Your first Python program!\nprint("Hello, World!")\nprint("Welcome to Kaveri Technologies Academy!")\n\n# Python can do math\nresult = 10 + 20\nprint(f"10 + 20 = {result}")\n\n# Python with strings\nname = "Kiran"\nprint(f"Hello, {name}! Ready to code?")\n`,
    explanation: 'Python is your gateway to modern software development. Its clean syntax makes it the perfect first language — and its power makes it the last language many developers need.',
  },
  'variables': {
    id: 'demo-l-3',
    title: 'Variables and Assignment',
    chapter: 'Variables & Data Types',
    duration_minutes: 20,
    xp_reward: 10,
    prevId: 'intro',
    nextId: 'conditionals',
    notes_markdown: `## Variables in Python

A variable is a named storage location for data. In Python, you do **not** need to declare variable types — Python figures it out automatically (dynamic typing).

### Variable Naming Rules
- Names are **case-sensitive** (\`name\` ≠ \`Name\`)
- Must start with a **letter or underscore**
- Can contain letters, numbers, underscores
- Cannot be Python **keywords** (\`if\`, \`for\`, \`while\`, etc.)

### Best Practices
Use descriptive names:
\`\`\`python
# Good
student_name = "Kiran"
total_score = 95

# Avoid
x = "Kiran"
ts = 95
\`\`\`

### Multiple Assignment
\`\`\`python
x = y = z = 0          # All point to same value
a, b, c = 1, 2, 3      # Tuple unpacking
\`\`\``,
    code_example: `# Variable examples\nstudent_name = "Kiran Kumar"\nage = 22\ngpa = 3.8\nis_enrolled = True\ncity = "Bangalore"\n\nprint(f"Student: {student_name}")\nprint(f"Age: {age}")\nprint(f"GPA: {gpa}")\nprint(f"Enrolled: {is_enrolled}")\nprint(f"City: {city}")\n\n# Multiple assignment\nx, y, z = 10, 20, 30\nprint(f"Sum: {x + y + z}")\n`,
    explanation: 'Variables are the fundamental building blocks of any program. They let you store, label, and manipulate data throughout your code. Think of them as labeled boxes where you keep information.',
  },
  'conditionals': {
    id: 'demo-l-6',
    title: 'Conditional Statements',
    chapter: 'Control Flow',
    duration_minutes: 25,
    xp_reward: 10,
    prevId: 'variables',
    nextId: 'loops',
    notes_markdown: `## Conditional Statements

Conditionals let your program make decisions based on data.

### Basic If Statement
\`\`\`python
if condition:
    # runs if True
elif another:
    # runs if this is True
else:
    # runs if all False
\`\`\`

### Comparison Operators
| Operator | Meaning |
|----------|---------|
| \`==\` | Equal to |
| \`!=\` | Not equal |
| \`>\` | Greater than |
| \`<\` | Less than |
| \`>=\` | Greater or equal |
| \`<=\` | Less or equal |

### Logical Operators
- \`and\` — both conditions True
- \`or\` — at least one True
- \`not\` — reverses boolean`,
    code_example: `score = 85\n\nif score >= 90:\n    grade = "A"\n    message = "Excellent!"\nelif score >= 80:\n    grade = "B"\n    message = "Great work!"\nelif score >= 70:\n    grade = "C"\n    message = "Good effort!"\nelif score >= 60:\n    grade = "D"\n    message = "Keep practising"\nelse:\n    grade = "F"\n    message = "See your tutor"\n\nprint(f"Score: {score}")\nprint(f"Grade: {grade} — {message}")\n\n# Logical operators\nage = 20\nhas_id = True\nif age >= 18 and has_id:\n    print("Access granted!")\n`,
    explanation: 'Conditionals give your programs intelligence — the ability to respond differently based on data. Every non-trivial program uses conditionals. Mastering them is essential.',
  },
  'loops': {
    id: 'demo-l-7',
    title: 'For Loops and While Loops',
    chapter: 'Control Flow',
    duration_minutes: 30,
    xp_reward: 10,
    prevId: 'conditionals',
    nextId: null,
    notes_markdown: `## Loops in Python

Loops allow you to repeat actions — the backbone of automation.

### For Loop
Iterates over any sequence:
\`\`\`python
for item in sequence:
    # process item
\`\`\`

### While Loop
Repeats while condition is True:
\`\`\`python
while condition:
    # repeat
\`\`\`

### Loop Control
- **break** — exit loop immediately
- **continue** — skip to next iteration
- **pass** — do nothing (placeholder)

### Range Function
\`\`\`python
range(start, stop, step)
\`\`\``,
    code_example: `# For loop over a list\nstudents = ["Kiran", "Priya", "Arjun", "Meera"]\nfor i, name in enumerate(students, 1):\n    print(f"{i}. {name}")\n\n# Range loop\nprint("\\nCounting:")\nfor i in range(1, 6):\n    print(f"  {i}")\n\n# While loop\ncount = 0\nwhile count < 3:\n    print(f"Iteration {count}")\n    count += 1\n\n# List comprehension (Pythonic loop)\nsquares = [n**2 for n in range(1, 6)]\nprint(f"\\nSquares: {squares}")\n`,
    explanation: 'Loops are how Python automates repetitive tasks. A loop that runs 1000 times takes the same code as one that runs 3 times. This is the power of automation.',
  },
};

export const DEMO_WEEKLY_ACTIVITY = [
  { day: 'Sun', lessons: 1 },
  { day: 'Mon', lessons: 3 },
  { day: 'Tue', lessons: 2 },
  { day: 'Wed', lessons: 4 },
  { day: 'Thu', lessons: 2 },
  { day: 'Fri', lessons: 3 },
  { day: 'Sat', lessons: 1 },
];

export const DEMO_ANNOUNCEMENTS = [
  {
    id: 'demo-ann-1',
    title: 'New Python for Data Science module is live!',
    content: 'We have just released 8 new lessons on NumPy and Pandas. Enrolled students can access them now in the Python Full Stack course.',
    created_at: '2026-07-06T09:00:00Z',
    is_global: true,
  },
  {
    id: 'demo-ann-2',
    title: 'Welcome to Kaveri Technologies Academy!',
    content: 'Start your Python journey today. Explore courses, join the leaderboard, and earn certificates.',
    created_at: '2026-07-01T10:00:00Z',
    is_global: true,
  },
  {
    id: 'demo-ann-3',
    title: 'Live Q&A Session — This Saturday 3 PM IST',
    content: 'Faculty Priya Sharma will host a live Q&A session covering Python OOP and project ideas. Join via the calendar link.',
    created_at: '2026-07-04T08:00:00Z',
    is_global: true,
  },
];

export const DEMO_NOTIFICATIONS = [
  { id: 'demo-n-1', title: 'Assignment graded!', message: 'Your "Hello World Project" received a score of 92/100. Great work!', type: 'grade', is_read: false, created_at: '2026-07-07T14:00:00Z' },
  { id: 'demo-n-2', title: 'New announcement', message: 'Python OOP module — 3 new lessons have been published for your course.', type: 'announcement', is_read: false, created_at: '2026-07-06T09:00:00Z' },
  { id: 'demo-n-3', title: 'Quiz reminder', message: 'Python Basics Quiz is due tomorrow at 6 PM. Don\'t forget to attempt it!', type: 'assignment', is_read: true, created_at: '2026-07-05T16:00:00Z' },
  { id: 'demo-n-4', title: 'Streak milestone!', message: 'You have maintained a 6-day learning streak. Keep it up!', type: 'success', is_read: true, created_at: '2026-07-04T08:00:00Z' },
];

export const DEMO_ASSIGNMENTS = [
  { id: 'demo-a-1', title: 'Build a Student Grade Calculator', course: 'Python Full Stack Development', due: '2026-07-11T18:00:00Z', max_marks: 100, status: 'pending', difficulty: 'beginner', description: 'Create a Python program that takes student names and scores, calculates averages, and assigns letter grades.' },
  { id: 'demo-a-2', title: 'Number Guessing Game', course: 'Python Fundamentals', due: '2026-07-05T18:00:00Z', max_marks: 100, status: 'graded', score: 92, feedback: 'Excellent work! Clean code and great use of functions. Consider adding difficulty levels next.', difficulty: 'beginner', description: 'Build an interactive guessing game using loops and conditionals.' },
  { id: 'demo-a-3', title: 'To-Do List CLI App', course: 'Python Full Stack Development', due: '2026-07-18T18:00:00Z', max_marks: 100, status: 'pending', difficulty: 'intermediate', description: 'Build a command-line to-do list with file persistence using JSON.' },
];

export const DEMO_QUIZZES = [
  { id: 'demo-q-1', title: 'Python Basics Quiz', course: 'Python Fundamentals', questions: 10, pass_pct: 70, xp_reward: 50, status: 'completed', score: 80, passed: true },
  { id: 'demo-q-2', title: 'Variables & Data Types Quiz', course: 'Python Full Stack Development', questions: 8, pass_pct: 70, xp_reward: 50, status: 'pending', score: null, passed: false },
  { id: 'demo-q-3', title: 'Control Flow Assessment', course: 'Python Full Stack Development', questions: 12, pass_pct: 75, xp_reward: 75, status: 'pending', score: null, passed: false },
];

export const DEMO_PROJECTS = [
  { id: 'demo-p-1', title: 'Number Guessing Game', difficulty: 'beginner', category: 'games', hours: 3, tags: ['python', 'random', 'loops'], status: 'submitted', description: 'Interactive guessing game with hints and difficulty levels.' },
  { id: 'demo-p-2', title: 'Student Grade Calculator', difficulty: 'beginner', category: 'general', hours: 4, tags: ['python', 'functions', 'lists'], status: 'in_progress', description: 'Grade management system with letter grades and GPA.' },
  { id: 'demo-p-3', title: 'Weather Dashboard', difficulty: 'intermediate', category: 'apis', hours: 8, tags: ['python', 'requests', 'api'], status: 'not_started', description: 'Fetch real-time weather using OpenWeatherMap API.' },
];

export const DEMO_BADGES = [
  { id: 'b1', title: 'First Step', icon: '📖', color: '#2563EB', earned: true, desc: 'Completed your first lesson' },
  { id: 'b2', title: 'Python Beginner', icon: '🐍', color: '#14B8A6', earned: true, desc: 'Completed 10 lessons' },
  { id: 'b3', title: 'Week Warrior', icon: '🔥', color: '#F59E0B', earned: true, desc: '7-day learning streak' },
  { id: 'b4', title: 'Quiz Master', icon: '🏆', color: '#22C55E', earned: true, desc: 'Passed 5 quizzes' },
  { id: 'b5', title: 'Project Builder', icon: '🔨', color: '#8B5CF6', earned: false, desc: 'Submit 3 projects' },
  { id: 'b6', title: 'Course Finisher', icon: '🎓', color: '#EF4444', earned: false, desc: 'Complete a full course' },
];

export const DEMO_CERTIFICATE = {
  certificate_uid: 'KTA-DEMO-2026',
  course_title: 'Python Fundamentals',
  student_name: 'Kiran Kumar',
  issued_at: '2026-06-28T10:00:00Z',
};

export const DEMO_LEADERBOARD = [
  { rank: 1, name: 'Anjali Desai', xp: 4250, level: 8, streak: 28 },
  { rank: 2, name: 'Rohit Verma', xp: 3980, level: 7, streak: 15 },
  { rank: 3, name: 'Sneha Pillai', xp: 3560, level: 7, streak: 21 },
  { rank: 4, name: 'Kiran Kumar', xp: 1250, level: 3, streak: 6, isDemo: true },
  { rank: 5, name: 'Arjun Nair', xp: 1100, level: 3, streak: 4 },
  { rank: 6, name: 'Meera Iyer', xp: 980, level: 2, streak: 9 },
  { rank: 7, name: 'Vikram Singh', xp: 870, level: 2, streak: 3 },
  { rank: 8, name: 'Deepa Krishnan', xp: 750, level: 2, streak: 7 },
];

// Faculty demo data
export const DEMO_FACULTY_COURSES = [
  {
    id: 'demo-fc-1',
    title: 'Python Full Stack Development',
    difficulty: 'intermediate',
    students: 52,
    completion: 64,
    chapters: 8,
    lessons: 48,
    is_published: true,
    assignments: 6,
    pending_submissions: 9,
  },
  {
    id: 'demo-fc-2',
    title: 'Python Fundamentals',
    difficulty: 'beginner',
    students: 34,
    completion: 72,
    chapters: 6,
    lessons: 32,
    is_published: true,
    assignments: 4,
    pending_submissions: 5,
  },
];

export const DEMO_STUDENT_PROGRESS = [
  { name: 'Anjali Desai', course: 'Python Full Stack Development', progress: 92, completed: 44, total: 48, last_active: '2026-07-07' },
  { name: 'Rohit Verma', course: 'Python Full Stack Development', progress: 75, completed: 36, total: 48, last_active: '2026-07-06' },
  { name: 'Sneha Pillai', course: 'Python Fundamentals', progress: 100, completed: 32, total: 32, last_active: '2026-07-05' },
  { name: 'Kiran Kumar', course: 'Python Full Stack Development', progress: 38, completed: 18, total: 48, last_active: '2026-07-08' },
  { name: 'Arjun Nair', course: 'Python Fundamentals', progress: 62, completed: 20, total: 32, last_active: '2026-07-04' },
  { name: 'Meera Iyer', course: 'Python Full Stack Development', progress: 47, completed: 22, total: 48, last_active: '2026-07-03' },
  { name: 'Vikram Singh', course: 'Python Fundamentals', progress: 81, completed: 26, total: 32, last_active: '2026-07-07' },
  { name: 'Deepa Krishnan', course: 'Python Full Stack Development', progress: 29, completed: 14, total: 48, last_active: '2026-07-01' },
];

export const DEMO_SUBMISSIONS = [
  { id: 'ds-1', student: 'Anjali Desai', assignment: 'Build a Grade Calculator', submitted: '2026-07-06T14:00:00Z', status: 'submitted', course: 'Python Full Stack Development' },
  { id: 'ds-2', student: 'Rohit Verma', assignment: 'Number Guessing Game', submitted: '2026-07-05T16:30:00Z', status: 'graded', score: 88, course: 'Python Fundamentals' },
  { id: 'ds-3', student: 'Kiran Kumar', assignment: 'To-Do List CLI', submitted: '2026-07-07T10:00:00Z', status: 'submitted', course: 'Python Full Stack Development' },
  { id: 'ds-4', student: 'Meera Iyer', assignment: 'Build a Grade Calculator', submitted: '2026-07-06T18:00:00Z', status: 'submitted', course: 'Python Full Stack Development' },
  { id: 'ds-5', student: 'Vikram Singh', assignment: 'Number Guessing Game', submitted: '2026-07-04T09:00:00Z', status: 'graded', score: 76, course: 'Python Fundamentals' },
];

// Admin demo data
export const DEMO_ADMIN_STATS = {
  total_users: 248,
  students: 210,
  faculty: 12,
  admins: 3,
  published_courses: 8,
  enrollments: 436,
  submissions: 172,
  certificates: 64,
  growth_percent: 18.4,
};

export const DEMO_ADMIN_USERS = [
  { id: 'u1', name: 'Anjali Desai', email: 'anjali@example.com', role: 'student', xp: 4250, level: 8, joined: '2026-03-15' },
  { id: 'u2', name: 'Rohit Verma', email: 'rohit@example.com', role: 'student', xp: 3980, level: 7, joined: '2026-03-20' },
  { id: 'u3', name: 'Priya Sharma', email: 'priya@example.com', role: 'faculty', xp: 5800, level: 8, joined: '2025-09-01' },
  { id: 'u4', name: 'Sneha Pillai', email: 'sneha@example.com', role: 'student', xp: 3560, level: 7, joined: '2026-04-02' },
  { id: 'u5', name: 'Rajesh Kumar', email: 'rajesh@example.com', role: 'faculty', xp: 4200, level: 8, joined: '2025-09-01' },
  { id: 'u6', name: 'Kiran Kumar', email: 'kiran@example.com', role: 'student', xp: 1250, level: 3, joined: '2026-06-01' },
  { id: 'u7', name: 'Dr. Kavitha Murthy', email: 'kavitha@example.com', role: 'faculty', xp: 7200, level: 10, joined: '2025-09-01' },
  { id: 'u8', name: 'Arjun Nair', email: 'arjun@example.com', role: 'student', xp: 1100, level: 3, joined: '2026-06-10' },
];

export const DEMO_ADMIN_COURSES = [
  { id: 'ac1', title: 'Python Fundamentals', difficulty: 'beginner', faculty: 'Dr. Kavitha Murthy', students: 1250, is_published: true },
  { id: 'ac2', title: 'Python Intermediate: OOP & Data', difficulty: 'intermediate', faculty: 'Priya Sharma', students: 890, is_published: true },
  { id: 'ac3', title: 'Python for Data Science & Web', difficulty: 'advanced', faculty: 'Rajesh Kumar', students: 445, is_published: true },
  { id: 'ac4', title: 'Python Automation Masterclass', difficulty: 'intermediate', faculty: 'Priya Sharma', students: 320, is_published: true },
  { id: 'ac5', title: 'Django for Beginners', difficulty: 'beginner', faculty: 'Rajesh Kumar', students: 280, is_published: false },
];

export const DEMO_MONTHLY_DATA = [
  { month: 'Jan', enrollments: 38, users: 22 },
  { month: 'Feb', enrollments: 52, users: 31 },
  { month: 'Mar', enrollments: 71, users: 44 },
  { month: 'Apr', enrollments: 64, users: 38 },
  { month: 'May', enrollments: 89, users: 56 },
  { month: 'Jun', enrollments: 76, users: 47 },
  { month: 'Jul', enrollments: 46, users: 10 },
];

export const DEMO_CALENDAR_EVENTS = [
  { date: '2026-07-11', title: 'Grade Calculator Assignment Due', type: 'assignment' },
  { date: '2026-07-12', title: 'Variables & Data Types Quiz', type: 'quiz' },
  { date: '2026-07-15', title: 'Control Flow Assessment', type: 'quiz' },
  { date: '2026-07-18', title: 'To-Do List CLI App Due', type: 'assignment' },
  { date: '2026-07-19', title: 'Live Q&A Session - Priya Sharma', type: 'event' },
  { date: '2026-07-25', title: 'Project: Weather Dashboard', type: 'assignment' },
];
