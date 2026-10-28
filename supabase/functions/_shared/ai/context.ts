// Context pack builder — the "context layer" that makes generated content
// course-aware instead of generic.
//
// Design rules (matching the task):
//   * RELEVANT ONLY — a course with 30 chapters does NOT produce a 30-chapter
//     prompt. We include the course skeleton (chapter/lesson titles) plus the
//     FULL detail for the lesson the faculty is generating against (when given)
//     and its sibling lessons in the same chapter.
//   * DEDUP — titles repeat across chapters/quizzes/assignments; everything
//     passes through a Set filter before serialization.
//   * CAPPED — ~4-6k tokens (~16-24k chars) of text, cut deterministically in
//     priority order, never mid-sentence of a JSON block boundary.
//
// The pack is plain text (JSON-ish) appended to the system prompt. MCP tools
// (kaveri-context) can fetch MORE context on demand for tool-capable models.

export interface ContextRequest {
  facultyId: string;
  courseId?: string | null;
  lessonId?: string | null;
  topic?: string | null;
}

export interface ContextPack {
  text: string;
  stats: { chars: number; sections: number; scopedCourseId: string | null; scopedLessonId: string | null };
}

const MAX_CHARS = 22_000; // ≈ 5.5k tokens
const TITLE_CAP = 160;
const TEXT_FIELD_CAP = 900;

// Any of these role values counts as unrestricted (can read any course).
export const UNRESTRICTED_ROLES = ['super_admin', 'admin'];

type AnyRow = Record<string, any>;

