import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileCode2,
  Flag,
  GripVertical,
  ListChecks,
  Loader2,
  Plus,
  Rocket,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import {
  createProject,
  getFacultyCourses,
  getProjectBuilderData,
  saveProjectStructure,
  updateProject,
} from '../../services/faculty';
import type {
  Course,
  ProjectMilestone,
  ProjectRubricItem,
  ProjectStarterFile,
  ProjectSubmissionMode,
  ProjectType,
} from '../../types/database';

type EditableMilestone = Pick<ProjectMilestone, 'title' | 'description' | 'max_marks'> & { key: string };
type EditableRubric = Pick<ProjectRubricItem, 'title' | 'description' | 'max_marks'> & { key: string };
type EditableFile = Pick<ProjectStarterFile, 'file_path' | 'content' | 'language'> & { key: string };

interface ProjectDraft {
  title: string;
  course_id: string;
  project_type: ProjectType;
  description: string;
  objectives: string;
  requirements: string;
  instructions: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  estimated_hours: number;
  tech_tags: string;
  submission_mode: ProjectSubmissionMode;
  max_marks: number;
  due_at: string;
  allow_late_submissions: boolean;
  repository_required: boolean;
  live_demo_required: boolean;
  is_published: boolean;
}

interface ProjectPreset {
  type: ProjectType;
  label: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: ProjectDraft['difficulty'];
  estimatedHours: number;
  submissionMode: ProjectSubmissionMode;
  liveDemoRequired: boolean;
  objectives: string;
  requirements: string;
  instructions: string;
  milestones: Array<Omit<EditableMilestone, 'key'>>;
  rubric: Array<Omit<EditableRubric, 'key'>>;
  files: Array<Omit<EditableFile, 'key'>>;
}

const STEPS = [
  { title: 'Setup', icon: Settings2 },
  { title: 'Requirements', icon: ListChecks },
  { title: 'Milestones', icon: Flag },
  { title: 'Rubric', icon: Check },
  { title: 'Starter Files', icon: FileCode2 },
];

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  python: 'Python',
  html_css_js: 'HTML, CSS & JavaScript',
  selenium_python: 'Selenium + Python',
  selenium_java: 'Selenium + Java',
  python_fullstack: 'Python Full Stack',
  java_fullstack: 'Java Full Stack',
  mern: 'MERN Full Stack',
  csharp_fullstack: 'C# Full Stack',
  genai: 'Generative AI',
  n8n: 'n8n Automation',
  custom: 'Custom / GitHub Project',
};

const baseRubric = (codeMarks = 40): Array<Omit<EditableRubric, 'key'>> => [
  { title: 'Functional requirements', description: 'Core features work correctly and meet the brief.', max_marks: codeMarks },
  { title: 'Code quality', description: 'Readable structure, naming, error handling and maintainability.', max_marks: 25 },
  { title: 'Testing', description: 'Meaningful automated tests and evidence that they pass.', max_marks: 20 },
  { title: 'Documentation & demo', description: 'Clear README, setup guide and working demonstration.', max_marks: 55 - codeMarks },
];

