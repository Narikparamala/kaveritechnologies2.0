// Push notification settings card — shared by student + faculty settings.
// States: unsupported browser / insecure context / keys missing /
// permission blocked / enabled / disabled. Honest about the ~1 minute
// delivery delay (outbox worker runs every minute).

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, Send, ShieldAlert } from 'lucide-react';
import { useToast } from '../ui/Toast';
import {
  disablePush,
  enablePush,
  getActivePushSubscription,
  getPushState,
  sendTestPush,
  type PushState,
} from '../../services/push';

type Phase = 'checking' | 'idle' | 'working';

export function PushNotificationCard() {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<PushState | null>(null);
  const [hasDevice, setHasDevice] = useState(false);

  const refresh = useCallback(async () => {
    setPhase('checking');
    const pushState = await getPushState();
    setState(pushState);
    setHasDevice(Boolean(await getActivePushSubscription()));
    setPhase('idle');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleEnable = async () => {
    setPhase('working');
    const result = await enablePush();
    if (!result.ok) {
      const messages: Record<string, string> = {
        'unsupported-browser': 'This browser does not support push notifications.',
        'insecure-context': 'Push requires a secure (https) connection.',
        'not-configured': 'Push is not configured yet — ask the admin to add the Firebase keys.',
        'permission-denied': 'Notification permission was blocked. Enable it in your browser site settings.',
        'registration-failed': 'Could not register the push service. Try refreshing the page.',
      };
      toast.error('Push not enabled', messages[result.error ?? ''] ?? result.error ?? 'Unknown error');
    } else {
      toast.success('Push notifications enabled', 'You will now receive alerts on this device.');
    }
    await refresh();
    setPhase('idle');
  };

  const handleDisable = async () => {
    setPhase('working');
    const result = await disablePush();
    if (result.ok) {
      toast.success('Push notifications disabled', 'This device will no longer receive alerts.');
    } else {
      toast.error('Could not disable push', result.error ?? 'Unknown error');
    }
    await refresh();
    setPhase('idle');
  };

  const handleTest = async () => {
    setPhase('working');
    const result = await sendTestPush();
    if (result.ok) {
      toast.info('Test sent', 'It lands in your bell now and on this device within about a minute.');
    } else {
      toast.error('Test failed', result.error ?? 'Unknown error');
    }
    setPhase('idle');
  };

  if (phase === 'checking' || !state) {
    return (
      <section className="card p-6">
        <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Bell size={16} /> Push Notifications
        </h2>
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Checking this device…
        </p>
      </section>
    );
  }

  const titleRow = (
    <h2 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
      <Bell size={16} /> Push Notifications
    </h2>
  );

  // --- unsupported / insecure / blocked ---
  if (!state.supported || state.reason === 'insecure-context') {
    return (
      <section className="card p-6">
        {titleRow}
        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-start gap-2">
          <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          {state.reason === 'insecure-context'
            ? 'Push notifications need a secure (https) connection.'
            : 'This browser does not support web push notifications. Try Chrome, Edge, Firefox or Safari 16+.'
          }
        </p>
      </section>
    );
  }

  // --- keys not configured yet ---
  if (state.reason === 'not-configured') {
    return (
      <section className="card p-6">
        {titleRow}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Push delivery is being set up. In-app notifications keep working — check back soon.
        </p>
      </section>
    );
  }

  const blocked = state.permission === 'denied';

  return (
    <section className="card p-6">
      {titleRow}
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Get assignment, grading and announcement alerts even when this tab is closed.
      </p>

      <div className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
        blocked
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : hasDevice
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
      }`}>
        <div className="flex items-start gap-3">
          {hasDevice
            ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
            : <BellOff size={18} className="text-slate-400 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {blocked ? 'Notifications blocked in your browser'
                : hasDevice ? 'Enabled on this device' : 'Not enabled on this device'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {blocked
                ? 'Allow notifications for this site in the browser address bar, then reload.'
                : hasDevice
                  ? 'Alerts will appear even when the app is closed.'
                  : 'Turn on to receive alerts on this device.'}
            </p>
          </div>
        </div>
        {!blocked && (
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            {hasDevice ? (
              <>
                <button className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5" onClick={handleTest} disabled={phase === 'working'}>
                  <Send size={13} /> Send test
                </button>
                <button className="btn-secondary text-xs py-2 px-3" onClick={handleDisable} disabled={phase === 'working'}>
                  Disable
                </button>
              </>
            ) : (
              <button className="btn-primary text-xs py-2 px-3" onClick={handleEnable} disabled={phase === 'working'}>
                {phase === 'working' ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />} Enable push
              </button>
            )}
          </div>
        )}
      </div>

      {hasDevice && (
        <p className="text-xs text-slate-400 mt-3">
          Delivery runs through the notification queue once a minute — a test push lands in your bell instantly and on this device shortly after.
        </p>
      )}
    </section>
  );
}
