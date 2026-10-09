-- Checks migration 41 (registration approval). One transaction, rolled back.
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/registration_approval.sql
begin;

do $$
declare
  cust uuid := gen_random_uuid();
  cust2 uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  st text;
  n integer;
  admin_list text[];
  reason_back text;
  reviewer uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (cust, 'Reg-Cust@Example.invalid', 'authenticated', 'authenticated'),
    (cust2, 'reg-cust2@example.invalid', 'authenticated', 'authenticated'),
    (adm, 'reg-admin@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, role, full_name) values
    (cust, 'customer', 'Reg Cust'), (cust2, 'customer', 'Reg Cust2'), (adm, 'admin', 'Reg Admin');

  -- 1. default is approved, so existing and staff accounts are unaffected
  select approval_status into st from public.users where id = cust;
  if st <> 'approved' then raise exception 'default should be approved, got %', st; end if;

  -- 2. lookup by email ignores case and surrounding spaces are the caller's job (trimmed in app)
  select approval_status into st from public.registration_state_by_email('reg-cust@EXAMPLE.invalid');
  if st is distinct from 'approved' then raise exception 'case-insensitive lookup failed, got %', st; end if;
  select count(*) into n from public.registration_state_by_email('nobody@example.invalid');
  if n <> 0 then raise exception 'unknown email should return no row'; end if;

  -- 3. approve a pending customer once; the second decision gets nothing (concurrency guard)
  update public.users set approval_status = 'pending' where id = cust;
  select count(*) into n from public.decide_registration(cust, 'approved', null, adm);
  if n <> 1 then raise exception 'first decision should win, got %', n; end if;
  select count(*) into n from public.decide_registration(cust, 'rejected', 'too late', adm);
  if n <> 0 then raise exception 'second decision must return no rows, got %', n; end if;
  select approval_status into st from public.users where id = cust;
  if st <> 'approved' then raise exception 'status should stay approved, got %', st; end if;

  -- 4. reject stores the reason and the reviewer
  update public.users set approval_status = 'pending' where id = cust2;
  select count(*) into n from public.decide_registration(cust2, 'rejected', 'Address unclear', adm);
  if n <> 1 then raise exception 'reject should win, got %', n; end if;
  select rejection_reason, reviewed_by into reason_back, reviewer from public.users where id = cust2;
  if reason_back <> 'Address unclear' or reviewer <> adm then raise exception 'reason or reviewer not stored'; end if;

  -- 5. a rejected row must carry a reason, and a reason may not exceed 500 characters
  begin
    update public.users set approval_status = 'rejected', rejection_reason = null where id = cust;
    raise exception 'rejected without a reason should have failed';
  exception when check_violation then null;
  end;
  begin
    update public.users set approval_status = 'rejected', rejection_reason = repeat('x', 501) where id = cust;
    raise exception '501-character reason should have failed';
  exception when check_violation then null;
  end;

  -- 6. only customers can be decided
  update public.users set approval_status = 'pending' where id = adm;
  select count(*) into n from public.decide_registration(adm, 'approved', null, adm);
  if n <> 0 then raise exception 'a non-customer must not be decided'; end if;
  update public.users set approval_status = 'approved' where id = adm;

  -- 7. a rejected customer can go back to pending (re-register) and the reason clears
  update public.users
    set approval_status = 'pending', rejection_reason = null, reviewed_at = null, reviewed_by = null
    where id = cust2;

  -- 8. lists: cust2 is pending; cust is in history
  select count(*) into n from public.registration_requests('pending') where user_id = cust2;
  if n <> 1 then raise exception 'cust2 should be listed as pending'; end if;
  select count(*) into n from public.registration_requests('history') where user_id = cust;
  if n <> 1 then raise exception 'cust should be listed in history'; end if;
  select count(*) into n from public.registration_requests('pending') where user_id = cust;
  if n <> 0 then raise exception 'cust must not be pending'; end if;

  -- 9. email context and admin emails
  select count(*) into n from public.registration_email_context(cust2) where email = 'reg-cust2@example.invalid';
  if n <> 1 then raise exception 'email context missing'; end if;
  select array_agg(e) into admin_list from public.registration_admin_emails() as e;
  if not ('reg-admin@example.invalid' = any(admin_list)) then raise exception 'admin email missing'; end if;

  -- 10. triggers exist
  select count(*) into n from pg_trigger
    where tgname in ('n8n_registration_submitted', 'n8n_registration_decided') and not tgisinternal;
  if n <> 2 then raise exception 'expected 2 registration triggers, got %', n; end if;
end $$;

rollback;
