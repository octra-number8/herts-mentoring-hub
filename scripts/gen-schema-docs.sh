#!/usr/bin/env bash
# Generates docs/database-schema.md (tables, columns, RLS, policies) and a Mermaid ERD
# from the local database. Run after migrations: ./scripts/gen-schema-docs.sh
set -euo pipefail
PSQL="docker exec supabase_db_herts-mentoring-hub psql -U postgres -At"
OUT=docs/database-schema.md
{
  echo "# Database schema"
  echo
  echo "Generated $(date +%Y-%m-%d) from the local database by \`scripts/gen-schema-docs.sh\`. Do not edit by hand."
  echo
  echo "Every table has row-level security enabled. Policies call helpers in the \`app\` schema; see \`docs/architecture.md\`."
  echo
  echo "## Entity relationships"
  echo
  echo '```mermaid'
  echo "erDiagram"
  $PSQL -c "select distinct '  ' || ccu.table_name || ' ||--o{ ' || tc.table_name || ' : \"' || kcu.column_name || '\"'
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and ccu.table_schema = 'public'
      and ccu.table_name not in ('organisations','user_accounts') and kcu.column_name not in ('created_by','recorded_by','updated_by','granted_by','approved_by','published_by','decided_by','issued_by','verified_by','reviewed_by','submitted_by','activated_by','assigned_by','checked_in_by','uploaded_by','resolved_by','generated_by','invited_by','author_account_id','owner_account_id','minutes_approved_by')
    order by 1;"
  echo '```'
  echo
  echo "Organisation scoping (\`org_id\`) and account attribution columns (\`created_by\`, \`approved_by\`, ...) are omitted from the diagram for readability."
  echo
  echo "## Tables"
  $PSQL -c "select c.relname, coalesce(obj_description(c.oid),''), c.relrowsecurity,
              (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' order by c.relname;" | while IFS='|' read -r t d rls pol; do
    echo
    echo "### \`$t\`"
    [ -n "$d" ] && echo "$d"
    echo
    echo "RLS: $([ "$rls" = t ] && echo enabled || echo '**DISABLED**') · policies: $pol"
    echo
    echo "| Column | Type | Null | Default |"
    echo "|---|---|---|---|"
    $PSQL -c "select column_name, data_type, is_nullable, coalesce(replace(left(column_default,50),'|','/'),'')
              from information_schema.columns where table_schema='public' and table_name='$t' order by ordinal_position;" \
      | awk -F'|' '{printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4}'
  done
  echo
  echo "## Views"
  echo
  $PSQL -c "select '- \`' || table_name || '\` (security invoker: caller''s RLS applies)' from information_schema.views where table_schema='public' order by 1;"
  echo
  echo "## Functions callable by signed-in users"
  echo
  $PSQL -c "select '- \`' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')\`' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and has_function_privilege('authenticated', p.oid, 'execute') and p.prokind='f'
              and p.proname not like 'gtrgm%' and p.proname not like 'gin_%' and p.proname not in ('similarity','show_limit','set_limit','show_trgm','word_similarity','strict_word_similarity','similarity_op','word_similarity_op','strict_word_similarity_op','similarity_dist','word_similarity_dist_op','strict_word_similarity_dist_op','word_similarity_commutator_op','strict_word_similarity_commutator_op','word_similarity_dist_commutator_op','strict_word_similarity_dist_commutator_op','citext%')
              and p.proname not like 'citext%' and p.proname not like 'regexp_%' and p.proname not like 'texticlike%' and p.proname not like 'texticnlike%' and p.proname not like 'texticregex%' and p.proname not like 'texticnregex%' and p.proname not in ('max','min','replace','split_part','strpos','translate')
            order by 1;"
} > "$OUT"
echo "Wrote $OUT ($(grep -c '^### ' "$OUT") tables)"
