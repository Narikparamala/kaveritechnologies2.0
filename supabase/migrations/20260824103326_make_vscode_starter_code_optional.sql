alter table public.coding_vscode_assignments
  alter column starter_code drop not null,
  alter column starter_code set default '';
;
