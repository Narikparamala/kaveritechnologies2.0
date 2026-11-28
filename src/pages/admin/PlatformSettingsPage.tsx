import { useEffect, useState } from 'react';
import { Settings, Save, Upload, Image as ImageIcon } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import type { PlatformSetting } from '../../types/database';
import {
  DEFAULT_BRANDING,
  getCompanyBranding,
  saveCompanyBranding,
  type CompanyBranding,
} from '../../services/companyBranding';
import { uploadBrandingFile } from '../../services/fileUpload';

const DEFAULT_PRIMARY_COLOR = '#004B8D';

export default function PlatformSettingsPage() {
  const { success, error } = useToast();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- Branding (company_settings, one row) — new section only. ---
  const [branding, setBranding] = useState<CompanyBranding>(DEFAULT_BRANDING);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  useEffect(() => {
    supabase.from('platform_settings').select('*').order('key')
      .then(({ data }) => { setSettings((data ?? []) as PlatformSetting[]); setLoading(false); });
  }, []);

  useEffect(() => {
    getCompanyBranding().then(row => {
      if (row) setBranding(row);
      setBrandingLoading(false);
    });
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

  const updateBranding = (patch: Partial<CompanyBranding>) => {
    setBranding(b => ({ ...b, ...patch }));
  };

  const handleSaveBranding = async () => {
    if (branding.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor)) {
      error('Invalid primary colour', 'Use a 6-digit hex colour like #004B8D, or clear it to keep the default.');
      return;
    }
    setBrandingSaving(true);
    try {
      await saveCompanyBranding(branding);
      success('Branding saved!');
    } catch (e) {
      error('Could not save branding', e instanceof Error ? e.message : 'Unknown error');
    }
    setBrandingSaving(false);
  };

  const handleBrandingUpload = async (kind: 'logo' | 'favicon', file: File | undefined) => {
    if (!file) return;
    if (kind === 'logo') setUploadingLogo(true);
    else setUploadingFavicon(true);
    try {
      const result = await uploadBrandingFile(kind, file);
      updateBranding(kind === 'logo' ? { logoUrl: result.publicUrl } : { faviconUrl: result.publicUrl });
      success(`${kind === 'logo' ? 'Logo' : 'Favicon'} uploaded`, 'Save branding to apply it.');
    } catch (e) {
      error('Upload failed', e instanceof Error ? e.message : 'Unknown error');
    }
    if (kind === 'logo') setUploadingLogo(false);
    else setUploadingFavicon(false);
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

      {/* Branding — display name, tagline, contact, logo/favicon, legal name, colour.
          New section only; the generic settings card below is unchanged. */}
      <div className="card p-6 space-y-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Branding</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Display name, tagline, contact details, logo and favicon shown across the platform.
              Changes apply immediately after saving.
            </p>
          </div>
          <button
            onClick={handleSaveBranding}
            disabled={brandingSaving || brandingLoading}
            className="btn-primary flex items-center gap-2 shrink-0"
          >
            <Save size={14} /> {brandingSaving ? 'Saving...' : 'Save Branding'}
          </button>
        </div>

        {brandingLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded" />
            <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                value={branding.displayName}
                onChange={e => updateBranding({ displayName: e.target.value })}
                placeholder="Kaveri Technologies Academy"
              />
            </div>

            <div>
              <label className="label">Tagline</label>
              <input
                className="input"
                value={branding.tagline}
                onChange={e => updateBranding({ tagline: e.target.value })}
                placeholder="Learn Technology. Build Real Projects. Become Industry Ready."
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Contact email</label>
                <input
                  className="input"
                  type="email"
                  value={branding.contactEmail}
                  onChange={e => updateBranding({ contactEmail: e.target.value })}
                />
                <p className="text-xs text-slate-400 mt-1">Display contact email shown on public pages. This is not an account or sign-in email.</p>
              </div>
              <div>
                <label className="label">Contact phone</label>
                <input
                  className="input"
                  value={branding.contactPhone}
                  onChange={e => updateBranding({ contactPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Website</label>
                <input
                  className="input"
                  value={branding.website}
                  onChange={e => updateBranding({ website: e.target.value })}
                  placeholder="www.kaveritech.co.in"
                />
              </div>
              <div>
                <label className="label">Website URL</label>
                <input
                  className="input"
                  value={branding.websiteUrl}
                  onChange={e => updateBranding({ websiteUrl: e.target.value })}
                  placeholder="https://www.kaveritech.co.in"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Logo</label>
                {branding.logoUrl && (
                  <img src={branding.logoUrl} alt="Current logo" className="h-12 w-12 rounded-xl object-contain bg-white border border-slate-100 shadow-sm mb-2" />
                )}
                <label className="btn-secondary flex items-center gap-2 cursor-pointer w-fit">
                  <Upload size={14} /> {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={e => { void handleBrandingUpload('logo', e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
                <input
                  className="input mt-2"
                  value={branding.logoUrl}
                  onChange={e => updateBranding({ logoUrl: e.target.value })}
                  placeholder="Logo image URL"
                />
                <p className="text-xs text-slate-400 mt-1">PNG, JPG, GIF or WebP, 5 MB max. Or paste an image URL.</p>
              </div>
              <div>
                <label className="label">Favicon</label>
                {branding.faviconUrl && (
                  <img src={branding.faviconUrl} alt="Current favicon" className="h-8 w-8 rounded object-contain bg-white border border-slate-100 shadow-sm mb-2" />
                )}
                <label className="btn-secondary flex items-center gap-2 cursor-pointer w-fit">
                  <ImageIcon size={14} /> {uploadingFavicon ? 'Uploading...' : 'Upload favicon'}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    className="hidden"
                    disabled={uploadingFavicon}
                    onChange={e => { void handleBrandingUpload('favicon', e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
                <input
                  className="input mt-2"
                  value={branding.faviconUrl}
                  onChange={e => updateBranding({ faviconUrl: e.target.value })}
                  placeholder="Favicon image URL"
                />
                <p className="text-xs text-slate-400 mt-1">PNG preferred (browsers accept PNG favicons), 5 MB max.</p>
              </div>
            </div>

            <div>
              <label className="label">Legal entity name (display only)</label>
              <input
                className="input"
                value={branding.legalName}
                onChange={e => updateBranding({ legalName: e.target.value })}
              />
              <p className="text-xs text-slate-400 mt-1">
                Shown on legal pages only. This is <strong>not</strong> a company rename — changing it does not
                change the registered legal entity; that needs a separate decision about the new company.
              </p>
            </div>

            <div>
              <label className="label">Primary colour (optional)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-12 p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer"
                  value={branding.primaryColor ?? DEFAULT_PRIMARY_COLOR}
                  onChange={e => updateBranding({ primaryColor: e.target.value })}
                  aria-label="Primary colour picker"
                />
                <input
                  className="input"
                  value={branding.primaryColor ?? ''}
                  onChange={e => updateBranding({ primaryColor: e.target.value || null })}
                  placeholder="#004B8D"
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => updateBranding({ primaryColor: null })}
                >
                  Use default
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Stored and exposed as the --brand-primary CSS variable. It does not recolour the app&apos;s
                Tailwind classes yet (they compile at build time) — full runtime recolouring is a follow-up;
                see docs/branding-settings.md.
              </p>
            </div>
          </>
        )}
      </div>

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
            ) : s.key === 'content_auto_update' ? (
              <select className="input" value={s.value ?? ''} onChange={e => updateSetting(s.key, e.target.value)}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
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
