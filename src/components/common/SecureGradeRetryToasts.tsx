import { useEffect, useRef } from 'react';
import { useToast } from '../ui/Toast';
import { secureGradeEvents } from '../../services/secureGrading';

/**
 * Global listener: while any grading request is being retried automatically
 * (cold runner, transient 5xx, network blip), show one friendly toast so
 * students know their work is safe — never a raw error for a hiccup.
 * Toasts are coalesced per attempt number so rapid events don't stack up.
 */
export function SecureGradeRetryToasts() {
  const { info } = useToast();
  const lastAttempt = useRef(0);

  useEffect(() => {
    return secureGradeEvents.subscribe(event => {
      if (event.type === 'retrying' && event.attempt !== lastAttempt.current) {
        lastAttempt.current = event.attempt;
        info(
          'Grader is busy — automatically retrying',
          event.attempt === 2
            ? 'Hang tight, your code and answers are safe.'
            : 'Still retrying — nothing is lost. This usually finishes in a few seconds.',
        );
      }
    });
  }, [info]);

  return null;
}
