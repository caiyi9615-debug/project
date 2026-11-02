'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const A=require('../advisor'),D=require('../public/domain');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:18805',out=process.env.TEST_EVIDENCE||path.join(require('node:os').tmpdir(),'dh-light-qa');
fs.mkdirSync(out,{recursive:true});const checks=[],pass=x=>{checks.push(x);console.log('PASS '+x);};
const model={summary:'完成作品整理与检查',steps:[{title:'梳理已有资料',description:'核对已有资料，列出缺项',minutes:25},{title:'完成作品检查',description:'检查要求，记录还需修改的内容',minutes:20}],assumptions:['时长为估计，具体完成范围需核对'],refinedRules:{}};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-31T09:00:00+08:00')});
 await page.goto(base+'/#tasks');await page.locator('#app h1').waitFor();assert.match(await page.title(),/2\.5\.0/);
 await page.evaluate(tasks=>CampusStore.write({version:2,tasks,sources:[],changes:[],history:[],theme:'light'}),[
 D.cleanTask({id:'one',title:'课程作品',description:'整理已有资料，完成作品检查',dueDate:'2026-11-12',dateConfirmed:true,deadlineKind:'date',executionStatus:'unsubmitted'}),
 D.cleanTask({id:'two',title:'大学物理复习',description:'复习五章课程',executionStatus:'unsubmitted'}),
 D.cleanTask({id:'three',title:'第三项任务',description:'准备展示资料',dueDate:'2026-11-13',dateConfirmed:true,executionStatus:'unsubmitted'})]);
 await page.reload();await page.locator('[data-task-id=one]').waitFor();pass('新版身份与本地任务正常显示');
 let calls=[],mode='ok';await page.route('**/api/advisor',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(mode==='slow')await new Promise(r=>setTimeout(r,600));
  if(mode==='fail'){await route.fulfill({status:503,json:{error:'模拟服务不可用'}});return;}
  let result;
  if(body.stage==='questions')result=A.interview({summary:'了解作品',questions:[{question:'已有资料是什么？'},{question:'有哪些必要交付？'}]});
  else if(mode==='clarify'){result={needsClarification:true,summary:'只需确认复习范围',questions:[{question:'具体复习哪些章节？'}]};mode='ok';}
  else result=A.draft(model,A.context(body),A.constraints(body.constraints,A.context(body)),body.answers);
  try{await route.fulfill({status:200,json:{ok:true,result}});}catch{}
 });
 const state=()=>page.evaluate(()=>CampusStore.read()),open=async id=>{const row=page.locator(`[data-task-id=${id}]`),button=row.locator('[data-advisor-open]');if(!await button.isVisible())await row.locator('.row-more>summary').click();await button.click();};
 const submit=()=>page.locator('#advisorAnswers [type=submit]').click();
 const close=()=>page.locator('[data-advisor-action=close]').click();
 await open('one');assert.equal(await page.locator('#advisorAnswers').count(),1);assert.equal(await page.locator('[data-advisor-answer]').count(),0);assert.equal(calls.length,0);
 assert.equal(await page.locator('[name=endDate]').inputValue(),'2026-11-12');assert.equal(await page.locator('[name=dailyMinutes]').inputValue(),'45');assert.equal(await page.locator('.advisor-advanced').evaluate(el=>el.open),false);
 await page.screenshot({path:path.join(out,'draft-first-desktop.png')});pass('已有任务直接带入，默认不访谈、不请求AI、不显示长问卷');
 await page.locator('[name=dailyMinutes]').fill('60');await page.locator('#weekendsOff').uncheck();await page.locator('.advisor-advanced>summary').click();await page.locator('[name=workday][value="0"]').uncheck();await page.locator('[name=style]').selectOption('early');await page.locator('.advisor-advanced>summary').click();
 mode='fail';await submit();await page.getByText('模拟服务不可用',{exact:true}).waitFor();assert.equal(await page.locator('[name=dailyMinutes]').inputValue(),'60');assert.equal((await state()).tasks[0].plan,null);pass('AI失败保留输入，任务未产生半份计划');
 mode='ok';await submit();await page.locator('#advisorReport').waitFor();assert.deepEqual(calls.at(-1).answers,[]);assert.equal(calls.filter(x=>x.stage==='questions').length,0);assert.equal(await page.locator('[data-advice-item]').count(),2);assert.match(await page.locator('.advisor-assumptions').innerText(),/估计/);await page.screenshot({path:path.join(out,'draft-result.png')});pass('无需回答问题即可拆解排期，假设与估时直接展示');
 await page.evaluate(()=>{window.writer=CampusStore.write;CampusStore.write=async()=>{throw new Error('模拟空间不足');};});await page.locator('[data-advisor-action=save-plan]').click();await page.getByText('模拟空间不足',{exact:true}).waitFor();assert.equal((await state()).advisorPreferences,undefined);assert.equal((await state()).tasks[0].plan,null);await page.evaluate(()=>CampusStore.write=writer);pass('任务与偏好原子保存，失败不写入偏好');
 await page.locator('[data-advisor-action=save-plan]').click();await page.locator('#advisorDialog').waitFor({state:'hidden'});let s=await state();assert.equal(s.advisorPreferences.dailyMinutes,60);assert.deepEqual(s.plannerPreferences.excludedWeekdays,[0]);assert.equal(s.plannerPreferences.style,'early');assert.equal(s.plannerPreferences.endDate,'');assert.equal(s.tasks[0].dueDate,'2026-11-12');assert.equal(s.tasks[0].executionStatus,'unsubmitted');pass('确认后保存任务和个人习惯，保持真实截止与提交状态');
 await page.reload();await open('two');assert.equal(await page.locator('[name=dailyMinutes]').inputValue(),'60');assert.equal(await page.locator('[name=endDate]').inputValue(),'');assert.equal(await page.locator('#weekendsOff').isChecked(),false);assert.equal(await page.locator('[name=style]').inputValue(),'early');pass('刷新后习惯自动复用，未知截止不沿用上个任务日期');
 const before=calls.length;await submit();assert.equal(calls.length,before);await page.locator('[data-advisor-action=week]').click();assert.equal(await page.locator('[name=endDate]').inputValue(),'2026-11-06');mode='clarify';await submit();await page.locator('[data-advisor-answer="0"]').waitFor();assert.equal(await page.locator('[data-advisor-answer]').count(),1);assert.equal(await page.locator('[name=dailyMinutes]').inputValue(),'60');await page.locator('[data-advisor-answer="0"]').fill('第一至第五章，已有教材');await submit();await page.locator('#advisorReport').waitFor();assert.match(calls.at(-1).answers[0].answer,/第五章/);pass('计划范围需明确选择，只在模型缺少关键事实时补问，保留输入');
 await page.locator('[data-advisor-action=back-answers]').click();await page.locator('[name=remember]').uncheck();await page.locator('[name=dailyMinutes]').fill('75');await submit();await page.locator('[data-advisor-action=save-plan]').click();await page.locator('#advisorDialog').waitFor({state:'hidden'});s=await state();assert.equal(s.tasks[1].dueDate,'');assert.equal(s.tasks[1].dueAt,'');assert.equal(s.advisorPreferences.dailyMinutes,60);pass('七天计划不伪装成截止；取消记住习惯后不覆盖偏好');
 await open('three');await page.locator('[name=dailyMinutes]').fill('15');await page.locator('[name=dailyMinutes]').dispatchEvent('change');assert.equal(await page.locator('[name=focusMinutes]').inputValue(),'15');await close();pass('减少每日时间时同步缩短分段，不出现隐藏的时长冲突');
 await open('three');await page.locator('.advisor-advanced>summary').click();for(let n=0;n<7;n++)await page.locator(`[name=workday][value="${n}"]`).uncheck();await submit();assert.match(await page.locator('#advisorError').innerText(),/至少选择/);await close();pass('全休息明确提示，不能自动占用休息日');
 await open('three');mode='slow';await submit();await close();await page.waitForTimeout(800);assert.equal((await state()).tasks[2].plan,null);assert.equal(await page.locator('#advisorDialog').isVisible(),false);mode='ok';pass('关闭中止请求，迟到草案不保存、不重新弹窗');
 await open('three');await submit();await page.locator('#advisorReport').waitFor();await page.evaluate(()=>mutate(s=>{s.tasks.find(x=>x.id==='three').updatedAt='2030-01-01T00:00:00Z';}));await page.locator('[data-advisor-action=save-plan]').click();await page.getByText('任务已改变，请重新安排，避免覆盖现有进度。',{exact:true}).waitFor();await close();pass('任务在其他操作中改变后，拒绝保存过时草案');
 await page.locator('[data-advisor-new]').click();await page.locator('#advisorAnswers [name=title]').fill('准备课程展示');await page.locator('[data-advisor-action=week]').click();await submit();await page.locator('#advisorReport').waitFor();await page.locator('[data-advisor-action=save-plan]').click();await page.locator('#advisorDialog').waitFor({state:'hidden'});s=await state();assert.equal(s.tasks.length,4);assert.equal(s.tasks[3].dueDate,'');assert.ok(s.tasks[3].plan);pass('新任务只填目标也可草拟计划，一次确认创建主任务与安排');
 await open('three');await page.locator('[data-manual-fallback]>summary').click();await page.locator('[data-advisor-action=interview]').click();await page.locator('#advisorProject [type=submit]').click();await page.locator('[data-advisor-answer]').first().waitFor();assert.equal(calls.at(-1).stage,'questions');await close();pass('用户主动选择时仍可先访谈，保留原有详细安排能力');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await open('three');assert.equal(await page.locator('#advisorDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);const foot=await page.locator('#advisorDialog .dialog-foot').boundingBox();assert.ok(foot.y+foot.height<=845);await page.screenshot({path:path.join(out,'draft-first-mobile.png')});await close();pass('手机单列输入、底部操作可见，无横向溢出');
 await page.locator('.topbar [data-action=theme]').click();await open('three');await page.screenshot({path:path.join(out,'draft-first-dark.png')});await close();assert.deepEqual(errors,[]);pass('深色主题及全程无页面运行异常');
 await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
