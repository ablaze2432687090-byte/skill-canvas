import path from 'node:path';
import {mkdir,lstat,readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {defaultCustomization,validateCustomization} from '../../src/domain/customization.ts';
import {replaceRecord,validatePng} from './workspace.mjs';

export class CustomizationStore {
 constructor(dataRoot){this.root=path.resolve(dataRoot);this.directory=path.join(this.root,'Settings');this.file=path.join(this.directory,'customization.json');this.queue=Promise.resolve();}
 async safe(file){
  const relative=path.relative(this.root,file);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('个人数据路径越界。');
  let cursor=this.root;for(const part of ['',...relative.split(path.sep)]){if(part)cursor=path.join(cursor,part);const info=await lstat(cursor).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(info?.isSymbolicLink())throw Error('个人数据不能使用符号链接。');}
 }
 async read(){await this.safe(this.file);try{return validateCustomization(JSON.parse(await readFile(this.file,'utf8')));}catch(error){if(error.code==='ENOENT')return defaultCustomization();throw error;}}
 async write(value){const operation=this.queue.catch(()=>{}).then(async()=>{const next=validateCustomization(value),previous=await this.read();if(next.revision!==previous.revision)throw Error('设置已在其他位置更改，请刷新后重试。');next.revision++;await this.safe(this.file);await mkdir(this.directory,{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(next),{flag:'wx'});await replaceRecord(temporary,this.file);}finally{await unlink(temporary).catch(()=>{});}return next;});this.queue=operation;return operation;}
 async upload(input){
  if(typeof input?.data!=='string'||input.data.length>12*1024*1024)throw Error('请上传不超过 8 MB 的 PNG。');const bytes=Buffer.from(input.data,'base64');if(bytes.length>8*1024*1024)throw Error('请上传不超过 8 MB 的 PNG。');
  const info=validatePng(bytes),id=createHash('sha256').update(bytes).digest('hex'),file=path.join(this.directory,'Media',id+'.png');await this.safe(file);await mkdir(path.dirname(file),{recursive:true});try{await writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;await this.media(id);}
  return {id,mime:'image/png',width:info.width,height:info.height,createdAt:new Date().toISOString(),source:'Personal upload',focusX:50,focusY:50};
 }
 async media(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('图片身份无效。');const file=path.join(this.directory,'Media',id+'.png');await this.safe(file);const bytes=await readFile(file);if(bytes.length>8*1024*1024||createHash('sha256').update(bytes).digest('hex')!==id)throw Error('个人图片完整性校验失败。');validatePng(bytes);return {data:bytes.toString('base64'),mime:'image/png'};}
}
