// =====================================================================
// integrations-question-paper — Kaveri Offline Exams bridge V1 endpoint
//
//   Question Paper system (server only, never browser)
//     → POST /functions/v1/integrations-question-paper
//       X-Kaveri-Timestamp: <unix epoch seconds>
//       X-Kaveri-Signature: <hex HMAC-SHA256(timestamp "." idempotency_key "." raw_body)>
//       Idempotency-Key: qp-exam.<external_paper_id>.<finalize instant>
//       body: { external_paper_id, title, course_id?, batch_label?,
//               external_set_id?, exam_date?, start_time?,
//               duration_minutes?, max_marks?, student_instructions?,
//               status? }
//
// The LMS stores METADATA + linkage only. Question content, answer keys and
// paper sets never leave the Question Paper system, so they can never leak
// through this endpoint or the student LMS.
//
// Verification mirrors the Workshop contract:
//   - signature constant-time compared against a per-satellite secret
//     (env KAVERI_QUESTION_PAPER_INTEGRATION_SECRET, else vault secret
//     'integrations.question_paper.secret'). A separate secret from Workshop.
//   - secret strength: minimum 32 bytes — never padded.
//   - timestamp freshness ±5 minutes.
//   - idempotency: recorded in integration_audit_log
//     (source 'question-paper', action 'offline_exam.upsert').
// =====================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

type AdminClient = SupabaseClient<any, any, any>;

const REPLAY_WINDOW_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(bytes =>
    Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''),
  );
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [aHash, bHash] = await Promise.all([digest(a), digest(b)]);
  if (aHash.length !== bHash.length) return false;
  let diff = 0;
  for (let index = 0; index < aHash.length; index += 1) diff |= aHash[index] ^ bHash[index];
  return diff === 0;
}

async function satelliteSecret(admin: AdminClient): Promise<string> {
  const env = Deno.env.get('KAVERI_QUESTION_PAPER_INTEGRATION_SECRET');
  if (env) return env;
  const { data, error } = await admin.rpc('get_server_secret', { p_name: 'integrations.question_paper.secret' });
  if (error || typeof data !== 'string') return '';
  return data;
}

async function audit(
  admin: AdminClient,
  action: string,
  idempotencyKey: string,
  rawBody: string,
  requestSummary: Record<string, unknown>,
  responseCode: number | null,
  result: string,
) {
  const hash = await sha256Hex(rawBody);
  const { error } = await admin.from('integration_audit_log').upsert(
    {
      source: 'question-paper',
      action,
      idempotency_key: idempotencyKey,
      request_sha256: hash,
      request_summary: requestSummary,
      response_code: responseCode,
      result,
    },
    { onConflict: 'source,action,idempotency_key' },
  );
  if (error) console.error('[integrations-question-paper] audit write failed', error.message);
}

type ExamPayload = {
  external_paper_id?: string;
  title?: string;
  course_id?: string;
  batch_label?: string;
  external_set_id?: string;
  exam_date?: string;
  start_time?: string;
  duration_minutes?: string | number;
  max_marks?: string | number;
  student_instructions?: string;
  status?: string;
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const timestamp = req.headers.get('x-kaveri-timestamp');
  const signature = req.headers.get('x-kaveri-signature');
  const idempotencyKey = req.headers.get('idempotency-key');
  if (!timestamp || !signature || !idempotencyKey) {
    return json({ error: 'Missing webhook headers' }, 401);
  }

  const rawBody = await req.text();
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return json({ error: 'Invalid timestamp' }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
    return json({ error: 'Stale timestamp', code: 'STALE_TIMESTAMP' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[integrations-question-paper] missing runtime env');
    return json({ error: 'Server configuration error' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const secret = await satelliteSecret(admin);
  if (!secret) return json({ error: 'Integration not configured' }, 503);
  if (new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) {
    console.error('[integrations-question-paper] integration secret shorter than 32 bytes');
    return json({ error: 'Integration not configured', code: 'CONFIGURATION_ERROR' }, 500);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${idempotencyKey}.${rawBody}`),
  );
  const actualSignature = Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('');

  if (!(await timingSafeEqual(signature, actualSignature))) {
    await audit(admin, 'offline_exam.upsert', `rejected:invalid_signature:${timestamp}`, rawBody, { rejected: true }, 401, 'invalid_signature');
    return json({ error: 'Invalid signature' }, 401);
  }

  let payload: ExamPayload;
  try {
    payload = JSON.parse(rawBody) as ExamPayload;
  } catch {
    await audit(admin, 'offline_exam.upsert', `rejected:malformed:${timestamp}`, rawBody, { rejected: true }, 400, 'malformed_payload');
    return json({ error: 'Malformed JSON payload' }, 400);
  }

  const externalPaperId = String(payload.external_paper_id ?? '').trim();
  const title = String(payload.title ?? '').trim();
  if (!externalPaperId || !title) {
    await audit(admin, 'offline_exam.upsert', `rejected:missing_fields:${timestamp}`, rawBody, { rejected: true }, 400, 'missing_fields');
    return json({ error: 'external_paper_id and title are required' }, 400);
  }

  // Validate optional formats so nothing malformed reaches the ingest RPC.
  const cleanText = (value: unknown, maxLength = 500): string | null => {
    const text = String(value ?? '').trim();
    return text && text.length <= maxLength ? text : null;
  };
  const examDate = cleanText(payload.exam_date);
  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return json({ error: 'exam_date must be YYYY-MM-DD' }, 400);
  }
  const startTime = cleanText(payload.start_time);
  if (startTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
    return json({ error: 'start_time must be HH:MM[:SS]' }, 400);
  }
  const courseId = cleanText(payload.course_id, 64);
  if (courseId && !/^[0-9a-fA-F-]{36}$/.test(courseId)) {
    return json({ error: 'course_id must be a uuid' }, 400);
  }

  const safePayload = {
    external_source: 'kaveri_question_paper',
    external_paper_id: externalPaperId,
    title,
    status: cleanText(payload.status, 20) ?? 'finalized',
    course_id: courseId,
    batch_label: cleanText(payload.batch_label, 200),
    external_set_id: cleanText(payload.external_set_id, 100),
    exam_date: examDate,
    start_time: startTime,
    duration_minutes: payload.duration_minutes === undefined || payload.duration_minutes === null || payload.duration_minutes === ''
      ? undefined
      : Number(payload.duration_minutes),
    max_marks: payload.max_marks === undefined || payload.max_marks === null || payload.max_marks === ''
      ? undefined
      : Number(payload.max_marks),
    student_instructions: cleanText(payload.student_instructions, 2000),
  };

  const { data, error } = await admin.rpc('ingest_offline_exam', { p_payload: safePayload });

  if (error) {
    console.error('[integrations-question-paper] ingest RPC failed', error.message);
    return json({ error: 'Ingestion failed', code: error.code ?? 'INGEST_ERROR' }, 500);
  }

  const outcome = (data ?? {}) as Record<string, unknown>;
  await audit(
    admin,
    'offline_exam.upsert',
    idempotencyKey,
    rawBody,
    { external_paper_id: externalPaperId, action: outcome.action, result: outcome.result ?? outcome.action },
    error ? null : 200,
    error ? 'failed' : String(outcome.action ?? 'ok'),
  );

  return json({ ok: true, ...outcome }, 200);
});
