// Kaveri "kaveri-context" MCP server (internal, in-process).
//
// Built on the official @modelcontextprotocol/sdk: a real MCP Server exposing
// five course-context tools, connected over InMemoryTransport to an in-process
// MCP Client that lives inside the generation edge function. No network hop,
// no port — the model's tool calls funnel through runTool -> client.callTool.
//
// SECURITY: every tool enforces ownership by construction — it executes with
// the CALLER's JWT (RLS applies) AND re-checks course_faculty membership for
// course-scoped reads. Faculty A can never pull Faculty B's material, even if
// a bent model sends an arbitrary id.
//
// Tool list:
//   get_course_tree        — course/chapter/lesson skeleton (own courses)
//   get_lesson_context     — full detail for one lesson (must be in own course)
//   search_question_bank   — coding_questions by topic/difficulty (own + published)
//   get_faculty_drafts     — this faculty's draft content across kinds
//   get_related_items      — everything related to a topic inside a course

// Pinned SDK 1.17.3: latest 1.x esm.sh Deno bundles have a broken zod v4
// interop at import time ("t.custom is not a function"); 1.17.x (zod v3 peer)
// loads cleanly on the Supabase edge runtime and has all APIs used here
// (registerTool with ZodRawShape, InMemoryTransport).
import { McpServer } from 'https://esm.sh/@modelcontextprotocol/sdk@1.17.3/server/mcp.js?target=denonext';
import { Client } from 'https://esm.sh/@modelcontextprotocol/sdk@1.17.3/client/index.js?target=denonext';
import { InMemoryTransport } from 'https://esm.sh/@modelcontextprotocol/sdk@1.17.3/inMemory.js?target=denonext';
// Keep zod in lockstep with the SDK peer version — a mismatched
// (or doubly-instantiated) zod breaks inference and runtime interop.
import { z } from 'https://esm.sh/zod@3.25.76?target=denonext';

import { UNRESTRICTED_ROLES } from '../../ai/context.ts';

export interface McpContextDeps {
  /** Supabase client bound to the calling faculty's JWT (RLS active). */
  supabase: any;
  facultyId: string;
  role: string;
}

const TITLE_CAP = 140;
const NOTE_CAP = 600;

function cap(value: unknown, max = TITLE_CAP): string {
  const s = String(value ?? '').replace(/\r\n/g, '\n').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function jsonText(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '{}';
  }
}

async function isUnrestricted(deps: McpContextDeps): Promise<boolean> {
  return UNRESTRICTED_ROLES.includes(deps.role);
}

/** Throws when this faculty is not assigned to the course (or unrestricted). */
async function requireCourseAccess(deps: McpContextDeps, courseId: string): Promise<void> {
  if (await isUnrestricted(deps)) return;
  const { data } = await deps.supabase
    .from('course_faculty')
    .select('id')
    .eq('course_id', courseId)
    .eq('faculty_id', deps.facultyId)
    .maybeSingle();
  if (!data) throw new Error('Access denied: this course is not assigned to you.');
}

/** Resolves lesson -> course and delegates to requireCourseAccess. */
async function requireLessonAccess(deps: McpContextDeps, lessonId: string): Promise<any> {
  const { data: lesson } = await deps.supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson) throw new Error('Lesson not found.');
  const { data: chapter } = await deps.supabase
    .from('chapters')
    .select('course_id')
    .eq('id', lesson.chapter_id)
    .maybeSingle();
  if (!chapter?.course_id) throw new Error('Lesson is not attached to a course.');
  await requireCourseAccess(deps, chapter.course_id);
  return { lesson, chapter, courseId: chapter.course_id as string };
}

