import {inflateRawSync,crc32} from 'node:zlib';
import {checkedFiles,safeName,MAX_SKILL_BYTES} from './skillSources.mjs';

// Inspect in memory only: no shell, extraction directory or executable invocation.
export function readSkillZip(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>MAX_SKILL_BYTES)throw Error('ZIP 文件无效或超过 64 MB。');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  if(end<0)throw Error('ZIP 目录损坏，未安装任何文件。');
  const count=bytes.readUInt16LE(end+10),centralSize=bytes.readUInt32LE(end+12),central=bytes.readUInt32LE(end+16);
  if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count===65535||count>1000||central+centralSize!==end)throw Error('不支持分卷、ZIP64 或过大的 ZIP。');
  const files=[],seen=new Set(),ranges=[];let cursor=central,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('ZIP 目录损坏，未安装任何文件。');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),checksum=bytes.readUInt32LE(cursor+16),packed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),n=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),attrs=bytes.readUInt32LE(cursor+38),offset=bytes.readUInt32LE(cursor+42);
    if(cursor+46+n+extra+comment>end||bytes.readUInt16LE(cursor+34)||(flags&1)||![0,8].includes(method)||(attrs>>>16&0xf000)===0xa000||(attrs&0x400))throw Error('ZIP 含加密、链接或不支持的文件。');
    const rawName=bytes.subarray(cursor+46,cursor+46+n);
    if(!(flags&0x800)&&rawName.some(byte=>byte>127))throw Error('ZIP 文件名编码不受支持，请使用 UTF-8 ZIP 或直接选择文件夹。');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(rawName),directory=name.endsWith('/');
    safeName(directory?name.slice(0,-1):name);
    const key=name.toLowerCase();if(seen.has(key))throw Error('ZIP 含重复或大小写冲突的路径。');seen.add(key);
    if(offset+30>central||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('ZIP 本地文件头损坏。');
    const localN=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),start=offset+30+localN+localExtra,finish=start+packed;
    if(bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||!bytes.subarray(offset+30,offset+30+localN).equals(rawName)||finish>central||ranges.some(([a,b])=>offset<b&&finish>a))throw Error('ZIP 文件范围或文件名不一致。');
    ranges.push([offset,finish]);cursor+=46+n+extra+comment;
    if(directory){if(size||packed)throw Error('ZIP 目录包含异常数据。');continue;}
    if(size>8*1024*1024||(total+=size)>MAX_SKILL_BYTES||files.length>=500)throw Error('ZIP 解压后超过 500 文件、单文件 8 MB 或总计 64 MB。');
    let data;try{data=method===0?bytes.subarray(start,finish):inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:8*1024*1024});}catch{throw Error('ZIP 解压失败或超过安全限制。');}
    if(data.length!==size||crc32(data)!==checksum)throw Error('ZIP 文件校验失败，未安装任何文件。');
    files.push({path:name,bytes:data});
  }
  if(cursor!==end)throw Error('ZIP 目录长度不一致。');
  return checkedFiles(files);
}
