// Faculty AI Connections — per-faculty BYO API keys, provider + model choice.
//
// The API key field is masked and send-only: the server never returns keys,
// so editing shows "update key?" as an optional field. "Test connection"
// probes the provider with a one-token completion before anything is saved,
// and the saved list shows which connection generation will actually use.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  AI_PROVIDERS,
  deleteAiConnection,
  fetchAiConnections,
  saveAiConnection,
  testAiConnection,
  type AiConnection,
  type AiConnectionsData,
  type AiProvider,
} from '../../services/aiConnections';

const SUGGESTED_DEFAULT = 'openrouter/mistralai/mistral-small';

function providerMeta(provider: string) {
  return AI_PROVIDERS.find(p => p.id === provider);
}

export default function FacultyAiConnectionsPage() {
  const { success, error: toastError } = useToast();

  const [data, setData] = useState<AiConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');

  // Form state (edit when editingId is set, create otherwise).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider>('openrouter');
  const [model, setModel] = useState(SUGGESTED_DEFAULT.split('/')[1] ?? '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [labelText, setLabelText] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFatal('');
    try {
      const res = await fetchAiConnections();
      setData(res);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Could not load AI connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setProvider('openrouter');
    setModel('');
    setApiKey('');
    setShowKey(false);
    setBaseUrl('');
    setLabelText('');
    setIsDefault(false);
    setTestResult(null);
  }, []);

  const startEdit = useCallback((conn: AiConnection) => {
    setEditingId(conn.id);
    setProvider((conn.provider as AiProvider) ?? 'custom');
    setModel(conn.model);
    setApiKey(''); // never displayed or re-sent unless changed
    setShowKey(false);
    setBaseUrl(conn.base_url ?? '');
    setLabelText(conn.label ?? '');
    setIsDefault(conn.is_default);
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const save = useCallback(async () => {
    if (!model.trim()) {
      toastError('Model required', 'Pick or type the model id your provider should use.');
      return;
    }
    const isCreate = !editingId;
    if (isCreate && apiKey.trim().length < 8) {
      toastError('API key required', 'Paste the full key from your provider (it is encrypted before storage).');
      return;
    }
    setSaving(true);
    try {
      await saveAiConnection({
        id: editingId,
        provider,
        model: model.trim(),
        api_key: apiKey.trim() ? apiKey.trim() : null, // null = keep existing on edit
        base_url: provider === 'custom' ? baseUrl.trim() : null,
        label: labelText.trim() || null,
        is_default: isDefault,
      });
      success(editingId ? 'Connection updated' : 'Connection saved', 'Your AI drafts will now use it.');
      resetForm();
      await load();
    } catch (e) {
      toastError('Could not save connection', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [editingId, provider, model, apiKey, baseUrl, labelText, isDefault, data, toastError, success, resetForm, load]);

  const test = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (editingId) {
        const res = await testAiConnection({ id: editingId });
        setTestResult({ ok: res.ok, text: res.ok ? 'Connection works.' : res.error ?? 'Connection failed.' });
      } else {
        if (!model.trim() || apiKey.trim().length < 8) {
          setTestResult({ ok: false, text: 'Enter an API key and model first.' });
          setTesting(false);
          return;
        }
        const res = await testAiConnection({
          provider,
          model: model.trim(),
          api_key: apiKey.trim(),
          base_url: provider === 'custom' ? baseUrl.trim() : null,
        });
        setTestResult({ ok: res.ok, text: res.ok ? 'Connection works.' : res.error ?? 'Connection failed.' });
      }
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : 'Connection failed.' });
    } finally {
      setTesting(false);
    }
  }, [editingId, provider, model, apiKey, baseUrl]);

  const remove = useCallback(async (conn: AiConnection) => {
    if (!window.confirm(`Remove the ${conn.provider_label} connection (${conn.model})? Generation will fall back to the platform key if none remain.`)) return;
    setRemovingId(conn.id);
    try {
      await deleteAiConnection(conn.id);
      success('Connection removed');
      if (editingId === conn.id) resetForm();
      await load();
    } catch (e) {
      toastError('Could not remove connection', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRemovingId(null);
    }
  }, [editingId, resetForm, load, success, toastError]);

  const connections = data?.connections ?? [];
  const suggestions: string[] = data?.defaults?.[provider] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Connections"
        subtitle="Connect your own API keys so AI drafts run on your model, your budget, your rules"
        icon={Bot}
      />

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-500/10 dark:text-blue-200">
        Keys are encrypted before they are stored and are only decrypted inside the generation
        service. OpenRouter is the easiest start — one key covers Claude, GPT, Gemini and open
        models.
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-slate-500 dark:text-slate-400">
          <Loader2 className="mr-2 animate-spin" size={20} /> Loading connections…
        </div>
      ) : fatal ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          {fatal}
        </div>
      ) : (
        <>
          {/* Form */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Edit connection' : 'Add a connection'}
              </h2>
              {editingId && (
                <button type="button" onClick={resetForm} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  Cancel edit
                </button>
              )}
            </div>

            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Provider</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {AI_PROVIDERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProvider(p.id);
                    setModel('');
                    setTestResult(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    provider === p.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <p className="font-medium text-slate-900 dark:text-white">{p.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.hint}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  API Key {editingId && <span className="text-slate-400">(leave blank to keep the saved one)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="input pr-11"
                    placeholder={editingId ? '•••••••• (unchanged)' : 'Paste your key'}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Model</label>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="input"
                  placeholder={provider === 'google' ? 'gemini-flash-latest' : provider === 'openrouter' ? 'anthropic/claude-3.5-haiku' : 'model id'}
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModel(m)}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {provider === 'custom' && (
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Base URL</label>
                  <input
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    className="input"
                    placeholder="https://your-endpoint.example.com/v1"
                    autoComplete="off"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Label (optional)</label>
                <input
                  value={labelText}
                  onChange={e => setLabelText(e.target.value)}
                  className="input"
                  placeholder="e.g. Budget key / Claude drafts"
                  autoComplete="off"
                />
              </div>

              <label className="flex items-center gap-3 self-end pb-1 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={e => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Set as my default connection
              </label>
            </div>

            {testResult && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-500/10 dark:text-red-200'
                }`}
              >
                {testResult.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
                <span>{testResult.text}</span>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {editingId ? 'Update connection' : 'Save connection'}
              </button>
              <button
                type="button"
                onClick={test}
                disabled={testing}
                className="btn-secondary inline-flex items-center gap-2"
              >
                {testing ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
                Test connection
              </button>
            </div>
          </section>

          {/* Saved connections */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">Your connections</h2>
              <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                <Plus size={15} /> Add another
              </button>
            </div>

            {connections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                No connections yet. Add one above and AI Drafts / Mini Projects / Assignments will
                use your key automatically. Until then, generation uses the platform key when
                available.
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map(conn => (
                  <div
                    key={conn.id}
                    className={`rounded-xl border p-4 ${
                      conn.is_default
                        ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-500/5'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {conn.provider_label}
                            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">{conn.model}</span>
                          </p>
                          {conn.is_default && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              <Star size={11} /> Default
                            </span>
                          )}
                          {conn.label && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {conn.label}
                            </span>
                          )}
                        </div>
                        {conn.base_url && (
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{conn.base_url}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(conn)}
                          className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(conn)}
                          disabled={removingId === conn.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          {removingId === conn.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!data?.platform_fallback_allowed && connections.length === 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Platform fallback may not be available for your role — connect a key to use AI generation.
              </p>
            )}
          </section>

          <p className="text-center text-xs text-slate-400">
            Generation uses this connection inside{' '}
            <Link to="/faculty/content-import" className="underline hover:text-slate-500">Content Import</Link>
            {' '}(AI Drafts, AI Mini Projects, AI Assignments).
          </p>
        </>
      )}
    </div>
  );
}
