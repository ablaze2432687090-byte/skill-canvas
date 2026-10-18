import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,deflateRawSync} from 'node:zlib';
import {readSkillZip} from '../../bridge/server/skillZip.mjs';
import {githubSkillLocation} from '../../bridge/server/skillSources.mjs';
import {installationTranslations} from '../../bridge/server/skills.mjs';

export function zipFixture(entries=[{name:'nested/SKILL.md',text:'---\nname: zip-test\ndescription: test\n---\nUse ImageGen.'}]){
 const locals=[],centrals=[];let offset=0;
 for(const entry of entries){const name=Buffer.from(entry.name),data=Buffer.from(entry.text||''),packed=deflateRawSync(data),local=Buffer.alloc(30),central=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(entry.crc??crc32(data),16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(entry.size??data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(entry.attrs??0,38);central.writeUInt32LE(offset,42);locals.push(local,name,packed);centrals.push(central,name);offset+=local.length+name.length+packed.length;}
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
test('ZIP reads a nested UTF-8 Skill without executing or extracting files',()=>{const files=readSkillZip(zipFixture());assert.equal(files[0].path,'nested/SKILL.md');assert.match(files[0].bytes.toString(),/zip-test/);});
test('ZIP rejects traversal, reserved names, symlinks, duplicate and conflicting paths',()=>{
 for(const name of ['../SKILL.md','/SKILL.md','C:/SKILL.md','x\\SKILL.md','nul.md','.codex/SKILL.md'])assert.throws(()=>readSkillZip(zipFixture([{name}])));
 assert.throws(()=>readSkillZip(zipFixture([{name:'SKILL.md',attrs:0xa0000000}])));
 assert.throws(()=>readSkillZip(zipFixture([{name:'SKILL.md'},{name:'skill.md'}])));
 assert.throws(()=>readSkillZip(zipFixture([{name:'a'},{name:'a/SKILL.md'}])));
});
test('ZIP rejects damaged checksums, oversized expansion and malformed local headers',()=>{
 assert.throws(()=>readSkillZip(zipFixture([{name:'SKILL.md',text:'test',crc:0}])));
 assert.throws(()=>readSkillZip(zipFixture([{name:'SKILL.md',size:9*1024*1024}])));
 const bytes=zipFixture();bytes[30]=0x41;assert.throws(()=>readSkillZip(bytes));
 assert.throws(()=>readSkillZip(Buffer.alloc(30)));
});
test('GitHub URL normalization accepts explicit subfolders but rejects alternate hosts and traversal',()=>{
 assert.deepEqual(githubSkillLocation('https://github.com/author/visual/tree/main/skills/art'),{url:'https://github.com/author/visual',ref:'main',root:'skills/art'});
 assert.equal(githubSkillLocation('https://github.com/author/visual.git').url,'https://github.com/author/visual');
 for(const url of ['http://github.com/a/b','https://evil.com/a/b','https://github.com/a/b?x=1','https://github.com/a/b/tree/main/skills/%2e%2e%2fx'])assert.throws(()=>githubSkillLocation(url));
});
test('display translations are bounded metadata, never arbitrary execution overrides',()=>{
 assert.deepEqual(installationTranslations({en:{name:' Name ',description:' brief '}}),{en:{name:'Name',description:'brief'}});
 for(const value of [null,[],{fr:{}},{en:{instructions:'run'}},{en:{name:'x'.repeat(101)}}])assert.throws(()=>installationTranslations(value));
});