const PRESETS: ProjectPreset[] = [
  {
    type: 'python', label: 'Python Application', description: 'CLI tools, data processing and object-oriented programs.',
    category: 'Python', tags: ['Python', 'PyTest', 'GitHub'], difficulty: 'beginner', estimatedHours: 8,
    submissionMode: 'github', liveDemoRequired: false,
    objectives: 'Apply Python fundamentals to a complete application.\nUse functions, modules and clear error handling.\nWrite automated tests for important behaviour.',
    requirements: 'Python 3.11 or newer\nA GitHub repository with meaningful commits\nA README with setup and usage instructions\nPyTest tests for the core logic',
    instructions: 'Build the application in small, reviewable milestones. Do not commit secrets or virtual environments. Run the full test suite before submitting.',
    milestones: [
      { title: 'Plan and repository setup', description: 'Define the problem, data model and repository structure.', max_marks: 0 },
      { title: 'Core implementation', description: 'Implement the required Python features.', max_marks: 0 },
      { title: 'Tests and documentation', description: 'Add PyTest coverage, README and final cleanup.', max_marks: 0 },
    ], rubric: baseRubric(),
    files: [{ file_path: 'README.md', language: 'markdown', content: '# Project title\n\n## Setup\n\n## Usage\n\n## Tests\n' }],
  },
  {
    type: 'html_css_js', label: 'Frontend Web App', description: 'Responsive interfaces with HTML, CSS and JavaScript.',
    category: 'Frontend', tags: ['HTML', 'CSS', 'JavaScript', 'Responsive Design'], difficulty: 'beginner', estimatedHours: 12,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Build a responsive and accessible web interface.\nUse semantic HTML and maintainable CSS.\nImplement interactive behaviour with JavaScript.',
    requirements: 'Responsive desktop and mobile layouts\nSemantic HTML and keyboard accessibility\nNo JavaScript errors in the browser console\nGitHub repository and live deployment URL',
    instructions: 'Match the supplied requirements, test at multiple screen sizes and deploy the final version to Vercel or Netlify.',
    milestones: [
      { title: 'Wireframe and page structure', description: 'Create semantic page structure and responsive plan.', max_marks: 0 },
      { title: 'Styling and interactions', description: 'Complete responsive styling and JavaScript behaviour.', max_marks: 0 },
      { title: 'Accessibility and deployment', description: 'Test, document and publish the live application.', max_marks: 0 },
    ], rubric: baseRubric(),
    files: [
      { file_path: 'index.html', language: 'html', content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Student Project</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main id="app"></main>\n  <script src="app.js"></script>\n</body>\n</html>\n' },
      { file_path: 'styles.css', language: 'css', content: '* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; }\n' },
      { file_path: 'app.js', language: 'javascript', content: 'const app = document.querySelector("#app");\n\napp.textContent = "Start building here";\n' },
    ],
  },
  {
    type: 'selenium_python', label: 'Selenium + Python', description: 'Production-style browser automation with PyTest.',
    category: 'Automation Testing', tags: ['Python', 'Selenium', 'PyTest', 'Page Object Model'], difficulty: 'intermediate', estimatedHours: 16,
    submissionMode: 'github', liveDemoRequired: false,
    objectives: 'Design maintainable UI automation using the Page Object Model.\nAutomate positive and negative user journeys.\nProduce readable test reports and failure evidence.',
    requirements: 'Python, Selenium WebDriver and PyTest\nPage Object Model structure\nAt least five independent test scenarios\nExplicit waits instead of fixed sleeps\nHTML test report and screenshots on failure',
    instructions: 'Use a legal practice website or the faculty-provided application. Keep test data separate from page objects and document browser/driver setup.',
    milestones: [
      { title: 'Framework setup', description: 'Configure PyTest, WebDriver fixtures and project structure.', max_marks: 0 },
      { title: 'Page objects and scenarios', description: 'Implement reusable page objects and automated journeys.', max_marks: 0 },
      { title: 'Reports and reliability', description: 'Add failure screenshots, reports and stabilise the suite.', max_marks: 0 },
    ], rubric: baseRubric(35),
    files: [
      { file_path: 'requirements.txt', language: 'text', content: 'selenium\npytest\npytest-html\n' },
      { file_path: 'tests/conftest.py', language: 'python', content: 'import pytest\nfrom selenium import webdriver\n\n@pytest.fixture\ndef driver():\n    browser = webdriver.Chrome()\n    yield browser\n    browser.quit()\n' },
      { file_path: 'README.md', language: 'markdown', content: '# Selenium Python Project\n\n## Target application\n\n## Installation\n\n## Run tests\n' },
    ],
  },
  {
    type: 'selenium_java', label: 'Selenium + Java', description: 'TestNG/JUnit automation using Maven and page objects.',
    category: 'Automation Testing', tags: ['Java', 'Selenium', 'TestNG', 'Maven'], difficulty: 'intermediate', estimatedHours: 18,
    submissionMode: 'github', liveDemoRequired: false,
    objectives: 'Build a reusable Selenium Java test framework.\nUse Maven and TestNG or JUnit for repeatable execution.\nGenerate reports for automated user journeys.',
    requirements: 'Java 17 or newer and Maven\nSelenium WebDriver with Page Object Model\nAt least five test scenarios\nTestNG or JUnit suite configuration\nTest report and README instructions',
    instructions: 'Separate tests, page objects, configuration and test data. Avoid Thread.sleep and document all prerequisites.',
    milestones: [
      { title: 'Maven framework setup', description: 'Configure dependencies, driver lifecycle and suite execution.', max_marks: 0 },
      { title: 'Page objects and tests', description: 'Implement maintainable pages and test scenarios.', max_marks: 0 },
      { title: 'Reporting and documentation', description: 'Add reports, failure evidence and setup guide.', max_marks: 0 },
    ], rubric: baseRubric(35),
    files: [
      { file_path: 'pom.xml', language: 'xml', content: '<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>academy.kaveri</groupId>\n  <artifactId>selenium-project</artifactId>\n  <version>1.0.0</version>\n</project>\n' },
      { file_path: 'README.md', language: 'markdown', content: '# Selenium Java Project\n\n## Prerequisites\n\n## Run tests\n' },
    ],
  },
  {
    type: 'python_fullstack', label: 'Python Full Stack', description: 'React/frontend plus Django or FastAPI backend.',
    category: 'Full Stack', tags: ['Python', 'FastAPI', 'React', 'PostgreSQL'], difficulty: 'advanced', estimatedHours: 40,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Design and deliver a complete database-backed application.\nBuild documented APIs and a responsive frontend.\nApply authentication, validation and automated testing.',
    requirements: 'Python API using FastAPI or Django\nResponsive frontend\nPostgreSQL database and migrations\nAuthentication and input validation\nBackend and frontend tests\nGitHub repository plus deployed demo',
    instructions: 'Create an architecture diagram before implementation. Keep secrets in environment variables and provide sample environment configuration.',
    milestones: [
      { title: 'Architecture and database', description: 'Design schema, API contract and application structure.', max_marks: 0 },
      { title: 'Backend implementation', description: 'Complete APIs, security, validation and tests.', max_marks: 0 },
      { title: 'Frontend integration', description: 'Build responsive UI and integrate all API flows.', max_marks: 0 },
      { title: 'Deployment and demo', description: 'Deploy, document and record the final walkthrough.', max_marks: 0 },
    ], rubric: baseRubric(45),
    files: [{ file_path: '.env.example', language: 'text', content: 'DATABASE_URL=\nAPI_BASE_URL=\n' }, { file_path: 'README.md', language: 'markdown', content: '# Full Stack Project\n\n## Architecture\n\n## Local setup\n\n## Tests\n\n## Deployment\n' }],
  },
  {
    type: 'java_fullstack', label: 'Java Full Stack', description: 'Spring Boot APIs with a modern frontend.',
    category: 'Full Stack', tags: ['Java', 'Spring Boot', 'React', 'PostgreSQL'], difficulty: 'advanced', estimatedHours: 45,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Build secure REST APIs with Spring Boot.\nIntegrate a responsive frontend and relational database.\nTest and deploy the complete application.',
    requirements: 'Java 17+, Spring Boot and Maven/Gradle\nReact or approved frontend\nPostgreSQL and migrations\nValidation, exception handling and security\nAutomated tests and live deployment',
    instructions: 'Use layered architecture and DTO validation. Never commit credentials. Include API documentation and a working live demo.',
    milestones: [
      { title: 'Architecture and persistence', description: 'Design entities, repositories and API contract.', max_marks: 0 },
      { title: 'Spring Boot API', description: 'Implement services, security, validation and tests.', max_marks: 0 },
      { title: 'Frontend integration', description: 'Build and connect the user interface.', max_marks: 0 },
      { title: 'Deployment', description: 'Deploy services and document the project.', max_marks: 0 },
    ], rubric: baseRubric(45), files: [{ file_path: 'README.md', language: 'markdown', content: '# Java Full Stack Project\n\n## Architecture\n\n## Setup\n\n## API documentation\n' }],
  },
  {
    type: 'mern', label: 'MERN Application', description: 'MongoDB, Express, React and Node.js.',
    category: 'Full Stack', tags: ['MongoDB', 'Express', 'React', 'Node.js'], difficulty: 'advanced', estimatedHours: 40,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Build a complete MERN product with secure APIs.\nManage application state and persistent data.\nTest and deploy a recruiter-ready application.',
    requirements: 'React frontend and Express API\nMongoDB data model\nAuthentication, validation and error handling\nAutomated tests\nGitHub repository and live demo URL',
    instructions: 'Use environment variables, provide seed data and include clear setup, test and deployment instructions.',
    milestones: [
      { title: 'Product and data design', description: 'Define user journeys, schema and API endpoints.', max_marks: 0 },
      { title: 'API and database', description: 'Build secure Express APIs and persistence.', max_marks: 0 },
      { title: 'React product', description: 'Complete frontend flows and API integration.', max_marks: 0 },
      { title: 'Testing and deployment', description: 'Verify, deploy and document the application.', max_marks: 0 },
    ], rubric: baseRubric(45), files: [{ file_path: '.env.example', language: 'text', content: 'MONGODB_URI=\nJWT_SECRET=\nVITE_API_URL=\n' }, { file_path: 'README.md', language: 'markdown', content: '# MERN Project\n\n## Features\n\n## Setup\n\n## Tests\n' }],
  },
  {
    type: 'csharp_fullstack', label: 'C# Full Stack', description: 'ASP.NET Core APIs with a web frontend.',
    category: 'Full Stack', tags: ['C#', 'ASP.NET Core', 'Entity Framework', 'React'], difficulty: 'advanced', estimatedHours: 45,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Build a layered ASP.NET Core application.\nUse Entity Framework and secure API patterns.\nIntegrate, test and deploy a complete frontend.',
    requirements: '.NET 8 or newer\nASP.NET Core Web API\nEntity Framework Core database migrations\nAuthentication and validation\nFrontend, tests and deployed demo',
    instructions: 'Keep the solution layered, configure secrets outside source control and document migrations plus deployment.',
    milestones: [
      { title: 'Solution architecture', description: 'Create domain, data and API structure.', max_marks: 0 },
      { title: 'API implementation', description: 'Build persistence, services, security and tests.', max_marks: 0 },
      { title: 'Frontend and integration', description: 'Complete UI and end-to-end workflows.', max_marks: 0 },
      { title: 'Deployment', description: 'Publish and document the application.', max_marks: 0 },
    ], rubric: baseRubric(45), files: [{ file_path: 'README.md', language: 'markdown', content: '# C# Full Stack Project\n\n## Architecture\n\n## Setup\n\n## Database migrations\n' }],
  },
  {
    type: 'genai', label: 'Generative AI App', description: 'Responsible AI applications with evaluation and guardrails.',
    category: 'Artificial Intelligence', tags: ['Python', 'LLM', 'RAG', 'Evaluation'], difficulty: 'advanced', estimatedHours: 30,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Build a useful AI workflow around a clearly defined user need.\nEvaluate response quality with repeatable cases.\nAdd safety, cost and failure handling.',
    requirements: 'LLM integration through a server-side API\nNo API keys in browser code or Git history\nAt least ten evaluation cases\nClear handling of unsafe, empty and failed responses\nREADME explaining model, prompts, limits and cost',
    instructions: 'Use only permitted datasets and APIs. Document limitations honestly and make outputs traceable enough for faculty review.',
    milestones: [
      { title: 'Use case and evaluation plan', description: 'Define target users, success criteria and evaluation data.', max_marks: 0 },
      { title: 'AI pipeline', description: 'Implement prompts/RAG/tools and server-side integration.', max_marks: 0 },
      { title: 'Safety and evaluation', description: 'Add guardrails, failure handling and quality evaluation.', max_marks: 0 },
      { title: 'Product demo', description: 'Deploy and document the final experience.', max_marks: 0 },
    ], rubric: [
      { title: 'Product usefulness', description: 'Solves the defined user problem with a coherent workflow.', max_marks: 25 },
      { title: 'AI quality and evaluation', description: 'Repeatable evaluation with evidence and thoughtful iteration.', max_marks: 30 },
      { title: 'Safety and reliability', description: 'Guardrails, privacy, failure modes and secret management.', max_marks: 25 },
      { title: 'Engineering and documentation', description: 'Maintainable code, tests, deployment and clear README.', max_marks: 20 },
    ], files: [{ file_path: '.env.example', language: 'text', content: 'AI_API_KEY=\nMODEL_NAME=\n' }, { file_path: 'evals/cases.json', language: 'json', content: '[\n  {"input": "example", "expected": "describe success criteria"}\n]\n' }, { file_path: 'README.md', language: 'markdown', content: '# Generative AI Project\n\n## Problem\n\n## Architecture\n\n## Evaluation\n\n## Safety and limitations\n' }],
  },
  {
    type: 'n8n', label: 'n8n Automation', description: 'Reliable multi-step business workflow automation.',
    category: 'Automation', tags: ['n8n', 'Webhooks', 'APIs', 'Workflow Automation'], difficulty: 'intermediate', estimatedHours: 14,
    submissionMode: 'github_and_live', liveDemoRequired: true,
    objectives: 'Automate a real multi-step process.\nIntegrate APIs safely with retries and error routes.\nDocument triggers, data mapping and operations.',
    requirements: 'Exported n8n workflow JSON\nAt least one trigger and two integrations\nInput validation, retry/error path and execution evidence\nNo credentials inside exported workflow\nArchitecture diagram and setup guide',
    instructions: 'Use test credentials and redact personal data. Include screenshots or a short demo showing successful and failed executions.',
    milestones: [
      { title: 'Workflow design', description: 'Map trigger, steps, data and failure paths.', max_marks: 0 },
      { title: 'Integrations', description: 'Build nodes, transformations and credentials configuration.', max_marks: 0 },
      { title: 'Reliability and demo', description: 'Test retries/errors, export and document the workflow.', max_marks: 0 },
    ], rubric: baseRubric(35), files: [{ file_path: 'workflow.json', language: 'json', content: '{\n  "name": "Student automation project",\n  "nodes": [],\n  "connections": {}\n}\n' }, { file_path: 'README.md', language: 'markdown', content: '# n8n Automation\n\n## Business process\n\n## Trigger and integrations\n\n## Error handling\n\n## Import instructions\n' }],
  },
  {
    type: 'custom', label: 'Custom Project', description: 'A flexible GitHub-based project for any approved stack.',
    category: 'Custom', tags: ['GitHub'], difficulty: 'intermediate', estimatedHours: 20,
    submissionMode: 'github_and_live', liveDemoRequired: false,
    objectives: 'Deliver the approved project scope.\nDemonstrate sound engineering and testing.\nDocument decisions and results clearly.',
    requirements: 'Faculty-approved scope\nGitHub repository with meaningful commits\nTests appropriate to the chosen stack\nREADME with setup, architecture and demo evidence',
    instructions: 'Agree on scope and acceptance criteria before implementation. Submit only work you can explain and demonstrate.',
    milestones: [
      { title: 'Proposal and architecture', description: 'Confirm scope, users, stack and acceptance criteria.', max_marks: 0 },
      { title: 'Implementation', description: 'Build the approved core functionality.', max_marks: 0 },
      { title: 'Quality and presentation', description: 'Test, document and demonstrate the result.', max_marks: 0 },
    ], rubric: baseRubric(), files: [{ file_path: 'README.md', language: 'markdown', content: '# Project title\n\n## Problem and users\n\n## Architecture\n\n## Setup and tests\n' }],
  },
];

const emptyDraft: ProjectDraft = {
  title: '', course_id: '', project_type: 'python', description: '', objectives: '', requirements: '', instructions: '',
  difficulty: 'beginner', category: 'Python', estimated_hours: 8, tech_tags: 'Python, GitHub', submission_mode: 'github',
  max_marks: 100, due_at: '', allow_late_submissions: false, repository_required: true, live_demo_required: false,
  is_published: false,
};

const key = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const toDateTimeLocal = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{children}{required && <span className="text-red-500"> *</span>}</label>;
}

