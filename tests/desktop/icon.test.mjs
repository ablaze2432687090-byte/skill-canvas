import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('desktop icon C retains approved bytes and native small-size frames', async () => {
  const source = await readFile('desktop/assets/icon-c.ico');
  const built = await readFile('desktop-dist/icon.ico');
  assert.deepEqual(built, source);
  assert.equal(source.readUInt16LE(0), 0);
  assert.equal(source.readUInt16LE(2), 1);
  const sizes = [16,24,32,48,64,128,256];
  assert.equal(source.readUInt16LE(4), sizes.length);
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + 16 * index;
    assert.equal(source[entry] || 256, size);
    assert.equal(source[entry + 1] || 256, size);
    const length = source.readUInt32LE(entry + 8), offset = source.readUInt32LE(entry + 12);
    const frame = source.subarray(offset, offset + length);
    assert.equal(frame.length, length);
    assert.equal(frame.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(frame.readUInt32BE(16), size);
    assert.equal(frame.readUInt32BE(20), size);
  }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(await readFile('public/favicon.svg')), '3ddbbbbce56faf3f5ad0ce5bfa42b335aac5b450c1e8b768337c59d7c46ecaf8');
});
