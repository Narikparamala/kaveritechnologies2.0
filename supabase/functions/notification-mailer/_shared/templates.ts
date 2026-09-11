// Approved transactional email templates for the Kaveri central outbox.
//
// Only templates listed here can be rendered — the mailer rejects unknown
// template keys. Content is derived from real platform payloads only; no
// invented marketing claims. All user-supplied fields are HTML-escaped.
//
// Contact/footer identity: Kaveri Technologies Private Limited.

import { COMPANY } from './company.ts';

export const ALLOWED_TEMPLATE_KEYS = [
  'enrollment_request_created',
  'enrollment_approved',
  'enrollment_rejected',
] as const;

export type TemplateKey = (typeof ALLOWED_TEMPLATE_KEYS)[number];

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicUrl(): string {
  return (Deno.env.get('LMS_PUBLIC_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function footerHtml(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e5e7eb;padding-top:16px">
    <tr>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;line-height:1.6">
        ${esc(COMPANY.legalName)}<br/>
        <a href="${esc(COMPANY.websiteUrl)}" style="color:#4f46e5">${esc(COMPANY.website)}</a> · ${esc(COMPANY.email)} · ${esc(COMPANY.phone)}<br/>
        Tirupati · Madanapalle, Andhra Pradesh
      </td>
    </tr>
  </table>`;
}

function footerText(): string {
  return [
    '',
    '—',
    COMPANY.legalName,
    `${COMPANY.website} · ${COMPANY.email} · ${COMPANY.phone}`,
    'Tirupati · Madanapalle, Andhra Pradesh',
  ].join('\n');
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
            <tr>
              <td style="background:#1e1b4b;padding:20px 28px">
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff">${esc(COMPANY.brandName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:18px;color:#111827;margin:0 0 12px">${esc(title)}</h1>
                ${bodyHtml}
                ${footerHtml()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaHtml(href: string, label: string): string {
  return `<p style="margin:20px 0 0">
    <a href="${esc(href)}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px">${esc(label)}</a>
  </p>`;
}

type Payload = Record<string, unknown>;

const TEMPLATES: Record<TemplateKey, (p: Payload) => RenderedEmail> = {
  // ---- enrollment_request_created → Kaveri admissions/admin ----
  enrollment_request_created(p) {
    const base = publicUrl();
    const course = String(p.course_title ?? 'a course');
    const studentName = String(p.student_name ?? 'A student');
    const studentEmail = String(p.student_email ?? '');
    const requestedAt = formatDate(p.requested_at);
    const message = String(p.request_message ?? '').trim();
    const adminUrl = `${base}/admin/enrollments/requests`;

    const html = wrapHtml('New course access request', `
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6">
        <strong>${esc(studentName)}</strong> (${esc(studentEmail)}) has requested access to
        <strong>${esc(course)}</strong>.
      </p>
      ${requestedAt ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">Requested on ${esc(requestedAt)}</p>` : ''}
      ${message ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6;border-left:3px solid #e5e7eb;padding-left:12px">“${esc(message)}”</p>` : ''}
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6">
        Review and respond to this request in the admissions queue.
      </p>
      ${ctaHtml(adminUrl, 'Open Enrollment Requests')}
    `);

    const text = [
      `New course access request`,
      '',
      `${studentName} (${studentEmail}) has requested access to ${course}.`,
      requestedAt ? `Requested on ${requestedAt}` : '',
      message ? `Message: ${message}` : '',
      '',
      `Review it here: ${adminUrl}`,
      footerText(),
    ].filter(Boolean).join('\n');

    return { subject: `New course access request — ${course}`, html, text };
  },

  // ---- enrollment_approved → student ----
  enrollment_approved(p) {
    const base = publicUrl();
    const course = String(p.course_title ?? 'a course');
    const slug = String(p.course_slug ?? '');
    const courseUrl = slug ? `${base}/courses/${encodeURIComponent(slug)}` : `${base}/courses`;

    const html = wrapHtml('Course access approved', `
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6">
        Your request for <strong>${esc(course)}</strong> has been approved.
        The course is now available in your dashboard.
      </p>
      ${ctaHtml(courseUrl, 'Go to Course')}
    `);

    const text = [
      'Course access approved',
      '',
      `Your request for ${course} has been approved. The course is now available in your dashboard.`,
      '',
      `Go to course: ${courseUrl}`,
      footerText(),
    ].join('\n');

    return { subject: `Access approved — ${course}`, html, text };
  },

  // ---- enrollment_rejected → student ----
  enrollment_rejected(p) {
    const base = publicUrl();
    const course = String(p.course_title ?? 'a course');
    const slug = String(p.course_slug ?? '');
    const courseUrl = slug ? `${base}/courses/${encodeURIComponent(slug)}` : `${base}/courses`;
    const note = String(p.review_note ?? '').trim();
    const mailto = `mailto:${COMPANY.email}`;

    const html = wrapHtml('About your course access request', `
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6">
        Your request for <strong>${esc(course)}</strong> was not approved.
      </p>
      ${note ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6;border-left:3px solid #e5e7eb;padding-left:12px">${esc(note)}</p>` : ''}
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6">
        If you believe this is an error, contact the Kaveri team and we will help.
      </p>
      <p style="margin:20px 0 0">
        <a href="${esc(mailto)}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px">Contact Kaveri</a>
      </p>
    `);

    const text = [
      'About your course access request',
      '',
      `Your request for ${course} was not approved.`,
      note ? `Reason: ${note}` : '',
      '',
      'If you believe this is an error, contact the Kaveri team and we will help.',
      `Email: ${COMPANY.email}`,
      footerText(),
    ].filter(Boolean).join('\n');

    return { subject: `Update on your request — ${course}`, html, text };
  },
};

export function renderTemplate(key: string, payload: Payload): RenderedEmail | null {
  const render = (TEMPLATES as Record<string, (p: Payload) => RenderedEmail>)[key];
  return render ? render(payload) : null;
}