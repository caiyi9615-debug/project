'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../advisor'),P=require('../public/planner'),D=require('../public/domain');
const project={title:'大学物理复习',description:'复习已指定的五章课程',dueDate:'2028-11-15',dateConfirmed:true};
const limits={startDate:'2028-11-01',endDate:'2028-11-15',dailyMinutes:45,focusMinutes:30,bufferDays:0,excludedWeekdays:[0,6],excludedDates:[],style:'steady'};
const output={summary:'先梳理知识再练习',steps:[{title:'梳理第一章知识',description:'整理知识关系图',minutes:25}],assumptions:['时长为AI估计'],refinedRules:{}};
const response=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
async function withKey(fn){const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-only';try{await fn();}finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}}
test('无需先做访谈或填写回答，已有目标可直接生成草案',()=>withKey(async()=>{
 let calls=0;
 const result=await A.advise({stage:'draft',project,answers:[],constraints:limits},async(url,o)=>{calls++;const input=JSON.parse(o.body);assert.match(input.messages[0].content,/客观事实/);assert.deepEqual(JSON.parse(input.messages[1].content).answers,[]);return response(output);});
 assert.equal(calls,1);assert.equal(result.plan.items.length,1);assert.deepEqual(result.plan.guidance.answers,[]);
}));
test('只有影响正确性的关键缺失才返回至多两个问题，而不伪造计划',()=>withKey(async()=>{
 const result=await A.advise({stage:'draft',project,answers:[],constraints:limits},async()=>response({summary:'需要确认复习范围',questions:[{question:'需要复习哪些章节？'}]}));
 assert.equal(result.needsClarification,true);assert.equal(result.questions.length,1);assert.equal(result.plan,undefined);
}));
test('草案没有已确认的截止时，不把计划结束日写回客观截止',()=>withKey(async()=>{
 const unknown={title:'准备作品',description:'先梳理要求，截止时间还不知道'};
 const result=await A.advise({stage:'draft',project:unknown,answers:[],constraints:limits},async()=>response(output));
 assert.equal(result.plan.deadlineSnapshot,'');assert.equal(result.plan.rules.endDate,limits.endDate);
}));
test('默认偏好自动复用，日期及个别休息日期不跨任务沿用',()=>{
 const first=P.advisorDefaults({},{} ,'2026-10-31');assert.equal(first.endDate,'');assert.equal(first.dailyMinutes,45);assert.equal(first.focusMinutes,30);assert.equal(first.bufferDays,0);
 const state={plannerPreferences:{style:'early',excludedWeekdays:[0,3],bufferDays:1,excludedDates:['2026-11-04']},advisorPreferences:{dailyMinutes:75,focusMinutes:45}};
 const r=P.advisorDefaults(project,state,'2026-10-31');assert.equal(r.endDate,'2028-11-15');assert.equal(r.startDate,'2026-10-31');assert.equal(r.dailyMinutes,75);assert.deepEqual(r.excludedWeekdays,[0,3]);assert.equal(r.style,'early');
 const invalid=P.advisorDefaults({}, {advisorPreferences:{dailyMinutes:15,focusMinutes:120}},'2026-10-31');assert.equal(invalid.focusMinutes,15);
});
test('用户偏好连同任务数据可备份恢复',()=>{
 const s=D.validateBackup({version:2,tasks:[],sources:[],changes:[],history:[],advisorPreferences:{dailyMinutes:60,focusMinutes:30},plannerPreferences:{excludedWeekdays:[0],style:'burst'}});
 assert.equal(P.advisorDefaults({},s).dailyMinutes,60);assert.deepEqual(P.advisorDefaults({},s).excludedWeekdays,[0]);
});
