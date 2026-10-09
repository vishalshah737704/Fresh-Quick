-- 41: customer registration approval. Existing rows default to 'approved'; only the
-- customer sign-up route writes 'pending'. The Auth ban (set by the app) is what blocks login.
alter table public.users
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.users(id) on delete set null,
  add constraint users_rejected_has_reason
    check ((approval_status = 'rejected') = (rejection_reason is not null));

create index users_pending_registrations_idx
  on public.users (created_at) where approval_status = 'pending';

create function public.registration_state_by_email(p_email text)
returns table (user_id uuid, role text, approval_status text)
language sql security definer set search_path = '' stable
as $$
  select u.id, u.role, u.approval_status
  from auth.users au
  join public.users u on u.id = au.id
  where lower(au.email) = lower(p_email)
  limit 1
$$;

create function public.decide_registration(
  p_user_id uuid, p_decision text, p_reason text, p_admin uuid
)
returns table (user_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision %', p_decision;
  end if;
  return query
  update public.users u
  set approval_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then p_reason else null end,
      reviewed_at = now(),
      reviewed_by = p_admin
  where u.id = p_user_id and u.role = 'customer' and u.approval_status = 'pending'
  returning u.id;
end;
$$;

create function public.registration_requests(p_view text)
returns table (
  user_id uuid, email text, full_name text, phone text, line1 text, city text,
  pincode text, created_at timestamptz, approval_status text,
  rejection_reason text, reviewed_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select u.id, au.email::text, u.full_name, u.phone, a.line1, a.city, a.pincode,
         u.created_at, u.approval_status, u.rejection_reason, u.reviewed_at
  from public.users u
  join auth.users au on au.id = u.id
  left join lateral (
    select ad.line1, ad.city, ad.pincode from public.addresses ad
    where ad.user_id = u.id and ad.is_default
    order by ad.created_at desc limit 1
  ) a on true
  where u.role = 'customer'
    and case
      when p_view = 'pending' then u.approval_status = 'pending'
      else u.approval_status in ('approved', 'rejected') and u.reviewed_at is not null
    end
  order by case when p_view = 'pending' then u.created_at end asc,
           u.reviewed_at desc nulls last
  limit 200
$$;

create function public.registration_email_context(p_user_id uuid)
returns table (
  email text, full_name text, phone text, line1 text, line2 text, city text,
  state text, pincode text, approval_status text, rejection_reason text
)
language sql security definer set search_path = '' stable
as $$
  select au.email::text, u.full_name, u.phone, a.line1, a.line2, a.city, a.state,
         a.pincode, u.approval_status, u.rejection_reason
  from public.users u
  join auth.users au on au.id = u.id
  left join lateral (
    select ad.line1, ad.line2, ad.city, ad.state, ad.pincode from public.addresses ad
    where ad.user_id = u.id and ad.is_default
    order by ad.created_at desc limit 1
  ) a on true
  where u.id = p_user_id and u.role = 'customer'
$$;

create function public.registration_admin_emails()
returns setof text
language sql security definer set search_path = '' stable
as $$
  select au.email::text
  from public.users u join auth.users au on au.id = u.id
  where u.role = 'admin' and au.email is not null
$$;

revoke all on function public.registration_state_by_email(text) from public, anon, authenticated;
revoke all on function public.decide_registration(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.registration_requests(text) from public, anon, authenticated;
revoke all on function public.registration_email_context(uuid) from public, anon, authenticated;
revoke all on function public.registration_admin_emails() from public, anon, authenticated;
grant execute on function public.registration_state_by_email(text) to service_role;
grant execute on function public.decide_registration(uuid, text, text, uuid) to service_role;
grant execute on function public.registration_requests(text) to service_role;
grant execute on function public.registration_email_context(uuid) to service_role;
grant execute on function public.registration_admin_emails() to service_role;

create trigger n8n_registration_submitted
  after insert on public.users
  for each row
  when (new.approval_status = 'pending')
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/registration-event');

create trigger n8n_registration_decided
  after update of approval_status on public.users
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/registration-event');
