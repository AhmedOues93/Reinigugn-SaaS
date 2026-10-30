-- Eine Bestandsaufnahme des Schemas, Zeile fuer Zeile vergleichbar.
--
-- Sie laeuft gegen jede Datenbank -- leer, teilweise migriert oder
-- Production -- und aendert nichts. Damit laesst sich die Frage "was fehlt
-- dort?" beantworten, ohne sie zu raten: einmal gegen eine Datenbank mit der
-- vollen Historie, einmal gegen das Ziel, und die Differenz ist die Antwort.
--
-- Bewusst nicht enthalten: Zeilen, Besitzer, Kommentare, OIDs. Sie
-- unterscheiden sich zwischen zwei Datenbanken immer und wuerden die Differenz
-- unlesbar machen.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset fieldsep '  '

select line from (
  select 'table      ' || c.relname as line
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')

  union all
  select 'column     ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' not null' else '' end
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped

  union all
  select 'enum       ' || t.typname || ' = ' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname

  union all
  select 'function   ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         || case p.prosecdef when true then ' security definer' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'

  union all
  select 'grant      ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> ' || grantee
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join unnest(array['anon', 'authenticated']) as grantee
  where n.nspname = 'public'
    and has_function_privilege(grantee, p.oid, 'execute')

  union all
  select 'tablegrant ' || c.relname || ' -> ' || grantee || ' ' || privilege
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['anon', 'authenticated']) as grantee
  cross join unnest(array['select', 'insert', 'update', 'delete']) as privilege
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and has_table_privilege(grantee, c.oid, privilege)

  union all
  select 'rls        ' || c.relname || case when c.relrowsecurity then ' enabled' else ' DISABLED' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')

  union all
  select 'policy     ' || c.relname || ' / ' || pol.polname || ' ' || pol.polcmd::text
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all
  select 'trigger    ' || c.relname || ' / ' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all
  select 'index      ' || c.relname || ' / ' || i.relname
  from pg_index x
  join pg_class c on c.oid = x.indrelid
  join pg_class i on i.oid = x.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all
  select 'constraint ' || c.relname || ' / ' || con.conname || ' ' || con.contype::text
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
) inventory
order by line;
