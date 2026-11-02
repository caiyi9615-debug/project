-- 在你自己的 Supabase SQL Editor 中执行。无真实密钥。
create table if not exists public.dh_push_devices (
 token_hash text primary key,
 subscription jsonb not null,
 expires_at timestamptz not null default now()+interval '30 days'
);
create table if not exists public.dh_push_jobs (
 id text primary key,
 device text not null references public.dh_push_devices(token_hash) on delete cascade,
 task_id text not null, title text not null,
 due_at timestamptz not null, due_local text not null,
 scheduled_at timestamptz not null, minutes integer not null,
 sent_at timestamptz, claim_id uuid, lease_until timestamptz
);
create index if not exists dh_push_jobs_device_idx on public.dh_push_jobs(device);
create index if not exists dh_push_jobs_pending_idx on public.dh_push_jobs(scheduled_at) where sent_at is null;
alter table public.dh_push_devices enable row level security;
alter table public.dh_push_jobs enable row level security;
-- 浏览器不能直接读写推送表；只有后端 service_role 使用这些函数。
revoke all on public.dh_push_devices,public.dh_push_jobs from anon,authenticated;
grant all on public.dh_push_devices,public.dh_push_jobs to service_role;

create or replace function public.dh_push_register(p_device text,p_subscription jsonb)
returns void language sql set search_path=public as $$
 insert into dh_push_devices(token_hash,subscription) values(p_device,p_subscription)
 on conflict(token_hash) do update set subscription=excluded.subscription,expires_at=now()+interval '30 days';
$$;
create or replace function public.dh_push_sync(p_device text,p_jobs jsonb)
returns integer language plpgsql set search_path=public as $$
declare total integer;
begin
 if jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>1000 then raise exception 'invalid jobs'; end if;
 perform 1 from dh_push_devices where token_hash=p_device for update;
 if not found then raise exception 'unknown device'; end if;
 update dh_push_devices set expires_at=now()+interval '30 days' where token_hash=p_device;
 -- 完整快照取消旧任务、已完成任务和旧截止时刻的提醒。
 delete from dh_push_jobs j where j.device=p_device
 and not exists(select 1 from jsonb_array_elements(p_jobs) x where x->>'id'=j.id);
 insert into dh_push_jobs(id,device,task_id,title,due_at,due_local,scheduled_at,minutes)
 select x->>'id',p_device,x->>'task_id',x->>'title',(x->>'due_at')::timestamptz,x->>'due_local',(x->>'scheduled_at')::timestamptz,(x->>'minutes')::integer
 from jsonb_array_elements(p_jobs) x
 where (x->>'scheduled_at')::timestamptz>=now()
 or exists(select 1 from dh_push_jobs j where j.id=x->>'id' and j.device=p_device)
 on conflict(id) do update set title=excluded.title;
 -- 不重置 sent_at，反复同步不会重新发送同一阶段。
 select count(*) into total from dh_push_jobs where device=p_device and sent_at is null;
 return total;
end $$;
create or replace function public.dh_push_device(p_device text)
returns jsonb language sql set search_path=public as $$
 select jsonb_build_object('subscription',subscription) from dh_push_devices where token_hash=p_device and expires_at>now();
$$;
create or replace function public.dh_push_remove(p_device text)
returns void language sql set search_path=public as $$ delete from dh_push_devices where token_hash=p_device; $$;
create or replace function public.dh_push_claim()
returns setof public.dh_push_jobs language plpgsql set search_path=public as $$
begin
 delete from dh_push_devices where expires_at<now();
 delete from dh_push_jobs where due_at<now()-interval '1 day';
 return query
 update dh_push_jobs j set claim_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where j.id in (
  select q.id from dh_push_jobs q
  where q.sent_at is null and (q.lease_until is null or q.lease_until<now())
   and q.scheduled_at<=now() and q.scheduled_at>=now()-interval '15 minutes' and q.due_at>now()
  order by q.scheduled_at limit 20 for update skip locked
 ) returning j.*;
end $$;
create or replace function public.dh_push_delivery(p_job text,p_claim uuid)
returns jsonb language sql set search_path=public as $$
 select jsonb_build_object('subscription',d.subscription) from dh_push_jobs j
 join dh_push_devices d on d.token_hash=j.device
 where j.id=p_job and j.claim_id=p_claim and j.sent_at is null and d.expires_at>now();
$$;
create or replace function public.dh_push_finish(p_job text,p_claim uuid,p_sent boolean,p_expired boolean)
returns void language plpgsql set search_path=public as $$
begin
 if p_expired then
  delete from dh_push_devices where token_hash in(select device from dh_push_jobs where id=p_job and claim_id=p_claim);
 else
  update dh_push_jobs set sent_at=case when p_sent then now() else sent_at end,
   lease_until=case when p_sent then null else now()+interval '4 minutes' end
  where id=p_job and claim_id=p_claim;
 end if;
end $$;
revoke all on function public.dh_push_register(text,jsonb),public.dh_push_sync(text,jsonb),public.dh_push_device(text),public.dh_push_remove(text),public.dh_push_claim(),public.dh_push_delivery(text,uuid),public.dh_push_finish(text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.dh_push_register(text,jsonb),public.dh_push_sync(text,jsonb),public.dh_push_device(text),public.dh_push_remove(text),public.dh_push_claim(),public.dh_push_delivery(text,uuid),public.dh_push_finish(text,uuid,boolean,boolean) to service_role;
