interface FieldProps {
  label: string;
  value?: string | null | boolean;
}

export function Field({ label, value }: FieldProps) {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{display}</dd>
    </div>
  );
}
