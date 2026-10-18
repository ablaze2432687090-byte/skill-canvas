import test from 'node:test';
import assert from 'node:assert/strict';
import { skillPresentation } from '../../src/application/presentation.ts';
import { visualCatalog, visualCatalogEntry } from '../../src/application/visualCatalog.ts';
import { presentationManifest } from '../fixtures/presentation.ts';

test('selected visual catalog contains exactly 25 distinct sources, no fashion or article illustration workflows',()=>{
 assert.equal(visualCatalog.length,25);
 assert.equal(new Set(visualCatalog.map(e=>e.repository+'/'+e.root)).size,25);
 for(const entry of visualCatalog){assert.ok(entry.displayName.trim());assert.match(entry.description,/[\u3400-\u9fff]/);assert.ok(entry.description.length<100);assert.doesNotMatch(entry.root,/fashion|couture|article-illustrator/);}
});
test('display catalog matches exact repository and skill root, not raw skill name',()=>{
 const manifest=presentationManifest('photo-revival');const before=JSON.stringify(manifest);
 manifest.source.repository='https://github.com/dacnay816y62-hub/photo-revival';manifest.source.skillRoot='';
 const source=JSON.stringify(manifest),view=skillPresentation(manifest);
 assert.equal(view.displayName,'Photo Revival');assert.match(view.displayDescription,/诗意手绘/);assert.equal(view.featuredExample,undefined);assert.equal(view.examples.length,0);assert.equal(JSON.stringify(manifest),source);assert.notEqual(source,before);
 manifest.source.repository='https://github.com/untrusted/photo-revival';assert.match(skillPresentation(manifest).displayDescription,/详细能力/);
 assert.equal(visualCatalogEntry('https://github.com/yokel1121/muyang-illustration-skills','skills/muyang-dark-fashion'),undefined);
});
test('registered but uninstalled catalog metadata is never presented as available',()=>{
 const manifest=presentationManifest('xhs-cover');manifest.source.repository='https://github.com/Vivixiao980/xhs-cover-skill';manifest.source.skillRoot='';manifest.installation.installed=false;manifest.installation.rootId='catalog-pending';manifest.runtime.status='unavailable';
 const view=skillPresentation(manifest);assert.equal(view.displayStatus,'未安装');assert.equal(view.displayName,'XHS Cover');assert.equal(view.examples.length,0);
});
test('installed but unexecuted visual skills remain pending validation',()=>{
 const manifest=presentationManifest('surreal-pop-collage');manifest.installation.executionValidated=false;
 assert.equal(skillPresentation(manifest).displayStatus,'待验证');
});