/** Truncate helper: fancy ellipsis, hard cap, never null. */
function cap(value: unknown, max: number): string {
  const s = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Deterministic dedupe that keeps first occurrences. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function lines(title: string, items: string[], pack: { sections: string[]; used: number }): void {
  const itemsDeduped = dedupe(items);
  if (itemsDeduped.length === 0) return;
  const body = itemsDeduped.join('\n');
  const block = `${title}:\n${body}`;
  if (pack.used + block.length > MAX_CHARS && pack.sections.length > 0) return; // lower-priority sections drop whole
  pack.sections.push(block);
  pack.used += block.length;
}

/**
 * Throws Error('forbidden_course') if the faculty is not assigned to the
 * course (and is not unrestricted). Callers must handle it.
 */
export async function authorizeCourseAccess(
  supabase: any,
  facultyId: string,
  role: string,
  courseId: string,
): Promise<void> {
  if (UNRESTRICTED_ROLES.includes(role)) return;
  const { data } = await supabase
    .from('course_faculty')
    .select('id')
    .eq('course_id', courseId)
    .eq('faculty_id', facultyId)
    .maybeSingle();
  if (!data) {
    const e = new Error('forbidden_course') as Error & { code?: string };
    e.code = 'forbidden_course';
    throw e;
  }
}

export async function buildContextPack(supabase: any, req: ContextRequest): Promise<ContextPack> {
  const { facultyId, courseId, lessonId, topic } = req;
  const pack: { sections: string[]; used: number } = { sections: [], used: 0 };
  let scopedCourseId: string | null = courseId ?? null;
  let scopedLessonId: string | null = lessonId ?? null;

  // ------------------------------------------------------------------
  // Resolve lesson → course when only a lesson is given.
  // ------------------------------------------------------------------
  let lessonRow: AnyRow | null = null;
  if (lessonId) {
    const { data } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .maybeSingle();
    lessonRow = data ?? null;
    if (lessonRow && !scopedCourseId) {
      const { data: chapter } = await supabase
        .from('chapters')
        .select('course_id')
        .eq('id', lessonRow.chapter_id)
        .maybeSingle();
      scopedCourseId = chapter?.course_id ?? null;
    }
  }

  // ------------------------------------------------------------------
  // Course skeleton — titles only, ordered. This is intentionally cheap
  // and compact so even big courses fit.
  // ------------------------------------------------------------------
  if (scopedCourseId) {
    const { data: course } = await supabase
      .from('courses')
      .select('id,title,short_description,description,difficulty,category,language')
      .eq('id', scopedCourseId)
      .maybeSingle();
    if (course) {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('id,title,order_index')
        .eq('course_id', scopedCourseId)
        .order('order_index', { ascending: true });
      const chapterIds = ((chapters ?? []) as AnyRow[]).map(c => c.id);
      const { data: lessons } = chapterIds.length
        ? await supabase
            .from('lessons')
            .select('id,chapter_id,title,order_index,teaching_mode')
            .in('chapter_id', chapterIds)
            .order('order_index', { ascending: true })
        : { data: [] as AnyRow[] };

      const lessonsByChapter = new Map<string, AnyRow[]>();
      for (const l of lessons ?? []) {
        const list = lessonsByChapter.get(l.chapter_id) ?? [];
        list.push(l);
        lessonsByChapter.set(l.chapter_id, list);
      }

      const skeleton: string[] = [];
      skeleton.push(`COURSE: ${cap(course.title, TITLE_CAP)}${course.difficulty ? ` (${course.difficulty}${course.language ? `, ${course.language}` : ''})` : ''}`);
      if (course.short_description) skeleton.push(`ABOUT: ${cap(course.short_description, TEXT_FIELD_CAP)}`);
      for (const chapter of chapters ?? []) {
        skeleton.push(`- Chapter ${chapter.order_index ?? ''}: ${cap(chapter.title, TITLE_CAP)}`);
        for (const l of lessonsByChapter.get(chapter.id) ?? []) {
          const marker = l.id === lessonId ? '  <— TARGET LESSON' : '';
          skeleton.push(`    · Lesson: ${cap(l.title, TITLE_CAP)}${l.teaching_mode ? ` [${l.teaching_mode}]` : ''}${marker}`);
        }
      }
      lines('COURSE STRUCTURE', skeleton, pack);
    }
  }

  // ------------------------------------------------------------------
  // Target lesson detail: full text content + its resources + its quiz
  // titles — this is what the generated content must align with.
  // ------------------------------------------------------------------
  if (lessonRow) {
    const lessonBits: string[] = [];
    lessonBits.push(`LESSON: ${cap(lessonRow.title, TITLE_CAP)}`);
    if (lessonRow.teaching_mode) lessonBits.push(`TEACHING MODE: ${lessonRow.teaching_mode}`);
    for (const key of ['description', 'content', 'objectives', 'learning_outcomes']) {
      if (typeof lessonRow[key] === 'string' && lessonRow[key].trim()) {
        lessonBits.push(`${key.toUpperCase()}: ${cap(lessonRow[key], TEXT_FIELD_CAP * 2)}`);
      }
      if (Array.isArray(lessonRow[key]) && lessonRow[key].length) {
        lessonBits.push(`${key.toUpperCase()}: ${cap((lessonRow[key] as any[]).join('; '), TEXT_FIELD_CAP * 2)}`);
      }
    }
    const { data: resources } = await supabase
      .from('lesson_resources')
      .select('title,kind')
      .eq('lesson_id', lessonRow.id)
      .order('created_at', { ascending: true })
      .limit(30);
    for (const r of resources ?? []) lessonBits.push(`RESOURCE: ${cap(r.title, TITLE_CAP)}${r.kind ? ` (${r.kind})` : ''}`);
    lines('TARGET LESSON', lessonBits, pack);
  }

  // ------------------------------------------------------------------
  // Existing content tied to this course/lesson — what ALREADY exists.
  // The model must complement, not duplicate.
  // ------------------------------------------------------------------
  const existingBits: string[] = [];
  if (scopedCourseId) {
    const { data: quizzes } = await supabase
      .from('quizzes')
      .select('title')
      .eq('course_id', scopedCourseId)
      .order('created_at', { ascending: true })
      .limit(40);
    for (const q of quizzes ?? []) existingBits.push(`Quiz: ${cap(q.title, TITLE_CAP)}`);

    const { data: assignments } = await supabase
      .from('assignments')
      .select('title,description,order_index')
      .eq('course_id', scopedCourseId)
      .order('created_at', { ascending: true })
      .limit(40);
    for (const a of assignments ?? []) existingBits.push(`Assignment: ${cap(a.title, TITLE_CAP)}${a.description ? ` — ${cap(a.description, 200)}` : ''}`);

    // Lesson-scoped mini projects: what generation needs most (course-batch
    // linkage needs an expensive join; skip it — variety comes from titles).
    if (lessonId) {
      const { data: minisLesson } = await supabase
        .from('coding_vscode_assignments')
        .select('title,topic,question')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: true })
        .limit(40);
      for (const m of minisLesson ?? []) {
        existingBits.push(`Mini project: ${cap(m.title, TITLE_CAP)}${m.topic ? ` (${m.topic})` : ''}`);
      }
    }
  }
  lines('EXISTING CONTENT IN THIS COURSE (do not duplicate these)', existingBits, pack);

  // ------------------------------------------------------------------
  // Question bank in scope: prior coding questions by this faculty for this
  // course's chapter lessons (titles + topic tags only — never leak
  // hidden test data or reference solutions into the prompt).
  // ------------------------------------------------------------------
  const bankBits: string[] = [];
  if (lessonId) {
    const { data: minis } = await supabase
      .from('coding_vscode_assignments')
      .select('title,topic')
      .eq('lesson_id', lessonId)
      .limit(30);
    for (const m of minis ?? []) bankBits.push(`Mini: ${cap(m.title, TITLE_CAP)} (${cap(m.topic, 40)})`);

    const topicTerm = (topic ?? lessonRow?.title ?? '').trim();
    if (topicTerm) {
      const { data: bankQuestions, error: bankError } = await supabase
        .from('coding_questions')
        .select('title,topic,difficulty')
        .eq('created_by', facultyId)
        .ilike('topic', `%${cap(topicTerm, 60)}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!bankError) {
        for (const q of bankQuestions ?? []) {
          bankBits.push(`Bank question: ${cap(q.title, TITLE_CAP)} (${q.topic}, ${q.difficulty})`);
        }
      }
    }
  } else if (topic) {
    const { data: bankQuestions } = await supabase
      .from('coding_questions')
      .select('title,topic,difficulty')
      .eq('created_by', facultyId)
      .ilike('topic', `%${cap(topic, 60)}%`)
      .order('created_at', { ascending: false })
      .limit(30);
    for (const q of bankQuestions ?? []) {
      bankBits.push(`Bank question: ${cap(q.title, TITLE_CAP)} (${q.topic}, ${q.difficulty})`);
    }
  }
  lines('RELATED PRIOR WORK BY THIS FACULTY (variety check — do not repeat)', dedupe(bankBits), pack);

  if (topic) lines('REQUESTED TOPIC', [cap(topic, TITLE_CAP)], pack);

  const usage = [
    'Use this context to keep new content consistent with the course:',
    '- match terminology, difficulty ramp and the notation already used',
    '- do not re-create topics that already exist (check the names above)',
    '- the TARGET LESSON is where any new content will land when specified',
  ].join('\n');

  const text = [...pack.sections, usage].join('\n\n');
  return {
    text,
    stats: {
      chars: text.length,
      sections: pack.sections.length,
      scopedCourseId,
      scopedLessonId,
    },
  };
}
