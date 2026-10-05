create table if not exists task_notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  assignee_id uuid not null references profiles (id) on delete cascade,
  recipient_email text not null,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'failed')),
  external_message_id text,
  error_message text
);

create index if not exists idx_task_notification_dispatches_task
  on task_notification_dispatches (task_id, sent_at desc);

alter table task_notification_dispatches enable row level security;

-- Tabellen skrivs och läses bara av den skyddade Edge Functionen med service role.
