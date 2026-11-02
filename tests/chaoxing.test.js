'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateOutput,analyzeNotification}=require('../ai');
function row(title,iconColor,statusText,dateText=''){
 return {title,sourcePlatform:'chaoxing_homework',iconColor,statusText,dateText,checklist:[],uncertain:[]};
}
test('学习通等价样本：仅三项蓝色未提交入候选，灰色未提交也排除',()=>{
 const tasks=validateOutput({tasks:[
  row('静电场实验报告','blue','未提交','剩余93小时35分钟'),
  row('实验九：基于三表法的交流等效参数的实测与仿真测试','blue','未提交','剩余22小时35分钟'),
  row('第三章书面作业','blue','未提交','剩余131小时35分钟'),
  row('热电偶实验报告','gray','待批阅'),row('第二章书面作业','gray','已完成'),
  row('薄透镜实验报告','gray','待批阅'),row('第一章书面作业','gray','未提交'),
  row('刚体转动惯量实验报告','gray','已完成'),row('成绩查询','gray','已完成'),
  row('综合实践创新作业','gray','未提交')
 ]});
 assert.equal(tasks.length,3);
 assert.deepEqual(tasks.map(t=>t.dateText),['剩余93小时35分钟','剩余22小时35分钟','剩余131小时35分钟']);
 for(const t of tasks){assert.equal(t.executionStatus,'unsubmitted');assert.equal(t.dueAt,'');assert.match(t.evidence,/蓝色/);}
});
test('学习通不以蓝色猜状态，也不以未提交猜颜色',()=>{
 for(const r of [row('x','unknown','未提交'),row('x','blue','未知'),row('x','gray','未提交'),row('x','blue','已提交'),row('x','blue','待批阅'),row('x','blue','已完成')]){
  assert.throws(()=>validateOutput({tasks:[r]}),e=>e.status===422&&/没有符合条件/.test(e.message));
 }
});
test('其他平台普通通知不套学习通颜色规则，也不改写完成或批阅状态',()=>{
 const tasks=validateOutput({tasks:[{...row('普通实验','gray','待批阅'),sourcePlatform:'other'},{...row('普通通知','gray','已完成'),sourcePlatform:'other'}]});
 assert.equal(tasks.length,2);assert.equal(tasks[0].executionStatus,'pending_review');assert.equal(tasks[1].executionStatus,'completed');
});
test('图片请求携带学习通规则，适配器执行二次筛选',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='mock-only';
 try{
  const result=await analyzeNotification({image:{mimeType:'image/png',data:'cG5n'}},async(url,options)=>{
   const body=JSON.parse(options.body);assert.match(body.messages[0].content[0].text,/灰色图标行即使写未提交也必须忽略/);
   assert.equal(body.messages[0].content[1].type,'image_url');
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({tasks:[row('要做','blue','未提交'),row('忽略','gray','未提交')]})}}]}));
  });assert.deepEqual(result.tasks.map(t=>t.title),['要做']);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
