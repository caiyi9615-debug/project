(function(root){
 'use strict';
 const T=typeof module!=='undefined'&&module.exports?require('./time'):root.DHTime;
 const F=typeof module!=='undefined'&&module.exports?require('./fidelity'):root.DHFidelity;
 const styles={steady:'细水长流',burst:'集中推进',early:'提前完成',custom:'自定义'};
 const int=(v,min,max,fallback)=>Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fallback;
 const uid=()=>globalThis.crypto.randomUUID();
 const dayMs=s=>Date.parse(s+'T00:00:00Z');
 const add=(s,n)=>new Date(dayMs(s)+n*86400000).toISOString().slice(0,10);
 const weekday=s=>new Date(dayMs(s)).getUTCDay();
 function advisorDefaults(task={},state={},today=T.today()){
  const pref=state.advisorPreferences||{},r=rules(state.plannerPreferences||{}),dailyMinutes=int(pref.dailyMinutes,15,720,45);
  return {...r,startDate:today,endDate:(task.dueAt||task.dueDate||'').slice(0,10),dailyMinutes,
   focusMinutes:Math.min(dailyMinutes,int(pref.focusMinutes,15,120,30)),bufferDays:state.plannerPreferences?r.bufferDays:0};
 }
 function rules(v={}){
  return {startDate:T.dateOnly(v.startDate)||'',endDate:T.dateOnly(v.endDate)||'',style:Object.hasOwn(styles,v.style)?v.style:'steady',
   maxPerDay:int(v.maxPerDay,1,100,1),bufferDays:int(v.bufferDays,0,90,1),
   excludedWeekdays:Array.isArray(v.excludedWeekdays)?[...new Set(v.excludedWeekdays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))]:[0,6],
   excludedDates:Array.isArray(v.excludedDates)?[...new Set(v.excludedDates.map(T.dateOnly).filter(Boolean))].slice(0,730):[]};
 }
 function clean(v,{strict=false}={}){
  if(v==null)return null;
  const invalid=()=>{if(strict)throw new Error('大任务计划数据无效，请检查子任务与日期。');return null;};
  if(typeof v!=='object'||!Array.isArray(v.items)||!v.items.length||v.items.length>500)return invalid();
  const ids=new Set(),items=[];
  for(const x of v.items){
   if(!x||typeof x.title!=='string'||!x.title.trim()||(x.date&&!T.dateOnly(x.date)))return invalid();
   const id=typeof x.id==='string'&&x.id.length<=100?x.id:uid();if(ids.has(id))return invalid();ids.add(id);
   items.push({id,title:x.title.trim().slice(0,200),description:String(x.description||'').slice(0,1200),phase:String(x.phase||'').slice(0,100),minutes:int(x.minutes,0,120,0),minutesOrigin:['ai','user','default'].includes(x.minutesOrigin)?x.minutesOrigin:'',date:T.dateOnly(x.date)||'',done:x.done===true,locked:x.locked===true,completedAt:typeof x.completedAt==='string'?x.completedAt:'',snapshot:x.snapshot===true});
  }
  const g=v.guidance&&typeof v.guidance==='object'?v.guidance:null;
  const guidance=g?{summary:String(g.summary||'').slice(0,1500),reasoning:String(g.reasoning||'').slice(0,1500),answers:Array.isArray(g.answers)?g.answers.slice(0,5).map(a=>({question:String(a.question||'').slice(0,300),answer:String(a.answer||'').slice(0,2000)})):[],assumptions:Array.isArray(g.assumptions)?g.assumptions.slice(0,12).map(x=>String(x).slice(0,500)):[],estimatedMinutes:int(g.estimatedMinutes,0,100000,0),dailyMinutes:int(g.dailyMinutes,0,720,0),focusMinutes:int(g.focusMinutes,0,120,0),source:String(g.source||'AI建议，须核对').slice(0,200),unitReview:g.unitReview?{issues:Array.isArray(g.unitReview.issues)?g.unitReview.issues.slice(0,20).map(x=>String(x).slice(0,500)):[],confirmed:g.unitReview.confirmed===true}:null}:null;
  return {version:1,mode:v.mode==='stages'?'stages':'quantity',unit:String(v.unit||'项').trim().slice(0,20)||'项',items,rules:rules(v.rules),guidance,
   deadlineSnapshot:String(v.deadlineSnapshot||'').slice(0,30),confirmed:v.confirmed===true,
   createdAt:typeof v.createdAt==='string'?v.createdAt:new Date().toISOString(),updatedAt:typeof v.updatedAt==='string'?v.updatedAt:new Date().toISOString()};
 }
 function suggestion(task){
  const declared=task.planSuggestion;
  if(declared&&int(declared.total,1,500,0))return {total:Number(declared.total),unit:String(declared.unit||'项').slice(0,20),completed:int(declared.completed,0,Number(declared.total),0),evidence:String(declared.evidence||'AI提取，需核对').slice(0,300)};
  const text=[task.title,task.description,task.evidence].filter(Boolean).join('\n');
  const snap=text.match(/(?:任务点进度|完成进度|已完成)\s*[:：]?\s*(\d+)\s*[\/／]\s*(\d+)/);
  if(snap&&+snap[2]<=500&&+snap[1]<=+snap[2])return {total:+snap[2],completed:+snap[1],unit:'个任务点',evidence:snap[0]};
  const quantityText=text.replace(/第\s*\d+\s*(?:章|节|篇|份|套|个任务点|个阶段)/g,'');
  const number=quantityText.match(/(?:共|完成|提交|交|学习|做|阅读|复习)?\s*(\d{1,3})\s*(篇报告|份报告|章|节|套试卷|套题|套|篇|份|个任务点|个阶段)/);
  return number&&+number[1]>0&&+number[1]<=500?{total:+number[1],completed:0,unit:number[2],evidence:number[0].trim()}:null;
 }
 function makeItems({total,unit='项',stageNames=[],completed=0,snapshotConfirmed=false,existing=null}){
  const old=clean(existing),names=Array.isArray(stageNames)?stageNames.map(s=>String(s).trim()).filter(Boolean):[];
  const n=names.length||Number(total);
  if(!Number.isInteger(n)||n<1||n>500)throw new Error('子任务总数须为1～500；阶段名称每行一个。');
  if(old){
   const items=structuredClone(old.items);
   if(n<items.filter(x=>x.done).length)throw new Error('总量不能少于已完成数量；不会删除已完成记录。');
   for(let i=items.length-1;i>=0&&items.length>n;i--)if(!items[i].done)items.splice(i,1);
   while(items.length<n){const i=items.length;items.push({id:uid(),title:names[i]||`第${i+1}${unit}`,date:'',done:false,locked:false,completedAt:'',snapshot:false});}
   if(names.length)items.forEach((x,i)=>{if(!x.done)x.title=names[i];});
   return items;
  }
  if(!Number.isInteger(Number(completed))||completed<0||completed>n)throw new Error('已完成数量必须在0和总数之间。');
  if(completed>0&&!snapshotConfirmed)throw new Error('请先核实已完成数量；进度快照不代表已经识别了具体章节。');
  return Array.from({length:n},(_,i)=>({id:uid(),title:names[i]||`第${i+1}${unit}`,date:'',done:i<completed,locked:false,completedAt:'',snapshot:i<completed}));
 }
 function cutoff(plan){return plan.rules.endDate?add(plan.rules.endDate,-plan.rules.bufferDays):'';}
 function capacityAdvice(plan,today=T.today()){
  const r=plan.rules,end=cutoff(plan),start=r.startDate>today?r.startDate:today,dates=[];
  if(!T.dateOnly(start)||!T.dateOnly(end)||start>end)return null;
  for(let date=start;date<=end;date=add(date,1))if(allowed(date,r))dates.push(date);
  if(!dates.length)return null;
  const occupied=new Map();for(const x of plan.items)if((x.done||x.locked)&&dates.includes(x.date))occupied.set(x.date,(occupied.get(x.date)||0)+1);
  const pending=plan.items.filter(x=>!x.done&&!x.locked).length,capacity=dates.reduce((n,d)=>n+Math.max(0,r.maxPerDay-(occupied.get(d)||0)),0);
  if(pending<=capacity)return null;
  let requiredPerDay=r.maxPerDay;while(requiredPerDay<=100&&dates.reduce((n,d)=>n+Math.max(0,requiredPerDay-(occupied.get(d)||0)),0)<pending)requiredPerDay++;
  if(requiredPerDay>100)return null;
  const focus=plan.guidance?.focusMinutes||30;
  return {days:dates.length,capacity,remaining:pending-capacity,requiredPerDay,requiredDailyMinutes:requiredPerDay*focus,currentDailyMinutes:plan.guidance?.dailyMinutes||0};
 }
 function allowed(date,r){return !r.excludedWeekdays.includes(weekday(date))&&!r.excludedDates.includes(date);}
 function reviewUnits(plan,task={}){
  if(!plan.guidance)return {issues:[],confirmed:true};
  const issues=F.unitIssues([task.title,task.description,...(plan.guidance.answers||[]).map(a=>a.answer)].filter(Boolean).join('\n'),plan.items),review=plan.guidance.unitReview;
  return {issues,confirmed:!issues.length||review?.confirmed===true&&JSON.stringify(review.issues)===JSON.stringify(issues)};
 }
 function validate(plan,task={},today=T.today()){
  const errors=[],r=plan.rules,end=cutoff(plan),dates=new Map(),deadline=(task.dueAt||task.dueDate||'').slice(0,10);
  if(!r.startDate||!r.endDate)errors.push('请填写完整的计划开始日期和目标日期，不猜测缺失年份。');
  else if(r.startDate>end)errors.push('扣除检查缓冲后没有可安排日期，请调整日期或缓冲天数。');
  if(r.startDate&&r.endDate&&dayMs(r.endDate)-dayMs(r.startDate)>730*86400000)errors.push('单次计划范围最多两年，请按阶段拆分。');
  if(deadline&&r.endDate>deadline)errors.push('计划目标日期不能晚于任务现有截止日期；请先核实并编辑任务截止信息。');
  for(const x of plan.items){
   if(x.done){if(x.date)dates.set(x.date,(dates.get(x.date)||0)+1);continue;}
   if(!x.date){errors.push(`“${x.title}”尚未安排日期。`);continue;}
   if(x.date<today)errors.push(`“${x.title}”安排在已过去的日期，请重新安排剩余内容。`);
   if(x.date<r.startDate||x.date>end)errors.push(`“${x.title}”超出计划范围或占用检查缓冲。`);
   if(!allowed(x.date,r))errors.push(`“${x.title}”占用了休息日/排除日期，请调整。`);
   dates.set(x.date,(dates.get(x.date)||0)+1);
  }
  for(const [date,n] of dates)if(n>r.maxPerDay&&plan.items.some(x=>!x.done&&x.date===date))errors.push(`${date} 安排${n}项，超过每天${r.maxPerDay}项上限。`);
  if(plan.guidance?.dailyMinutes&&plan.guidance?.focusMinutes)for(const [date,n] of dates)if(plan.items.filter(x=>x.date===date).reduce((sum,x)=>sum+Math.max(x.minutes||plan.guidance.focusMinutes,plan.guidance.focusMinutes),0)>plan.guidance.dailyMinutes&&plan.items.some(x=>!x.done&&x.date===date))errors.push(`${date} 的分段预留超过已确认的每日${plan.guidance.dailyMinutes}分钟预算，请减少当天安排或明确修改时间预算。`);
  if(!reviewUnits(plan,task).confirmed)errors.push('计划数量与单位尚未核对，请修改或重新确认。');
  return [...new Set(errors)];
 }
 function generate({task={},items,rules:input,mode='quantity',unit='项',existing=null,today=T.today()}){
  const r=rules(input),old=clean(existing),stamp=new Date().toISOString();
  const plan={version:1,mode,unit,items:structuredClone(items),rules:r,deadlineSnapshot:task.dueAt||task.dueDate||'',confirmed:false,createdAt:old?.createdAt||stamp,updatedAt:stamp};
  const end=cutoff(plan),unfinished=plan.items.filter(x=>!x.done);
  if(!r.startDate||!r.endDate||r.startDate>end||dayMs(r.endDate)-dayMs(r.startDate)>730*86400000)return {plan,errors:['请填写有效的起止日期；扣除缓冲后须有可用日期，范围最多两年。'],capacity:0};
  const start=r.startDate<today?today:r.startDate;
  const dates=[];for(let date=start;date<=end;date=add(date,1))if(allowed(date,r))dates.push(date);
  const occupied=new Map();
  for(const x of plan.items){if(x.done||x.locked){if(x.date)occupied.set(x.date,(occupied.get(x.date)||0)+1);}else x.date='';}
  let slots=dates.flatMap(date=>Array.from({length:Math.max(0,r.maxPerDay-(occupied.get(date)||0))},()=>date));
  const pending=unfinished.filter(x=>!x.locked),capacity=slots.length;
  // 提前完成优先使用前65%的可用日；容量不够时扩大窗口，不超出原约束。
  if(r.style==='early'&&slots.length>=pending.length){
   let n=Math.max(1,Math.ceil(dates.length*.65));
   while(n<dates.length&&slots.filter(d=>d<=dates[n-1]).length<pending.length)n++;
   slots=slots.filter(d=>d<=dates[n-1]);
  }
  const n=Math.min(slots.length,pending.length),selected=[];
  if(r.style==='burst')selected.push(...slots.slice(0,n));
  else for(let i=0;i<n;i++)selected.push(slots[Math.floor((i+.5)*slots.length/n)]);
  pending.slice(0,n).forEach((x,i)=>x.date=selected[i]);
  const errors=validate(plan,task,today);
  if(n<pending.length)errors.unshift(`按当前约束只能安排${n}项，尚有${pending.length-n}项排不下。请提前开始、增加每日上限或调整休息日；不会自动占用休息日。`);
  return {plan,errors,capacity};
 }
 function summary(task,today=T.today()){
  const p=task.plan;if(!p)return null;
  const done=p.items.filter(x=>x.done).length,total=p.items.length,expected=p.items.filter(x=>x.date&&x.date<=today).length;
  const overdue=p.items.filter(x=>!x.done&&x.date&&x.date<today).length;
  const next=p.items.filter(x=>!x.done&&x.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  return {done,total,percent:Math.round(done/total*1000)/10,expected,behind:Math.max(0,expected-done),overdue,next,changed:p.deadlineSnapshot!==(task.dueAt||task.dueDate||''),complete:done===total};
 }
 function weeks(plan){
  const groups=new Map();for(const item of plan.items){if(!item.date)continue;const monday=add(item.date,-((weekday(item.date)+6)%7));if(!groups.has(monday))groups.set(monday,[]);groups.get(monday).push(item);}
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([start,items])=>({start,end:add(start,6),items,done:items.filter(x=>x.done).length}));
 }
 const api={styles,rules,advisorDefaults,clean,suggestion,makeItems,generate,validate,summary,weeks,add,weekday,cutoff,capacityAdvice,reviewUnits};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHPlanner=api;
})(globalThis);
