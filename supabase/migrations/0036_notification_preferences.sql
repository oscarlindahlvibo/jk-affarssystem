-- Admin kan stänga av push och e-post per person. Notiserna hamnar alltid i listan under klockan i appen.
alter table profiles
  add column if not exists notify_push boolean not null default true,
  add column if not exists notify_email boolean not null default true;
