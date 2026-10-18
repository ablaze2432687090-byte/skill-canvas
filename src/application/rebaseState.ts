const human=new Set(['prompt','requirements','instruction','instructions','finalPrompt','description','text','name','title','notes','label','purpose','message','source']);
/** Rebase cache metadata after an explicit native data-location change, never authored text. */
export function rebaseState<T>(value:T,from:string,to:string,field=''):T {
 if(human.has(field)&&(typeof value==='string'||Array.isArray(value)))return value;
 if(typeof value==='string'){
  const normalized=value.replaceAll('\\','/'),source=from.replaceAll('\\','/').replace(/\/$/,''),destination=to.replaceAll('\\','/').replace(/\/$/,''),windows=/^[a-z]:\//i.test(source),check=windows?normalized.toLowerCase():normalized,prefix=windows?source.toLowerCase():source;
  if(check!==prefix&&!check.startsWith(prefix+'/'))return value;const result=destination+normalized.slice(source.length);return (value.includes('\\')?result.replaceAll('/','\\'):result) as T;
 }
 if(Array.isArray(value))return value.map(item=>rebaseState(item,from,to,field)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebaseState(item,from,to,key)])) as T;
 return value;
}
