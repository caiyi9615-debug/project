'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../public/recognition'),{validateOutput,analyzeNotification}=require('../ai');
const raw=(extra={})=>({title:'报告提交',dateText:'2026年11月12日18:00前提交',checklist:[],uncertain:[],executionStatus:'unsubmitted',...extra});
const task=extra=>validateOutput({tasks:[raw(extra)]},'课程通知','2026-11-01')[0];
const compact=text=>text.replace(/\s/g,'');

test('分段优先保留段落，超长段按句子切分，长度受限且文字不丢',()=>{
  const text='第一段：请先阅读要求。\n\n第二段：提交报告。\n第三段：核对后保存。';
  const pieces=R.splitText(text,20);
  assert.ok(pieces.length>1);assert.ok(pieces.every(piece=>piece.length<=20));
  assert.equal(compact(pieces.join('')),compact(text));
  assert.deepEqual(R.splitText('   \n\n'),[]);
  const long='一段没有任何标点'.repeat(700)+'。'+'最后一句😀'.repeat(40);
  const bounded=R.splitText(long,127);
  assert.ok(bounded.every(piece=>piece.length<=127));assert.equal(compact(bounded.join('')),compact(long));
  assert.ok(bounded.every(piece=>!/[\uD800-\uDBFF]$/.test(piece)&&! /^[\uDC00-\uDFFF]/.test(piece)));
  assert.throws(()=>R.splitText('a'.repeat(20001)),/20000/);assert.throws(()=>R.splitText('通知',0),/长度/);
});

test('缺少年份的后端标记在分段去重后保留，不把建议年份改成已确认',()=>{
  const value=task({dateText:'11月12日18:00前提交'});
  assert.equal(value.dateConfirmed,false);assert.equal(value.timeEvidence.yearInferred,true);
  assert.match(value.uncertain.join('；'),/缺少年份/);
  const duplicate={...structuredClone(value),id:'another-segment',uncertain:[...value.uncertain,'提交地点待确认']};
  const merged=R.mergeTasks([value,duplicate]);
  assert.equal(merged.length,1);assert.equal(merged[0].dateConfirmed,false);assert.equal(merged[0].timeEvidence.yearInferred,true);
  assert.match(merged[0].uncertain.join('；'),/缺少年份/);assert.match(merged[0].uncertain.join('；'),/提交地点待确认/);
});

test('未提取到完整日期仍显式待确认，不因合并而生成截止时间',()=>{
  const value=task({dateText:'近期提交，具体日期另行通知'});
  assert.equal(value.dueAt,'');assert.equal(value.dueDate,'');assert.match(value.uncertain.join('；'),/未提取到完整日期/);
  const merged=R.mergeTasks([value,{...structuredClone(value),id:'copy'}]);
  assert.equal(merged.length,1);assert.equal(merged[0].dueAt,'');assert.equal(merged[0].dueDate,'');
  assert.match(merged[0].uncertain.join('；'),/未提取到完整日期/);
});

test('合并保留原文、不确定信息和清单并且不修改输入，不同截止/状态/课程/地点不误删',()=>{
  const first=task({evidence:'原文第一处',checklist:['报告'],uncertain:['地点待确认']}),second=structuredClone(first);
  second.id='copy';second.evidence='原文第二处';second.uncertain=['地点待确认','材料待确认'];second.aiNotes=['另一段时间依据'];
  second.checklist=[{id:'checked',text:'报告',done:true},{id:'photo',text:'照片',done:false}];
  const snapshot=structuredClone([first,second]),merged=R.mergeTasks([first,second]);
  assert.equal(merged.length,1);assert.match(merged[0].evidence,/原文第一处/);assert.match(merged[0].evidence,/原文第二处/);
  assert.equal(merged[0].checklist.length,2);assert.equal(merged[0].checklist[0].done,true);assert.deepEqual(merged[0].aiNotes,['另一段时间依据']);
  assert.deepEqual([first,second],snapshot);
  for(const change of [{dueAt:'2026-11-13T18:00'},{executionStatus:'completed'},{course:'另一门课'},{location:'另一教室'},{description:'另一项具体作业'}]){
    const base={...first,location:'教室A',description:'一份课程报告'};
    assert.equal(R.mergeTasks([base,{...base,...change}]).length,2);
  }
  assert.equal(R.mergeTasks([{...first,dueAt:'',dueDate:'',startsAt:'',deadlineKind:'pending',dateText:'下周一'},{...first,dueAt:'',dueDate:'',startsAt:'',deadlineKind:'pending',dateText:'下周二'}]).length,2);
  assert.equal(R.mergeTasks([{title:''},{title:''}]).length,2);
});

test('输出截断后可逐段调用原识别接口，合并重复事项并保留独立任务',async()=>{
  const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='unit-test-segment-only';
  try{
    let calls=0;
    const request=async(url,options)=>{
      calls++;const body=JSON.parse(options.body);assert.equal(body.max_tokens,7000);
      if(calls===1)return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"tasks":['}}]}));
      const repeated=raw({title:'报名',dateText:'2026年11月12日18:00前报名'});
      const tasks=calls===3?[repeated,raw({title:'提交材料'})]:[repeated];
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({tasks})}}]}));
    };
    const source='第一段通知：请完成报名，提交报名要求。\n\n第二段通知：再次提醒报名，并准备提交材料。';
    await assert.rejects(()=>analyzeNotification({text:source},request),/输出被截断.*分段识别/);
    const pieces=R.splitText(source,28),results=[];
    for(const text of pieces){const response=await analyzeNotification({text},request);results.push(...response.tasks);}
    const merged=R.mergeTasks(results);
    assert.equal(merged.length,2);assert.deepEqual(new Set(merged.map(item=>item.title)),new Set(['报名','提交材料']));
    assert.equal(merged.filter(item=>item.title==='报名').length,1);assert.ok(calls>=3);
  }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});
