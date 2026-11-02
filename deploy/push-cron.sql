-- 先在 Supabase Integrations 启用 Cron（pg_cron）与 pg_net 扩展。
-- 先在 Vault 界面创建两个秘密：
-- dh_push_tick_url = https://你的Render网址/api/push/tick
-- dh_push_cron_secret = 与 Render PUSH_CRON_SECRET 完全相同的随机值。
-- 真实秘密不要写入这个文件或提交 GitHub。
-- 本脚本只执行一次；调整已有任务应在 Cron 界面编辑，避免创建重复任务。
select cron.schedule('deadline-hunter-push','*/5 * * * *', $$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='dh_push_tick_url' limit 1),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='dh_push_cron_secret' limit 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$$);
