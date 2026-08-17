import { useEffect, useState } from 'react';
import { Settings, Save } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import type { PlatformSetting } from '../../types/database';

export default function PlatformSettingsPage() {
  const { success } = useToast();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('platform_settings').select('*').order('key')
      .then(({ data }) => { setSettings((data ?? []) as PlatformSetting[]); setLoading(false); });
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings(ss => ss.map(s => s.key === key ? { ...s, value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    for (const s of settings) {
      await supabase.from('platform_settings').update({ value: s.value }).eq('key', s.key);
    }
    success('Settings saved!');
    setSaving(false);
  };

  if (loading) return <div className="p-8 animate-pulse"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-1/3 mb-8" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader
        title="Platform Settings"
        subtitle="Configure global platform settings"
        icon={Settings}
        action={
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={14} /> {saving ? 'Saving...' : 'Save All'}
          </button>
        }
      />

      <div className="card p-6 space-y-5">
        {settings.map(s => (
          <div key={s.key}>
            <label className="label capitalize">{s.key.replace(/_/g, ' ')}</label>
            {s.description && <p className="text-xs text-slate-400 mb-1.5">{s.description}</p>}
            {s.key === 'maintenance_mode' ? (
              <select className="input" value={s.value ?? ''} onChange={e => updateSetting(s.key, e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled (Maintenance)</option>
              </select>
            ) : (
              <input className="input" value={s.value ?? ''} onChange={e => updateSetting(s.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
