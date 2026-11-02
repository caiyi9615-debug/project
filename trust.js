'use strict';
// Never repair lossy text by guessing the original bytes.
const badText=value=>/[\uFFFD]|(?:Ã.|Â.|Ð.|Ñ.|Ŀ|ԭ|վ){2,}/u.test(String(value));
function validateText(value){
 if(typeof value==='string'&&badText(value))throw Object.assign(new Error('收到的文字包含替换字符或疑似损坏编码，请重新粘贴原文；尚未调用AI。'),{status:400,publicMessage:'收到的文字包含替换字符或疑似损坏编码，请重新粘贴原文；尚未调用AI。'});
 if(Array.isArray(value))value.forEach(validateText);else if(value&&typeof value==='object')Object.values(value).forEach(validateText);
}
function cleanEncodingClaims(text,source){
 if(!source||badText(source))return text;
 return String(text||'').split(/(?<=[。！？；\n])/).filter(s=>!/(?:原文|文本|文字|编码).{0,12}(?:乱码|编码异常|编码错误)|(?:乱码|编码异常).{0,8}(?:原文|文本)/.test(s)).join('').trim();
}
const numericRule='数字、数量词、单位、日期必须逐字保留，不得互换时长和数量：3分钟演示视频是一支时长3分钟的视频，不是3个视频；7篇报告不是7分钟。未知时原样引用并追问，不按数字生成不存在的交付物。';
function validateQuantities(source,value){
 const output=JSON.stringify(value);
 const clips=[...String(source).matchAll(/(\d+(?:\.\d+)?|[一二三四五六七八九十两]+)\s*分钟(?:的)?(?:演示|展示|介绍|汇报)?视频/g)];
 for(const [,n] of clips){
  for(const t of value?.tasks||[])if(t.workload?.unit?.includes('视频')&&!/\d+\s*(?:个|支|部)\s*(?:演示)?视频/.test(source))throw new Error('AI把视频时长提取成了视频工作量，结果未采用，请重新识别。');
  if(new RegExp(n+'\\s*(?:个|支|部|份)(?:演示|展示|介绍|汇报)?视频').test(output))throw new Error('AI将视频时长误写为视频数量，结果未采用。请重新生成并核对数字单位。');
  if(!/\d+\s*(?:个|支|部)\s*(?:演示)?视频/.test(source)&&new Set([...output.matchAll(/视频\s*([123一二三])/g)].map(m=>m[1])).size>1)throw new Error('AI可能将一支视频拆成了多个视频交付物，结果未采用，请重新生成。');
 }
}
module.exports={badText,validateText,cleanEncodingClaims,numericRule,validateQuantities,unitIssues:require('./public/fidelity').unitIssues};