export function createKaveriMcpServer(deps: McpContextDeps): McpServer {
  const server = new McpServer(
    { name: 'kaveri-context', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ------------------------------------------------------------------
  // get_course_tree
  // ------------------------------------------------------------------
  server.registerTool(
    'get_course_tree',
    {
      title: 'Get course tree',
      description: 'Returns the faculty member\'s courses (default) or the full chapter/lesson skeleton of ONE course they are assigned to. Use it to see where new content fits.',
      inputSchema: { course_id: z.string().uuid().optional().describe('Course id; omit to list assigned courses.') },
    },
    async ({ course_id }) => {
      if (course_id) {
        await requireCourseAccess(deps, course_id);
        const { data: course } = await deps.supabase
          .from('courses')
          .select('id,title,short_description,difficulty,category')
          .eq('id', course_id)
          .maybeSingle();
        if (!course) return { content: [{ type: 'text', text: jsonText({ error: 'Course not found.' }) }] };
        const { data: chapters } = await deps.supabase
          .from('chapters')
          .select('id,title,order_index')
          .eq('course_id', course_id)
          .order('order_index');
        const chapterIds = ((chapters ?? []) as any[]).map(c => c.id);
        const { data: lessons } = chapterIds.length
          ? await deps.supabase
              .from('lessons')
              .select('id,chapter_id,title,order_index,teaching_mode')
              .in('chapter_id', chapterIds)
              .order('order_index')
          : { data: [] };
        const tree = {
          course: { id: course.id, title: course.title, difficulty: course.difficulty, about: cap(course.short_description, NOTE_CAP) },
          chapters: ((chapters ?? []) as any[]).map(c => ({
            id: c.id,
            title: c.title,
            lessons: (lessons ?? []).filter((l: any) => l.chapter_id === c.id).map((l: any) => ({
              id: l.id, title: l.title, teaching_mode: l.teaching_mode ?? null,
            })),
          })),
        };
        return { content: [{ type: 'text', text: jsonText(tree) }] };
      }

      // No course_id: the faculty member's own assigned courses.
      const { data: assigned } = await deps.supabase
        .from('course_faculty')
        .select('course:courses(id,title,short_description,difficulty,category)')
        .eq('faculty_id', deps.facultyId);
      const courses = (assigned ?? []).map((a: any) => a.course).filter(Boolean);
      return { content: [{ type: 'text', text: jsonText({ courses }) }] };
    },
  );

  // ------------------------------------------------------------------
  // get_lesson_context
  // ------------------------------------------------------------------
  server.registerTool(
    'get_lesson_context',
    {
      title: 'Get lesson context',
      description: 'Full context for ONE lesson: title, teaching mode, text content, resources, sibling lessons and the chapter. The lesson must belong to a course assigned to this faculty.',
      inputSchema: { lesson_id: z.string().uuid().describe('Lesson id.') },
    },
    async ({ lesson_id }) => {
      const { lesson, courseId } = await requireLessonAccess(deps, lesson_id);
      const { data: siblings } = await deps.supabase
        .from('lessons')
        .select('id,title,order_index,teaching_mode')
        .eq('chapter_id', lesson.chapter_id)
        .order('order_index');
      const { data: resources } = await deps.supabase
        .from('lesson_resources')
        .select('title,kind')
        .eq('lesson_id', lesson.id)
        .order('created_at')
        .limit(30);
      const { data: minis } = await deps.supabase
        .from('coding_vscode_assignments')
        .select('title,topic')
        .eq('lesson_id', lesson.id)
        .order('created_at')
        .limit(30);
      return {
        content: [{
          type: 'text',
          text: jsonText({
            course_id: courseId,
            lesson: {
              id: lesson.id,
              title: lesson.title,
              teaching_mode: lesson.teaching_mode ?? null,
              text_fields: Object.fromEntries(
                ['description', 'content', 'objectives', 'learning_outcomes']
                  .filter(k => typeof lesson[k] === 'string' && lesson[k].trim())
                  .map(k => [k, cap(lesson[k], NOTE_CAP)]),
              ),
            },
            sibling_lessons: (siblings ?? []).map((s: any) => ({ id: s.id, title: s.title })),
            resources: resources ?? [],
            existing_mini_projects: minis ?? [],
          }),
        }],
      };
    },
  );

  // ------------------------------------------------------------------
  // search_question_bank
  // ------------------------------------------------------------------
  server.registerTool(
    'search_question_bank',
    {
      title: 'Search question bank',
      description: 'Searches coding questions authored by this faculty (or published platform questions) by topic and optional difficulty. Returns titles/topics only — never hidden tests or solutions.',
      inputSchema: {
        topic: z.string().max(120).optional().describe('Topic keywords, e.g. "relational operators".'),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      },
    },
    async ({ topic, difficulty, limit }) => {
      let query = deps.supabase
        .from('coding_questions')
        .select('id,title,topic,subtopic,difficulty,default_marks,is_published,created_by')
        .or(`created_by.eq.${deps.facultyId},is_published.eq.true`)
        .order('created_at', { ascending: false })
        .limit(Math.min(30, limit ?? 15));
      if (topic) query = query.ilike('topic', `%${cap(topic, 80)}%`);
      if (difficulty) query = query.eq('difficulty', difficulty);
      const { data, error } = await query;
      if (error) return { content: [{ type: 'text', text: jsonText({ error: 'Bank search failed.' }) }] };
      return { content: [{ type: 'text', text: jsonText({ questions: ((data ?? []) as any[]).map(q => ({ ...q, created_by_mine: q.created_by === deps.facultyId })) }) }] };
    },
  );

  // ------------------------------------------------------------------
  // get_faculty_drafts
  // ------------------------------------------------------------------
  server.registerTool(
    'get_faculty_drafts',
    {
      title: 'Get faculty drafts',
      description: 'This faculty\'s recent DRAFT content (mini projects, assignments, quizzes) so the model can vary new drafts instead of duplicating existing ones.',
      inputSchema: { limit: z.number().int().min(1).max(30).optional() },
    },
    async ({ limit }) => {
      const n = Math.min(30, limit ?? 10);
      const [{ data: minis }, { data: assigns }, { data: quizzes }] = await Promise.all([
        deps.supabase.from('coding_vscode_assignments').select('id,title,topic,created_at').eq('created_by', deps.facultyId).order('created_at', { ascending: false }).limit(n),
        deps.supabase.from('assignments').select('id,title,description,created_at').eq('created_by', deps.facultyId).order('created_at', { ascending: false }).limit(n),
        deps.supabase.from('quizzes').select('id,title,created_at').eq('created_by', deps.facultyId).order('created_at', { ascending: false }).limit(n),
      ]);
      return {
        content: [{
          type: 'text',
          text: jsonText({
            mini_projects: minis ?? [],
            assignments: assigns ?? [],
            quizzes: quizzes ?? [],
          }),
        }],
      };
    },
  );

  // ------------------------------------------------------------------
  // get_related_items
  // ------------------------------------------------------------------
  server.registerTool(
    'get_related_items',
    {
      title: 'Get related items',
      description: 'Everything in ONE course related to a topic: quizzes, assignments, mini projects and bank questions matching the keywords. Used to avoid duplication and calibrate difficulty.',
      inputSchema: {
        course_id: z.string().uuid(),
        topic: z.string().max(120).describe('Topic keywords.'),
      },
    },
    async ({ course_id, topic }) => {
      await requireCourseAccess(deps, course_id);
      const t = cap(topic, 80);
      const [{ data: quizzes }, { data: assigns }] = await Promise.all([
        deps.supabase.from('quizzes').select('id,title').eq('course_id', course_id).ilike('title', `%${t}%`).limit(20),
        deps.supabase.from('assignments').select('id,title,description').eq('course_id', course_id).or(`title.ilike.%${t}%,description.ilike.%${t}%`).limit(20),
      ]);
      const { data: bank } = await deps.supabase
        .from('coding_questions')
        .select('id,title,topic,difficulty,is_published')
        .or(`created_by.eq.${deps.facultyId},is_published.eq.true`)
        .or(`topic.ilike.%${t}%,title.ilike.%${t}%`)
        .limit(20);
      return {
        content: [{
          type: 'text',
          text: jsonText({ course_id, topic: t, quizzes: quizzes ?? [], assignments: assigns ?? [], bank_questions: bank ?? [] }),
        }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// In-process client
// ---------------------------------------------------------------------------
export interface KaveriMcpClient {
  /** MCP tool catalog as provider-agnostic tool definitions (JSON Schema). */
  listTools(): Promise<{ name: string; description: string; inputSchema: Record<string, unknown> }[]>;
  /** Executes one tool call and returns the text payload. */
  callTool(name: string, argsJson: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Wires a fresh kaveri-context MCP server to a client over InMemoryTransport.
 * Create one per generation request so the deps (JWT supabase client +
 * facultyId) match the caller; close() after the chat completes.
 */
export async function createKaveriMcpClient(deps: McpContextDeps): Promise<KaveriMcpClient> {
  const server = createKaveriMcpServer(deps);
  const client = new Client({ name: 'kaveri-generate', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    async listTools() {
      const { tools } = await client.listTools();
      return (tools ?? []).map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }));
    },
    async callTool(name: string, argsJson: string) {
      try {
        const result = await client.callTool({ name, arguments: JSON.parse(argsJson || '{}') });
        const text = ((result?.content ?? []) as any[])
          .filter(c => c?.type === 'text')
          .map(c => String(c.text ?? ''))
          .join('\n');
        return result?.isError ? JSON.stringify({ error: text || 'Tool error.' }) : (text || '{}');
      } catch (e) {
        // Tool failures must not kill the generation: feed the model an error
        // payload and let it continue without that tool's data.
        return jsonText({ error: e instanceof Error ? e.message : 'Tool failed.' });
      }
    },
    async close() {
      try {
        await client.close();
      } catch { /* noop */ }
      try {
        await server.close();
      } catch { /* noop */ }
    },
  };
}
