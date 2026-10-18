import {build} from 'electron-builder';
import {readFile,writeFile} from 'node:fs/promises';
import {auditRelease} from './audit-release.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{releasePolicy}=require('../desktop/updates.cjs');
const source=JSON.parse(await readFile('desktop/release.json','utf8')),policy=releasePolicy(source);
const audit=await auditRelease();await writeFile('desktop-dist/release-audit.json',JSON.stringify(audit,null,2));
if(policy.enabled&&!process.env.CSC_LINK&&!process.env.WIN_CSC_LINK)throw Error('公开更新版本必须配置代码签名证书。');
await build({publish:'never',config:{extends:'electron-builder.yml',publish:policy.enabled?[policy.feed]:null,win:{...(policy.enabled?{publisherName:source.publisherName}:{}),target:['nsis']}}});
