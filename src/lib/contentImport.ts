import { supabase } from './supabase';
import { securelyRunCustom } from '../services/secureGrading';
import { detectEmbed, isCanvaUrl } from './mediaEmbeds';

/**
 * Normalize any slide/video link to its embeddable form. Canva short links
 * (canva.link/CODE) are opaque — resolve server-side before storing.
 */
export async function resolveMediaUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (isCanvaUrl(trimmed)) {
    if (/^https:\/\/canva\.link\//i.test(trimmed)) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expired — please sign in again.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-canva-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ url: trimmed }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not verify the Canva link.');
      return (body?.embedUrl as string | undefined) ?? null;
    }
    return detectEmbed(trimmed)?.embedUrl ?? null;
  }
  return detectEmbed(trimmed)?.embedUrl ?? null;
}

/**
 * Content import pipeline: turn pasted/uploaded CSV into real questions,
 * quizzes, and lessons — with every question auto-validated by executing its
 * reference solution through the secure grading runner before it can publish.
 *
 * Formats are documented in the Content Import page and mirrored by the
 * downloadable templates.
 */

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180 style: quoted fields, embedded newlines, "" escapes)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, ''); // strip BOM

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Final field/row (no trailing newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(cells => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

export function toCsvString(rows: (string | number)[][]): string {
  return rows
    .map(row =>
      row
        .map(cell => {
          const s = String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ImportIssue = {
  row: number;
  title: string;
  message: string;
};

export type QuestionRow = {
  rowNumber: number;
  title: string;
  slug: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  starterCode: string;
  referenceSolution: string;
  explanation: string;
  hints: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  subtopic: string;
  defaultMarks: number;
  publish: boolean;
  tests: { input: string; expected: string; hidden: boolean; weight: number }[];
};

export type ValidatedQuestion = {
  row: QuestionRow;
  ok: boolean;
  error?: string;
  testResults?: { passed: boolean; status: string; hidden: boolean }[];
};

export type ImportSummary = {
  created: number;
  failed: number;
  issues: ImportIssue[];
};

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'question';
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  taken.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Question parsing + validation
// ---------------------------------------------------------------------------

export const QUESTIONS_CSV_TEMPLATE = [
  'title,topic,subtopic,difficulty,marks,publish,problem_statement,input_format,output_format,starter_code,reference_solution,explanation,hints,test_input_1,test_expected_1,test_hidden_1,test_weight_1,test_input_2,test_expected_2,test_hidden_2,test_weight_2,test_input_3,test_expected_3,test_hidden_3,test_weight_3',
  'Sum of Two Numbers,Python Basics,Input and Output,easy,10,yes,"Given two integers A and B, print their sum.","Line 1: integer A","Line 2: integer B",a = int(input())# your code,a = int(input())b = int(input())print(a + b),Straightforward addition exercise,Use int() to convert,2,3,no,1,-5,10,yes,2,100,200,no,1',
].join('\n');

export function parseQuestionRows(csv: string): { rows: QuestionRow[]; issues: ImportIssue[] } {
  const objects = parseCsvObjects(csv);
  const issues: ImportIssue[] = [];
  const rows: QuestionRow[] = [];

  objects.forEach((obj, idx) => {
    const rowNumber = idx + 2; // +1 header, +1 for 1-based display
    const title = (obj['title'] ?? '').trim();
    const problemStatement = (obj['problem_statement'] ?? '').trim();
    const referenceSolution = (obj['reference_solution'] ?? '').replace(/\r\n/g, '\n').trim();

    if (!title) {
      issues.push({ row: rowNumber, title: '(untitled)', message: 'Missing title' });
      return;
    }
    if (!problemStatement) {
      issues.push({ row: rowNumber, title, message: 'Missing problem_statement' });
      return;
    }
    if (!referenceSolution) {
      issues.push({ row: rowNumber, title, message: 'Missing reference_solution — cannot auto-validate' });
      return;
    }

    const difficultyRaw = (obj['difficulty'] ?? 'easy').toLowerCase();
    const difficulty = difficultyRaw === 'medium' || difficultyRaw === 'hard' ? difficultyRaw : 'easy';

    const marks = Number.parseInt(obj['marks'] ?? '10', 10);
    const publishRaw = (obj['publish'] ?? 'yes').toLowerCase();
    const publish = publishRaw === 'yes' || publishRaw === 'true' || publishRaw === '1';

    const tests: QuestionRow['tests'] = [];
    for (let t = 1; t <= 10; t++) {
      const input = (obj[`test_input_${t}`] ?? '').replace(/\r\n/g, '\n').trim();
      const expected = (obj[`test_expected_${t}`] ?? '').replace(/\r\n/g, '\n').trim();
      if (!input && !expected) continue;
      if (!expected) {
        issues.push({ row: rowNumber, title, message: `test_expected_${t} is empty while test_input_${t} is set` });
        continue;
      }
      const hiddenRaw = (obj[`test_hidden_${t}`] ?? 'no').toLowerCase();
      const hidden = hiddenRaw === 'yes' || hiddenRaw === 'true' || hiddenRaw === '1';
      const weight = Math.max(1, Number.parseInt(obj[`test_weight_${t}`] ?? '1', 10) || 1);
      tests.push({ input, expected, hidden, weight });
    }

    if (tests.length === 0) {
      issues.push({ row: rowNumber, title, message: 'No test cases provided — at least one test is required' });
      return;
    }

    const hints = (obj['hints'] ?? '')
      .split('|')
      .map(h => h.trim())
      .filter(Boolean);

    rows.push({
      rowNumber,
      title,
      slug: slugify(title),
      problemStatement,
      inputFormat: (obj['input_format'] ?? '').trim(),
      outputFormat: (obj['output_format'] ?? '').trim(),
      starterCode: (obj['starter_code'] ?? '').replace(/\r\n/g, '\n').trim(),
      referenceSolution,
      explanation: (obj['explanation'] ?? '').trim(),
      hints,
      difficulty,
      topic: (obj['topic'] ?? 'Python Basics').trim() || 'Python Basics',
      subtopic: (obj['subtopic'] ?? '').trim(),
      defaultMarks: marks > 0 ? marks : 10,
      publish,
      tests,
    });
  });

  return { rows, issues };
}

/** Executes each row's reference solution against its tests via the secure runner. */
export async function validateQuestionRows(
  rows: QuestionRow[],
  languageId: number,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<ValidatedQuestion[]> {
  const results: ValidatedQuestion[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    onProgress?.(i, rows.length, row.title);
    try {
      const testResults: ValidatedQuestion['testResults'] = [];
      let ok = true;
      let error: string | undefined;
      for (const test of row.tests) {
        const result = await securelyRunCustom(row.referenceSolution, test.input, languageId);
        const r = result.result;
        // The custom endpoint reports raw output without comparing it (that is
        // its job for the Run button), so the validator does the comparison:
        // a clean exit is NOT a pass unless the output matches.
        const actual = (r.actual ?? '').replace(/\r\n/g, '\n').trimEnd();
        const expected = test.expected.replace(/\r\n/g, '\n').trimEnd();
        const passed = r.status === 'accepted' && actual === expected;
        testResults.push({ passed, status: r.status, hidden: test.hidden });
        if (!passed) {
          ok = false;
          error =
            `Test failed (${r.status}).` +
            (r.actual !== undefined ? ` Got: ${r.actual.slice(0, 120)}` : '') +
            (r.stderr ? ` — ${r.stderr.slice(0, 120)}` : '');
          break;
        }
      }
      results.push({ row, ok, error, testResults });
    } catch (e) {
      results.push({
        row,
        ok: false,
        error: e instanceof Error ? e.message : 'Execution failed',
      });
    }
  }
  onProgress?.(rows.length, rows.length, '');
  return results;
}

export async function importValidatedQuestions(
  validated: ValidatedQuestion[],
  createdBy: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, failed: 0, issues: [] };

  // Reserve slugs from existing questions first.
  const taken = new Set<string>();
  const { data: existing } = await supabase.from('coding_questions').select('slug');
  (existing ?? []).forEach((q: { slug: string }) => taken.add(q.slug));

  for (const item of validated) {
    if (!item.ok) {
      summary.failed++;
      summary.issues.push({
        row: item.row.rowNumber,
        title: item.row.title,
        message: item.error ?? 'Validation failed',
      });
      continue;
    }
    const row = item.row;
    const slug = uniqueSlug(row.slug, taken);
    const { data: inserted, error } = await supabase
      .from('coding_questions')
      .insert({
        title: row.title,
        slug,
        problem_statement: row.problemStatement,
        input_format: row.inputFormat || null,
        output_format: row.outputFormat || null,
        starter_code: row.starterCode || null,
        reference_solution: row.referenceSolution,
        explanation: row.explanation || null,
        hints: row.hints,
        difficulty: row.difficulty,
        topic: row.topic,
        subtopic: row.subtopic || null,
        default_marks: row.defaultMarks,
        source_type: 'faculty_created',
        is_published: row.publish,
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (error || !inserted) {
      summary.failed++;
      summary.issues.push({ row: row.rowNumber, title: row.title, message: error?.message ?? 'Insert failed' });
      continue;
    }

    const { error: testsError } = await supabase.from('coding_question_test_cases').insert(
      row.tests.map((test, idx) => ({
        question_id: inserted.id,
        input_data: test.input || null,
        expected_output: test.expected,
        is_hidden: test.hidden,
        weight: test.weight,
        order_index: idx,
      })),
    );

    if (testsError) {
      // Question without tests is useless — remove it rather than half-import.
      await supabase.from('coding_questions').delete().eq('id', inserted.id);
      summary.failed++;
      summary.issues.push({ row: row.rowNumber, title: row.title, message: `Test cases: ${testsError.message}` });
      continue;
    }
    summary.created++;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Quiz import
// ---------------------------------------------------------------------------

export type QuizRow = {
  rowNumber: number;
  quizTitle: string;
  questionText: string;
  questionType: 'mcq' | 'true_false' | 'short_answer';
  options: { text: string; correct: boolean }[];
  explanation: string;
  points: number;
};

export const QUIZZES_CSV_TEMPLATE = [
  'quiz_title,question_text,question_type,option_a,option_b,option_c,option_d,correct_option,explanation,points',
  'Python Basics Check,What does print() do?,mcq,"Prints to the screen","Deletes a file","Saves a file","Restarts Python",a,Basic output function,1',
  'Python Basics Check,Python is interpreted.,true_false,True,False,,,a,Python runs via interpreter,1',
].join('\n');

export function parseQuizRows(csv: string): { rows: QuizRow[]; issues: ImportIssue[] } {
  const objects = parseCsvObjects(csv);
  const issues: ImportIssue[] = [];
  const rows: QuizRow[] = [];

  objects.forEach((obj, idx) => {
    const rowNumber = idx + 2;
    const quizTitle = (obj['quiz_title'] ?? '').trim();
    const questionText = (obj['question_text'] ?? '').trim();
    if (!quizTitle) {
      issues.push({ row: rowNumber, title: '(untitled quiz)', message: 'Missing quiz_title' });
      return;
    }
    if (!questionText) {
      issues.push({ row: rowNumber, title: quizTitle, message: 'Missing question_text' });
      return;
    }

    const typeRaw = (obj['question_type'] ?? 'mcq').toLowerCase();
    const questionType: QuizRow['questionType'] =
      typeRaw === 'true_false' || typeRaw === 'truefalse'
        ? 'true_false'
        : typeRaw === 'short_answer' || typeRaw === 'short'
          ? 'short_answer'
          : 'mcq';

    const options: QuizRow['options'] = [];
    if (questionType === 'true_false') {
      const correctRaw = (obj['correct_option'] ?? 'a').toLowerCase();
      const correctIsTrue = correctRaw === 'a' || correctRaw === 'true' || correctRaw === 'yes';
      options.push(
        { text: 'True', correct: correctIsTrue },
        { text: 'False', correct: !correctIsTrue },
      );
    } else if (questionType === 'short_answer') {
      // Graded case-insensitively against option_a.
      const answer = (obj['option_a'] ?? '').trim();
      if (!answer) {
        issues.push({ row: rowNumber, title: quizTitle, message: 'short_answer needs the answer in option_a' });
        return;
      }
      options.push({ text: answer, correct: true });
    } else {
      const letters = ['a', 'b', 'c', 'd'];
      const correctRaw = (obj['correct_option'] ?? '').toLowerCase().trim();
      if (!letters.includes(correctRaw)) {
        issues.push({ row: rowNumber, title: quizTitle, message: 'correct_option must be a, b, c or d' });
        return;
      }
      let anyText = false;
      letters.forEach(letter => {
        const text = (obj[`option_${letter}`] ?? '').trim();
        if (!text) return;
        anyText = true;
        options.push({ text, correct: letter === correctRaw });
      });
      if (!anyText || options.length < 2) {
        issues.push({ row: rowNumber, title: quizTitle, message: 'MCQ needs at least two options' });
        return;
      }
      if (!options.some(o => o.correct)) {
        issues.push({ row: rowNumber, title: quizTitle, message: 'No correct option found' });
        return;
      }
    }

    const points = Math.max(1, Number.parseInt(obj['points'] ?? '1', 10) || 1);
    rows.push({
      rowNumber,
      quizTitle,
      questionText,
      questionType,
      options,
      explanation: (obj['explanation'] ?? '').trim(),
      points,
    });
  });

  return { rows, issues };
}

export async function importQuizRows(
  rows: QuizRow[],
  courseId: string,
  createdBy: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, failed: 0, issues: [] };

  // Group by quiz title; one quiz row per distinct title.
  const byQuiz = new Map<string, QuizRow[]>();
  rows.forEach(row => {
    const list = byQuiz.get(row.quizTitle) ?? [];
    list.push(row);
    byQuiz.set(row.quizTitle, list);
  });

  // Reuse existing unpublished quizzes with the same title in this course.
  const { data: existingQuizzes } = await supabase
    .from('quizzes')
    .select('id, title, is_published')
    .eq('course_id', courseId);
  const existingByTitle = new Map<string, { id: string; isPublished: boolean }>();
  (existingQuizzes ?? []).forEach((q: { id: string; title: string; is_published: boolean }) => {
    existingByTitle.set(q.title.toLowerCase(), { id: q.id, isPublished: q.is_published });
  });

  // Existing question counts per quiz so order_index continues cleanly on reuse.
  const { data: existingCounts } = await supabase
    .from('quiz_questions')
    .select('quiz_id');
  const countByQuiz = new Map<string, number>();
  (existingCounts ?? []).forEach((qq: { quiz_id: string }) => {
    countByQuiz.set(qq.quiz_id, (countByQuiz.get(qq.quiz_id) ?? 0) + 1);
  });

  for (const [title, questionRows] of byQuiz) {
    let quizId: string;
    const existing = existingByTitle.get(title.toLowerCase());
    if (existing && !existing.isPublished) {
      quizId = existing.id;
    } else if (existing && existing.isPublished) {
      // Title already in use by a published quiz — create a new draft variant.
      const { data: created, error } = await supabase
        .from('quizzes')
        .insert({ course_id: courseId, title, is_published: false, created_by: createdBy })
        .select('id')
        .single();
      if (error || !created) {
        summary.failed += questionRows.length;
        summary.issues.push({
          row: questionRows[0].rowNumber,
          title,
          message: `Could not create quiz: ${error?.message ?? 'insert failed'}`,
        });
        continue;
      }
      quizId = created.id;
    } else {
      const { data: created, error } = await supabase
        .from('quizzes')
        .insert({ course_id: courseId, title, is_published: false, created_by: createdBy })
        .select('id')
        .single();
      if (error || !created) {
        summary.failed += questionRows.length;
        summary.issues.push({
          row: questionRows[0].rowNumber,
          title,
          message: `Could not create quiz: ${error?.message ?? 'insert failed'}`,
        });
        continue;
      }
      quizId = created.id;
    }

    let order = countByQuiz.get(quizId) ?? 0;
    for (const row of questionRows) {
      const { data: q, error } = await supabase
        .from('quiz_questions')
        .insert({
          quiz_id: quizId,
          question_text: row.questionText,
          question_type: row.questionType,
          explanation: row.explanation || null,
          order_index: order,
          points: row.points,
        })
        .select('id')
        .single();
      order++;
      if (error || !q) {
        summary.failed++;
        summary.issues.push({ row: row.rowNumber, title: title, message: error?.message ?? 'Question insert failed' });
        continue;
      }
      const { error: optError } = await supabase.from('quiz_options').insert(
        row.options.map((option, idx) => ({
          question_id: q.id,
          option_text: option.text,
          is_correct: option.correct,
          order_index: idx,
        })),
      );
      if (optError) {
        summary.failed++;
        summary.issues.push({ row: row.rowNumber, title: title, message: `Options: ${optError.message}` });
        continue;
      }
      summary.created++;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Lesson + slides import
// ---------------------------------------------------------------------------

export type LessonRow = {
  rowNumber: number;
  chapterTitle: string;
  chapterOrder: number;
  title: string;
  order: number;
  canvaUrl: string;
  youtubeUrl: string;
  videoUrl: string;
  notesMarkdown: string;
  durationMinutes: number;
  teachingMode: 'live_class' | 'recorded_video';
  publish: boolean;
};

export const LESSONS_CSV_TEMPLATE = [
  'chapter,chapter_order,lesson_title,lesson_order,canva_link,youtube_link,notes_markdown,duration_minutes,teaching_mode,publish',
  'Week 1: Variables,1,What is a Variable,1,https://www.canva.com/design/DAFxyz/abc123/view?embed,,A variable is a named box for a value,15,recorded_video,yes',
  'Week 1: Variables,1,Lists in Python,2,,,list = [1, 2, 3] holds many values,20,recorded_video,yes',
].join('\n');

export function parseLessonRows(csv: string): { rows: LessonRow[]; issues: ImportIssue[] } {
  const objects = parseCsvObjects(csv);
  const issues: ImportIssue[] = [];
  const rows: LessonRow[] = [];

  objects.forEach((obj, idx) => {
    const rowNumber = idx + 2;
    const title = (obj['lesson_title'] ?? '').trim();
    const chapterTitle = (obj['chapter'] ?? 'General').trim() || 'General';
    if (!title) {
      issues.push({ row: rowNumber, title: '(untitled lesson)', message: 'Missing lesson_title' });
      return;
    }
    const canvaUrl = (obj['canva_link'] ?? '').trim();
    const youtubeUrl = (obj['youtube_link'] ?? '').trim();
    const videoUrl = (obj['video_url'] ?? '').trim();
    const modeRaw = (obj['teaching_mode'] ?? 'recorded_video').toLowerCase();
    const teachingMode: LessonRow['teachingMode'] = modeRaw === 'live_class' || modeRaw === 'live' ? 'live_class' : 'recorded_video';
    const publishRaw = (obj['publish'] ?? 'yes').toLowerCase();
    const publish = publishRaw === 'yes' || publishRaw === 'true' || publishRaw === '1';
    const duration = Math.max(1, Number.parseInt(obj['duration_minutes'] ?? '10', 10) || 10);

    if (canvaUrl && !/^https:\/\/(www\.)?(canva\.com|canva\.link)\//i.test(canvaUrl)) {
      issues.push({ row: rowNumber, title, message: 'canva_link does not look like a Canva share URL' });
      return;
    }
    if (youtubeUrl && !/^(https:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) {
      issues.push({ row: rowNumber, title, message: 'youtube_link does not look like a YouTube URL' });
      return;
    }

    rows.push({
      rowNumber,
      chapterTitle,
      chapterOrder: Number.parseInt(obj['chapter_order'] ?? '1', 10) || 1,
      title,
      order: Number.parseInt(obj['lesson_order'] ?? '1', 10) || 1,
      canvaUrl,
      youtubeUrl,
      videoUrl,
      notesMarkdown: (obj['notes_markdown'] ?? '').replace(/\r\n/g, '\n').trim(),
      durationMinutes: duration,
      teachingMode,
      publish,
    });
  });

  return { rows, issues };
}

export async function importLessonRows(
  rows: LessonRow[],
  courseId: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, failed: 0, issues: [] };

  // Load existing chapters to reuse (match by title, case-insensitive).
  const { data: existingChapters } = await supabase
    .from('chapters')
    .select('id, title, order_index')
    .eq('course_id', courseId);
  const chapterByTitle = new Map<string, string>();
  (existingChapters ?? []).forEach((c: { id: string; title: string }) =>
    chapterByTitle.set(c.title.toLowerCase(), c.id),
  );

  // Deterministic chapter creation order.
  const ordered = [...rows].sort(
    (a, b) => a.chapterOrder - b.chapterOrder || a.order - b.order,
  );

  for (const row of ordered) {
    let chapterId = chapterByTitle.get(row.chapterTitle.toLowerCase());
    if (!chapterId) {
      // Next free order_index at the end of the course.
      const { data: maxChapter } = await supabase
        .from('chapters')
        .select('order_index')
        .eq('course_id', courseId)
        .order('order_index', { ascending: false })
        .limit(1);
      const nextChapterOrder = ((maxChapter?.[0]?.order_index as number | undefined) ?? 0) + 1;
      const { data: created, error } = await supabase
        .from('chapters')
        .insert({
          course_id: courseId,
          title: row.chapterTitle,
          order_index: nextChapterOrder,
          is_published: true,
        })
        .select('id')
        .single();
      if (error || !created) {
        summary.failed++;
        summary.issues.push({ row: row.rowNumber, title: row.title, message: `Chapter: ${error?.message ?? 'insert failed'}` });
        continue;
      }
      chapterId = created.id;
      chapterByTitle.set(row.chapterTitle.toLowerCase(), created.id);
    }

    const slidesEmbed = row.canvaUrl ? await resolveMediaUrl(row.canvaUrl) : null;
    if (row.canvaUrl && !slidesEmbed) {
      summary.failed++;
      summary.issues.push({ row: row.rowNumber, title: row.title, message: 'Could not resolve the Canva link into an embeddable URL' });
      continue;
    }
    const videoEmbed = row.youtubeUrl ? detectEmbed(row.youtubeUrl)?.embedUrl ?? null : null;

    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        chapter_id: chapterId,
        course_id: courseId,
        title: row.title,
        slug: `${slugify(row.title)}-${Date.now().toString(36)}`, // unique; lessons.slug has no auto-uniqueness
        order_index: row.order,
        duration_minutes: row.durationMinutes,
        teaching_mode: row.teachingMode,
        is_published: row.publish,
        notes_markdown: row.notesMarkdown || null,
        slides_url: slidesEmbed,
        video_url: videoEmbed ?? (row.videoUrl || null),
      })
      .select('id')
      .single();

    if (error || !lesson) {
      summary.failed++;
      summary.issues.push({ row: row.rowNumber, title: row.title, message: error?.message ?? 'Lesson insert failed' });
      continue;
    }

    // Optional: direct resource rows for slide links so they appear in materials too.
    if (slidesEmbed) {
      await supabase.from('lesson_resources').insert({
        lesson_id: lesson.id,
        title: `${row.title} — Slides`,
        external_url: slidesEmbed,
        resource_type: 'slides',
        is_published: true,
      });
    }
    summary.created++;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// AI generation helpers (calls the generate-questions edge function)
// ---------------------------------------------------------------------------

export type GeneratedDraft = {
  title: string;
  topic: string;
  subtopic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  starterCode: string;
  referenceSolution: string;
  explanation: string;
  hints: string[];
  tests: { input: string; expected: string; hidden: boolean; weight: number }[];
};

export function draftToQuestionRow(draft: GeneratedDraft, rowNumber: number): QuestionRow {
  return {
    rowNumber,
    title: draft.title,
    slug: slugify(draft.title),
    problemStatement: draft.problemStatement,
    inputFormat: draft.inputFormat,
    outputFormat: draft.outputFormat,
    starterCode: draft.starterCode,
    referenceSolution: draft.referenceSolution,
    explanation: draft.explanation,
    hints: draft.hints,
    difficulty: draft.difficulty,
    topic: draft.topic,
    subtopic: draft.subtopic,
    defaultMarks: 10,
    publish: false, // drafts stay drafts until reviewed
    tests: draft.tests,
  };
}
