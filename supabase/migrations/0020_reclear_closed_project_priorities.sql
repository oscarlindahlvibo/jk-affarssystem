-- 0019 kunde på en redan driftsatt databas aktivera den äldre triggern under
-- datarensningen. Kör rensningen igen efter att den nya triggern är installerad.

update projects
set priority = null,
    priority_is_manual = false
where status in ('Levererad', 'Avbokad', 'Fakturerad')
  and priority is not null;
