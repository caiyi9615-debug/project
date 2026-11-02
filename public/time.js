(function(root){
 'use strict';
 const ZONE='Asia/Shanghai',OFFSET=8*3600000;
 const statuses={unsubmitted:'未提交',submitted:'已提交',completed:'已完成',pending_review:'待批阅',overdue:'已逾期',unknown:'未知'};
 const types={absolute_datetime:'完整日期时间',date_only:'仅日期',relative:'相对日期',duration:'剩余时长',activity:'活动开始',manual:'人工填写',unknown:'无法识别',none:'无截止时间'};
 const pad=n=>String(n).padStart(2,'0');
 function dateOnly(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const [y,m,d]=value.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
  return y>=1900&&y<=2200&&dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?value:'';
 }
 function valid(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return '';
  const date=dateOnly(value.slice(0,10)),h=Number(value.slice(11,13)),m=Number(value.slice(14,16));
  return date&&h<24&&m<60?value:'';
 }
 function epoch(value){return valid(value)?Date.parse(value+':00+08:00'):NaN;}
 function local(ms){const d=new Date(ms+OFFSET);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;}
 function today(ms=Date.now()){return local(Number(ms)).slice(0,10);}
 function status(value,legacy=''){
  if(Object.hasOwn(statuses,value))return value;
  const raw=String(value||'').trim();
  if(/待批阅|待批改|待评分|已交待改/.test(raw))return 'pending_review';
  if(/未提交|未交/.test(raw))return 'unsubmitted';
  if(/已完成|已批阅|已批改/.test(raw)||raw==='done')return 'completed';
  if(/已提交|已交/.test(raw))return 'submitted';
  if(/逾期|过期/.test(raw))return 'overdue';
  return legacy==='done'?'completed':legacy==='todo'?'unsubmitted':'unknown';
 }
 function actionable(t){return ['unsubmitted','overdue','unknown'].includes(status(t.executionStatus,t.status));}
 function completed(t){return status(t.executionStatus,t.status)==='completed';}
 function normalize(value){
  const digits={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  const number=s=>{const p=s.split('十');return p.length===1?digits[s]:(p[0]?digits[p[0]]:1)*10+(p[1]?digits[p[1]]:0);};
  return String(value??'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/：/g,':').replace(/／/g,'/').replace(/[－—–]/g,'-').replace(/．/g,'.')
   .replace(/([一二两三四五六七八九十]{1,3})\s*月\s*([一二两三四五六七八九十]{1,3})\s*[日号]/g,(_,m,d)=>`${number(m)}月${number(d)}日`);
 }
 function dateCandidates(raw,reference=today()){
  const text=normalize(raw),out=[],ref=dateOnly(reference)||today();
  const pattern=/(?<![\dA-Za-z])(?:(\d{4})\s*[年\-/.]\s*)?(0?[1-9]|1[0-2])\s*[月\-/.]\s*(0?[1-9]|[12]\d|3[01])(?![\d:])\s*[日号]?/g;
  const matches=[...text.matchAll(pattern)].filter(m=>m[1]||text[m.index-1]!==':');
  for(const [index,m] of matches.entries()){
   const after=text.slice(m.index+m[0].length);
   if(/^\s*(?:分钟|分|秒|小时|时|天|周(?![一二三四五六日天])|月|年|岁|章|节|页|题|次|个|人|本|份|套|张|篇|字|点|度|元|栋|幢|班|层|楼|号楼)/.test(after))continue;
   let year=Number(m[1]);const inferred=!year,month=Number(m[2]),day=Number(m[3]);
   if(inferred){const y=Number(ref.slice(0,4)),rm=Number(ref.slice(5,7));year=month>=8?(rm>=8?y:y-1):(rm>=8?y+1:y);if(Date.parse(`${year}-${pad(month)}-${pad(day)}T00:00Z`)<Date.parse(ref+'T00:00Z')-90*86400000)year++;}
   let date=dateOnly(`${year}-${pad(month)}-${pad(day)}`);if(!date)continue;
   // Only the same clause may supply a clock. Durations and contact hours are not deadlines.
   const scope=text.slice(m.index+m[0].length,matches[index+1]?.index).split(/[，,。；;！!？?\n]/)[0],clockMatch=scope.match(/(?<![\d时用限共约耗每])([01]?\d|2[0-4])\s*[:：]\s*([0-5]\d)(?!\d)/)||scope.match(/(?<![\d时用限共约耗每有])([01]?\d|2[0-3])\s*[点时](?:\s*([0-5]?\d)\s*分)?(?!间|长|段|节|课|效|区|要求|建议|说明|\d)/);
   let clock='';if(clockMatch&&!/限时|用时|耗时|时长|咨询|联系|电话/.test(scope.slice(0,clockMatch.index))){let hour=Number(clockMatch[1]);if(/下午|晚上/.test(scope.slice(0,clockMatch.index))&&hour<12)hour+=12;if(hour<24||Number(clockMatch[2]||0)===0)clock=`${pad(hour)}:${pad(clockMatch[2]||0)}`;}
   const before=text.slice(Math.max(0,m.index-16),m.index),role=/(?:截止|最晚|提交时间|交付时间)[^，。；;\n]{0,8}$/.test(before)||/^(?:\s|[日号])*[^，。；;\n]{0,16}(?:截止|前提交|前交|前完成)/.test(after)?2:/发布|公布|通知日期/.test(before)?-1:0;
   const rollover=clock==='24:00';if(rollover){date=new Date(Date.parse(date+'T00:00Z')+86400000).toISOString().slice(0,10);clock='00:00';}out.push({date,clock,inferred,reference:ref,role,rollover});
  }
  return out;
 }
 function duration(raw){
  if(!/剩余|还剩|剩下|倒计时/.test(raw))return null;
  const read=re=>Number(raw.match(re)?.[1]||0);
  const days=read(/(\d+(?:\.\d+)?)\s*天/),hours=read(/(\d+(?:\.\d+)?)\s*(?:小时|时(?!间))/),minutes=read(/(\d+(?:\.\d+)?)\s*(?:分钟|分(?!钟?数))/);
  if(!/\d/.test(raw)||(!days&&!hours&&!minutes))return null;
  return {minutes:days*1440+hours*60+minutes,precision:/\d\s*(?:分钟|分)/.test(raw)?'分钟':'小时或天取整，误差可能更大',approximate:true};
 }
 function classify(raw,t={}){
  if(duration(raw))return 'duration';
  if(/明天|明晚|今晚|后天|今天|下周|本周|这周|月底|下个月|下月/.test(raw))return 'relative';
  if(t.timeEvidence?.type==='activity')return 'activity';
  if(t.dueAt&&valid(t.dueAt))return 'absolute_datetime';
  if(t.startsAt&&!t.dueAt&&!t.dueDate)return 'activity';
  if(t.dueDate||dateCandidates(raw).length)return 'date_only';
  return raw?'unknown':'none';
 }
 function partialDate(raw,reference=today(),preferred=''){
  const candidates=dateCandidates(raw,reference),chosen=candidates.filter(x=>x.date===preferred.slice(0,10)&&(!preferred.includes('T')||x.clock===preferred.slice(11)));
  if(chosen.length===1)return chosen[0];
  const unique=[...new Map(candidates.map(x=>[x.date+'T'+x.clock,x])).values()];if(unique.length===1)return unique[0];
  const ranked=unique.filter(x=>x.role===2);return ranked.length===1?ranked[0]:null;
 }
 function resolve(task,baseAt='',baseSource='用户手动核实的截图拍摄时间',reference=today()){
  const raw=String(task.timeEvidence?.raw||task.dateText||'').trim(),type=classify(raw,task),d=duration(raw);
  const evidence={raw,type,timezone:ZONE,baseAt:'',baseSource:'未提供可靠截图时间',method:'未推算',inferred:false,precision:'未知',confirmed:false,verification:'pending',...task.timeEvidence,raw,type,timezone:ZONE};
  let dueAt=valid(task.dueAt)||'',dueDate=dateOnly(task.dueDate)||'',deadlineKind=task.deadlineKind|| (dueAt?'datetime':dueDate?'date':'pending');
  if(type==='duration'||type==='relative'){
   dueAt='';dueDate='';deadlineKind='pending';evidence.baseAt=valid(baseAt)||'';evidence.baseSource=evidence.baseAt?baseSource:'未提供可靠截图时间';evidence.confirmed=false;
   if(evidence.baseAt){
    const base=epoch(evidence.baseAt);evidence.inferred=true;evidence.verification='estimated';
    if(d){dueAt=local(base+d.minutes*60000);deadlineKind='datetime';evidence.method=`截图时间 + ${d.minutes}分钟（${ZONE}）`;evidence.precision=d.precision;}
    else {
     const day=new Date(base+OFFSET);let offset=null;
     if(/明天|明晚/.test(raw))offset=1;else if(/后天/.test(raw))offset=2;else if(/今天|今晚/.test(raw))offset=0;
     const week=raw.match(/(下周|本周|这周)([一二三四五六日天])/);
     if(week){const weekday=(day.getUTCDay()+6)%7,target='一二三四五六日'.indexOf(week[2]==='天'?'日':week[2]);offset=(week[1]==='下周'?7:0)-weekday+target;}
     if(/月底/.test(raw)){const end=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth()+1,0));dueDate=`${end.getUTCFullYear()}-${pad(end.getUTCMonth()+1)}-${pad(end.getUTCDate())}`;}
     else if(offset!==null)dueDate=local(base+offset*86400000).slice(0,10);
     if(dueDate){deadlineKind='date';evidence.method=`根据用户核实的通知发布时间解析“${raw}”；下周按下一自然周（周一开始）`;evidence.precision=/晚上|下午|上午|中午|明晚|今晚/.test(raw)?'时段不等于具体时刻，仍需核实':'仅日期，具体时刻未知';
      const normalized=normalize(raw),clock=normalized.match(/(?<!\d)([01]?\d|2[0-4]):([0-5]\d)(?!\d)/)||normalized.match(/(?<!\d)([01]?\d|2[0-3])点(?:([0-5]?\d)分)?/);
      if(clock){let hour=Number(clock[1]),minute=Number(clock[2]||0);if(/下午|晚上|明晚|今晚/.test(normalized.slice(0,clock.index))&&hour<12)hour+=12;if(hour<24||minute===0){const day=hour===24?new Date(Date.parse(dueDate+'T00:00Z')+86400000).toISOString().slice(0,10):dueDate;dueAt=day+'T'+pad(hour%24)+':'+pad(minute);dueDate='';deadlineKind='datetime';evidence.precision='分钟';if(hour===24)evidence.method+='；24:00换算为次日00:00';}}
     }
    }
   }else{evidence.method='缺少截图完整日期和时刻，禁止按系统当前时间推算';evidence.verification='pending';}
  }else if(type==='date_only'||type==='absolute_datetime'){
   const parsed=partialDate(raw,valid(baseAt)?baseAt.slice(0,10):reference,dueAt||dueDate);
   if(parsed&&(!task.dateConfirmed||!dueAt&&!dueDate)){
    if(parsed.clock){dueAt=parsed.date+'T'+parsed.clock;dueDate='';deadlineKind='datetime';}else{dueDate=parsed.date;dueAt='';deadlineKind='date';}
    evidence.yearInferred=parsed.inferred;evidence.yearReference=parsed.inferred?reference:'';
    evidence.inferred=parsed.inferred;evidence.precision=parsed.clock?'分钟':'仅日期';
    evidence.method=parsed.inferred?`缺少年份：按当前学年与参考日期${reference}建议年份，超过90天的历史候选顺延一年；原文月日和时刻保留，须确认年份`:'保留通知原文日期与时刻，不补23:59';
    if(parsed.rollover)evidence.method+='；原文24:00换算为次日00:00';evidence.verification=evidence.confirmed?(parsed.clock?'confirmed':'date_only'):'pending';
   }
   if(!parsed){
   if(!dueAt)deadlineKind=dueDate?'date':'pending';
   evidence.method=dueAt?'通知原文完整日期与时刻':'保留原文日期，不补23:59';evidence.precision=dueAt?'分钟':'仅日期';evidence.verification=evidence.confirmed?'date_only':'pending';
   }
  }
  else if(type==='activity'){deadlineKind=task.deadlineKind==='pending'?'pending':'none';evidence.method='活动开始时间与截止时间分开保存';}
  if(task.deadlineKind==='none'){dueAt='';dueDate='';deadlineKind='none';evidence.verification='none';}
  return {...task,dueAt,dueDate,deadlineKind,timeEvidence:evidence,dateConfirmed:evidence.confirmed===true};
 }
 function label(t){
  if(t.deadlineKind==='none')return '无截止时间';
  const mark=t.timeEvidence?.yearInferred?'（年份推断）':t.timeEvidence?.inferred?'（推算值）':'';
  if(t.dueAt)return t.dueAt.replace('T',' ')+mark+(t.dateConfirmed?'':' · 待核实');
  if(t.dueDate)return t.dueDate+'（仅日期）'+mark+(t.dateConfirmed?'':' · 待核实');
  return (t.dateText?`${t.dateText} · `:'')+'待核实';
 }
 const api={ZONE,statuses,types,dateOnly,valid,epoch,local,today,status,actionable,completed,duration,classify,resolve,label,partialDate,dateCandidates,normalize};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHTime=api;
})(globalThis);
