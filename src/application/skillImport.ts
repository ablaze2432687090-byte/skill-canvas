export async function zipSkillInput(file: File) {
  if(!/\.zip$/i.test(file.name)||file.size>64*1024*1024||!file.size)throw Error('请选择不超过 64 MB 的 ZIP 文件。');
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
  for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
  return {type:'zip',folder:file.name.slice(0,100),data:btoa(binary)};
}