export default function FacultyProjectBuilderPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: toastError, warning } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [milestones, setMilestones] = useState<EditableMilestone[]>([]);
  const [rubric, setRubric] = useState<EditableRubric[]>([]);
  const [starterFiles, setStarterFiles] = useState<EditableFile[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalMarks = useMemo(() => rubric.reduce((sum, item) => sum + (Number(item.max_marks) || 0), 0), [rubric]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!profile) return;
      setLoading(true);
      try {
        const [facultyCourses, builderData] = await Promise.all([
          getFacultyCourses(profile.id),
          projectId ? getProjectBuilderData(projectId) : Promise.resolve(null),
        ]);
        if (!active) return;
        setCourses(facultyCourses);
        if (builderData) {
          const { project, milestones: savedMilestones, rubric: savedRubric, starterFiles: savedFiles } = builderData;
          setDraft({
            title: project.title,
            course_id: project.course_id ?? '',
            project_type: project.project_type ?? 'custom',
            description: project.description ?? '',
            objectives: project.objectives ?? '',
            requirements: project.requirements ?? '',
            instructions: project.instructions ?? '',
            difficulty: project.difficulty,
            category: project.category,
            estimated_hours: project.estimated_hours,
            tech_tags: (project.tech_tags ?? []).join(', '),
            submission_mode: project.submission_mode ?? 'github_and_live',
            max_marks: project.max_marks ?? 100,
            due_at: toDateTimeLocal(project.due_at),
            allow_late_submissions: project.allow_late_submissions ?? false,
            repository_required: project.repository_required ?? true,
            live_demo_required: project.live_demo_required ?? false,
            is_published: project.is_published,
          });
          setMilestones(savedMilestones.map(item => ({ key: item.id, title: item.title, description: item.description, max_marks: item.max_marks })));
          setRubric(savedRubric.map(item => ({ key: item.id, title: item.title, description: item.description, max_marks: item.max_marks })));
          setStarterFiles(savedFiles.map(item => ({ key: item.id, file_path: item.file_path, content: item.content, language: item.language })));
        }
      } catch (error) {
        toastError('Could not load project builder', errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [profile, projectId, toastError]);

  const applyPreset = (preset: ProjectPreset) => {
    const hasContent = draft.title || draft.description || milestones.length || starterFiles.length;
    if (hasContent && !window.confirm(`Apply the ${preset.label} preset? Existing requirements, milestones, rubric and starter files will be replaced.`)) return;
    const nextRubric = preset.rubric.map(item => ({ ...item, key: key() }));
    setDraft(current => ({
      ...current,
      project_type: preset.type,
      category: preset.category,
      difficulty: preset.difficulty,
      estimated_hours: preset.estimatedHours,
      tech_tags: preset.tags.join(', '),
      submission_mode: preset.submissionMode,
      repository_required: true,
      live_demo_required: preset.liveDemoRequired,
      objectives: preset.objectives,
      requirements: preset.requirements,
      instructions: preset.instructions,
      max_marks: nextRubric.reduce((sum, item) => sum + item.max_marks, 0),
    }));
    setMilestones(preset.milestones.map(item => ({ ...item, key: key() })));
    setRubric(nextRubric);
    setStarterFiles(preset.files.map(item => ({ ...item, key: key() })));
    success(`${preset.label} preset applied`);
  };

  const updateRubric = (itemKey: string, updates: Partial<EditableRubric>) => {
    setRubric(current => current.map(item => item.key === itemKey ? { ...item, ...updates } : item));
  };

  const validate = (publishing: boolean) => {
    if (!draft.title.trim()) return 'Enter a project title.';
    if (!publishing) return null;
    if (!draft.course_id) return 'Choose the course that will receive this project.';
    if (!draft.description.trim()) return 'Add a clear project description.';
    if (!draft.objectives.trim() || !draft.requirements.trim()) return 'Add learning objectives and project requirements.';
    if (!milestones.length || milestones.some(item => !item.title.trim())) return 'Add at least one named milestone.';
    if (!rubric.length || rubric.some(item => !item.title.trim() || Number(item.max_marks) <= 0)) return 'Add valid rubric items and marks.';
    if (totalMarks !== Number(draft.max_marks)) return `Rubric marks (${totalMarks}) must equal the project total (${draft.max_marks}).`;
    const paths = starterFiles.map(item => item.file_path.trim()).filter(Boolean);
    if (paths.length !== new Set(paths).size) return 'Starter file paths must be unique.';
    if (starterFiles.some(item => !item.file_path.trim())) return 'Every starter file needs a file path.';
    return null;
  };

  const save = async (publishing: boolean) => {
    if (!profile) return;
    const validationError = validate(publishing);
    if (validationError) {
      warning('Project is not ready', validationError);
      return;
    }

    setSaving(true);
    try {
      const tags = draft.tech_tags.split(',').map(tag => tag.trim()).filter(Boolean);
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        difficulty: draft.difficulty,
        category: draft.category.trim() || 'Custom',
        estimated_hours: Number(draft.estimated_hours) || 1,
        tech_tags: tags,
        requirements: draft.requirements.trim() || null,
        starter_code: starterFiles[0]?.content || null,
        project_type: draft.project_type,
        objectives: draft.objectives.trim() || null,
        instructions: draft.instructions.trim() || null,
        submission_mode: draft.submission_mode,
        max_marks: Number(draft.max_marks) || totalMarks || 100,
        due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
        allow_late_submissions: draft.allow_late_submissions,
        repository_required: draft.repository_required,
        live_demo_required: draft.live_demo_required,
        course_id: draft.course_id || null,
        is_published: publishing,
      };

      let savedId = projectId;
      if (savedId) {
        await updateProject(savedId, payload);
      } else {
        const created = await createProject({ ...payload, description: payload.description ?? undefined, requirements: payload.requirements ?? undefined, starter_code: payload.starter_code ?? undefined, objectives: payload.objectives ?? undefined, instructions: payload.instructions ?? undefined, created_by: profile.id });
        savedId = created.id;
      }

      await saveProjectStructure(savedId, {
        milestones: milestones.map(({ title, description, max_marks }) => ({ title: title.trim(), description, max_marks })),
        rubric: rubric.map(({ title, description, max_marks }) => ({ title: title.trim(), description, max_marks: Number(max_marks) })),
        starterFiles: starterFiles.map(({ file_path, content, language }) => ({ file_path: file_path.trim(), content, language })),
      });

      setDraft(current => ({ ...current, is_published: publishing }));
      success(publishing ? 'Project published' : 'Draft saved', publishing ? 'Students enrolled in the course can now see it.' : 'You can continue editing at any time.');
      if (!projectId) navigate(`/faculty/projects/${savedId}/builder`, { replace: true });
    } catch (error) {
      toastError('Could not save project', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[420px] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" /> Loading project builder...</div>;

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-5 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <button className="mt-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => navigate('/faculty/projects')} aria-label="Back to projects"><ArrowLeft size={20} /></button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{projectId ? 'Project Builder' : 'Create Project'}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draft.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{draft.is_published ? 'Published' : 'Draft'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Build a structured, portfolio-ready project with milestones and transparent grading.</p>
          </div>
        </div>
        <div className="flex gap-2 pl-12 xl:pl-0">
          <button className="btn-secondary flex items-center gap-2" disabled={saving} onClick={() => void save(false)}><Save size={16} /> Save Draft</button>
          <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={() => void save(true)}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />} Publish</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          return <button key={item.title} onClick={() => setStep(index)} className={`flex min-w-0 items-center justify-center gap-2 border-r border-slate-200 px-2 py-3 text-xs font-semibold last:border-r-0 dark:border-slate-700 sm:text-sm ${step === index ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'}`}><Icon size={16} /><span className="hidden sm:inline">{item.title}</span></button>;
        })}
      </div>

      <section className="card p-5 lg:p-7">
        {step === 0 && (
          <div className="space-y-7">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Start from an engineering preset</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Presets fill the complete structure. Everything remains editable.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PRESETS.map(preset => <button key={preset.type} onClick={() => applyPreset(preset)} className={`rounded-xl border p-4 text-left transition hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 ${draft.project_type === preset.type ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-700'}`}><div className="flex items-center gap-2"><Code2 size={17} className="text-primary-500" /><span className="font-semibold text-slate-900 dark:text-white">{preset.label}</span></div><p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{preset.description}</p></button>)}
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2"><FieldLabel required>Project title</FieldLabel><input className="input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. E-commerce UI automation framework" /></div>
              <div><FieldLabel required>Course</FieldLabel><select className="input" value={draft.course_id} onChange={event => setDraft({ ...draft, course_id: event.target.value })}><option value="">Select a course</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{courses.length === 0 && <p className="mt-1 text-xs text-amber-600">No faculty course is assigned yet. You can save a draft, but publishing needs a course.</p>}</div>
              <div><FieldLabel>Project environment</FieldLabel><select className="input" value={draft.project_type} onChange={event => setDraft({ ...draft, project_type: event.target.value as ProjectType })}>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><FieldLabel>Difficulty</FieldLabel><select className="input" value={draft.difficulty} onChange={event => setDraft({ ...draft, difficulty: event.target.value as ProjectDraft['difficulty'] })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
              <div><FieldLabel>Estimated hours</FieldLabel><input className="input" type="number" min={1} value={draft.estimated_hours} onChange={event => setDraft({ ...draft, estimated_hours: Number(event.target.value) })} /></div>
              <div><FieldLabel>Category</FieldLabel><input className="input" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} /></div>
              <div><FieldLabel>Technology tags (comma separated)</FieldLabel><input className="input" value={draft.tech_tags} onChange={event => setDraft({ ...draft, tech_tags: event.target.value })} placeholder="Python, Selenium, PyTest" /></div>
              <div className="md:col-span-2"><FieldLabel required>Short project description</FieldLabel><textarea className="input min-h-28" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="What real problem will students solve and what will they build?" /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div><FieldLabel required>Learning objectives</FieldLabel><textarea className="input min-h-64 whitespace-pre-wrap" value={draft.objectives} onChange={event => setDraft({ ...draft, objectives: event.target.value })} placeholder="One objective per line" /></div>
            <div><FieldLabel required>Acceptance requirements</FieldLabel><textarea className="input min-h-64 whitespace-pre-wrap" value={draft.requirements} onChange={event => setDraft({ ...draft, requirements: event.target.value })} placeholder="One requirement per line" /></div>
            <div className="lg:col-span-2"><FieldLabel>Instructions for students</FieldLabel><textarea className="input min-h-36" value={draft.instructions} onChange={event => setDraft({ ...draft, instructions: event.target.value })} placeholder="Repository rules, allowed tools, security guidance and submission expectations" /></div>
            <div><FieldLabel>Submission format</FieldLabel><select className="input" value={draft.submission_mode} onChange={event => setDraft({ ...draft, submission_mode: event.target.value as ProjectSubmissionMode })}><option value="github">GitHub repository</option><option value="github_and_live">GitHub repository + live demo</option><option value="file_upload">File upload</option><option value="external_url">External project URL</option></select></div>
            <div><FieldLabel>Due date</FieldLabel><input className="input" type="datetime-local" value={draft.due_at} onChange={event => setDraft({ ...draft, due_at: event.target.value })} /></div>
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-3">
              {[['repository_required', 'Require GitHub repository'], ['live_demo_required', 'Require live demo'], ['allow_late_submissions', 'Allow late submissions']].map(([field, label]) => <label key={field} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={Boolean(draft[field as keyof ProjectDraft])} onChange={event => setDraft({ ...draft, [field]: event.target.checked })} /><span>{label}</span></label>)}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Delivery milestones</h2><p className="text-sm text-slate-500">Break a large project into reviewable checkpoints.</p></div><button className="btn-primary flex items-center gap-2" onClick={() => setMilestones(current => [...current, { key: key(), title: '', description: '', max_marks: 0 }])}><Plus size={16} /> Add Milestone</button></div>
            <div className="space-y-3">{milestones.map((item, index) => <div key={item.key} className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[auto_1fr_auto]"><GripVertical className="mt-3 text-slate-400" size={18} /><div className="grid gap-3"><input className="input" value={item.title} onChange={event => setMilestones(current => current.map(row => row.key === item.key ? { ...row, title: event.target.value } : row))} placeholder={`Milestone ${index + 1} title`} /><textarea className="input min-h-20" value={item.description ?? ''} onChange={event => setMilestones(current => current.map(row => row.key === item.key ? { ...row, description: event.target.value } : row))} placeholder="What must the student demonstrate at this checkpoint?" /></div><button className="mt-2 self-start rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setMilestones(current => current.filter(row => row.key !== item.key))}><Trash2 size={17} /></button></div>)}{milestones.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500 dark:border-slate-700">No milestones yet. Apply a preset or add the first checkpoint.</div>}</div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Transparent grading rubric</h2><p className="text-sm text-slate-500">Students will know exactly how their work is assessed.</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${totalMarks === draft.max_marks ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{totalMarks} / {draft.max_marks} marks</span><button className="btn-primary flex items-center gap-2" onClick={() => setRubric(current => [...current, { key: key(), title: '', description: '', max_marks: 10 }])}><Plus size={16} /> Add Criterion</button></div></div>
            <div className="space-y-3">{rubric.map((item, index) => <div key={item.key} className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[auto_1fr_110px_auto]"><span className="mt-3 text-sm font-bold text-slate-400">{index + 1}</span><div className="grid gap-3"><input className="input" value={item.title} onChange={event => updateRubric(item.key, { title: event.target.value })} placeholder="Criterion title" /><textarea className="input min-h-20" value={item.description ?? ''} onChange={event => updateRubric(item.key, { description: event.target.value })} placeholder="What earns full marks?" /></div><div><FieldLabel>Marks</FieldLabel><input className="input" type="number" min={1} value={item.max_marks} onChange={event => updateRubric(item.key, { max_marks: Number(event.target.value) })} /></div><button className="mt-7 self-start rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setRubric(current => current.filter(row => row.key !== item.key))}><Trash2 size={17} /></button></div>)}</div>
            <div className="mt-5 max-w-xs"><FieldLabel>Project total marks</FieldLabel><input className="input" type="number" min={1} value={draft.max_marks} onChange={event => setDraft({ ...draft, max_marks: Number(event.target.value) })} /></div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Starter repository files</h2><p className="text-sm text-slate-500">Optional files students can copy into their project. Never include credentials.</p></div><button className="btn-primary flex items-center gap-2" onClick={() => setStarterFiles(current => [...current, { key: key(), file_path: '', language: 'text', content: '' }])}><Plus size={16} /> Add File</button></div>
            <div className="space-y-4">{starterFiles.map(file => <div key={file.key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="mb-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><input className="input font-mono text-sm" value={file.file_path} onChange={event => setStarterFiles(current => current.map(row => row.key === file.key ? { ...row, file_path: event.target.value } : row))} placeholder="src/example.py" /><input className="input" value={file.language} onChange={event => setStarterFiles(current => current.map(row => row.key === file.key ? { ...row, language: event.target.value } : row))} placeholder="python" /><button className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setStarterFiles(current => current.filter(row => row.key !== file.key))}><Trash2 size={17} /></button></div><textarea className="input min-h-48 font-mono text-xs leading-5" spellCheck={false} value={file.content} onChange={event => setStarterFiles(current => current.map(row => row.key === file.key ? { ...row, content: event.target.value } : row))} placeholder="Starter file content" /></div>)}{starterFiles.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500 dark:border-slate-700">No starter files. Students will begin with an empty repository.</div>}</div>
            <div className="mt-6 rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200"><strong>Ready to publish?</strong> The builder checks the course, brief, milestones, rubric total and starter file paths before students can see the project.</div>
          </div>
        )}
      </section>

      <div className="mt-5 flex items-center justify-between">
        <button className="btn-secondary flex items-center gap-2" disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))}><ChevronLeft size={17} /> Previous</button>
        {step < STEPS.length - 1 ? <button className="btn-primary flex items-center gap-2" onClick={() => setStep(current => Math.min(STEPS.length - 1, current + 1))}>Next <ChevronRight size={17} /></button> : <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={() => void save(true)}><Rocket size={17} /> Publish Project</button>}
      </div>
    </div>
  );
}
