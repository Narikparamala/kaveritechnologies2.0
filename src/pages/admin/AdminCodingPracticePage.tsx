import FacultyQuestionBankPage from '../faculty/FacultyQuestionBankPage';

/**
 * Admin view of the coding-practice question bank.
 *
 * Reuses the faculty question bank page wholesale — same list, same editor,
 * same RLS-guarded write path (`is_kaveri_staff()` covers both roles). Kept
 * as its own module so the admin sidebar has a distinct route without
 * duplicating any editor logic.
 */
export default function AdminCodingPracticePage() {
  return <FacultyQuestionBankPage basePath="/admin/coding-practice" />;
}
