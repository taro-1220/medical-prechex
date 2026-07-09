-- clinic_users_select (004_clinic_users_rls.sql) is self-referential:
-- it subqueries clinic_users from within a policy defined on clinic_users,
-- causing "infinite recursion detected in policy for relation clinic_users" (42P17).
--
-- Fix: move the membership check into a SECURITY DEFINER function. Functions
-- created here run as their owner (the migration role, which owns the table
-- and bypasses RLS), so the lookup inside the function does not re-trigger
-- clinic_users RLS policies.

create or replace function public.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from clinic_users
    where clinic_id = target_clinic_id
      and user_id = auth.uid()
  );
$$;

drop policy if exists "clinic_users_select" on clinic_users;

create policy "clinic_users_select" on clinic_users for select
  using (public.is_clinic_member(clinic_id));
