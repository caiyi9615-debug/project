(function(root){
 'use strict';
 const family={分钟:'time',小时:'time',秒:'time',天:'time',周:'time',人:'people',名:'people',页:'page',字:'text',篇:'report',份:'report',章:'chapter',节:'section',套:'set',个:'piece',支:'piece',部:'piece',GB:'size',MB:'size'};
 function tokens(text){return [...String(text||'').matchAll(/(\d+(?:\.\d+)?)\s*(分钟|小时|秒|天|周|人|名|页|字|篇|份|章|节|套|个|支|部|GB|MB)([^\d\s，。；：、,;:"{}\[\]\n]{0,12})/g)].map(m=>({value:Number(m[1]),unit:m[2],topic:m[3].replace(/^(?:的)/,'').replace(/(?:并|后|再|与|和|及).*$/,'')}));}
 function unitIssues(source,steps){
  const inputs=tokens(source),outputs=tokens((steps||[]).map(x=>[x.title,x.description].join(' ')).join('\n')),issues=[];
  for(const a of inputs)for(const b of outputs){
   if(a.value!==b.value||a.unit===b.unit||family[a.unit]===family[b.unit]&&['report','people'].includes(family[a.unit]))continue;
   if(family[a.unit]!==family[b.unit]&&!['piece'].includes(family[a.unit])&&!['piece'].includes(family[b.unit]))continue;
   const sameTopic=a.topic&&b.topic&&(a.topic.startsWith(b.topic)||b.topic.startsWith(a.topic)||a.topic.slice(0,2)===b.topic.slice(0,2));
   if(sameTopic||!a.topic&&!b.topic)issues.push(`原文“${a.value}${a.unit}${a.topic}”在步骤里可能变成“${b.value}${b.unit}${b.topic}”，请核对数量与单位。`);
  }
  return [...new Set(issues)];
 }
 const api={unitIssues};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHFidelity=api;
})(globalThis);
