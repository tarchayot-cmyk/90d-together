-- ============================================================
-- Storage bucket for badge icon images — admin uploads directly
-- from the browser instead of needing to host images elsewhere
-- and paste a URL. Public read (icons need to display to everyone),
-- admin-only write.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('badge-icons', 'badge-icons', true)
on conflict (id) do nothing;

create policy "badge_icon_read_public" on storage.objects
for select using (bucket_id = 'badge-icons');

create policy "badge_icon_write_admin" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'badge-icons'
  and exists (select 1 from members where auth_user_id = auth.uid() and role in ('admin', 'super_admin'))
);

create policy "badge_icon_update_admin" on storage.objects
for update to authenticated
using (
  bucket_id = 'badge-icons'
  and exists (select 1 from members where auth_user_id = auth.uid() and role in ('admin', 'super_admin'))
);

create policy "badge_icon_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'badge-icons'
  and exists (select 1 from members where auth_user_id = auth.uid() and role in ('admin', 'super_admin'))
);
