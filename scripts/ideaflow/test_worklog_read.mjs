import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { signEvent } from '/home/dev/code/paseo-buzz-bridge-20261114/listener/subscription.mjs';
import { readAuxiliary } from './worklog_read.mjs';
const require = createRequire('/home/dev/code/paseo-buzz-bridge-20261114/listener/subscription.mjs');
const { schnorr } = require('@noble/curves/secp256k1');
const key = Buffer.alloc(32, 1); // Synthetic test key, never a real identity.
const pubkey = Buffer.from(schnorr.getPublicKey(key)).toString('hex');
const channel = 'ad66b837-7232-4fa0-b41f-cbc49d415b0b';
const message = signEvent({ pubkey, kind: 9, created_at: 100, tags: [['h', channel]], content: 'SYNTHETIC_BODY' }, key);
const reaction = signEvent({ pubkey, kind: 7, created_at: 101, tags: [['e', message.id], ['p', pubkey]], content: '⏳' }, key);
test('valid signed h-less reaction preserves its original tags/signature', async () => {
  let filter;
  const rows = await readAuxiliary([message], 200, async filters => { filter = filters[0]; return [reaction]; });
  assert.deepEqual(rows, [reaction]);
  assert.equal(rows[0].tags.some(t => t[0] === 'h'), false);
  assert.deepEqual(filter['#e'], [message.id]);
  assert.deepEqual(filter.kinds, [7, 40003]);
});
test('wrong target, channel or altered signed content fails closed', async () => {
  const bad = [
    signEvent({ ...reaction, tags: [['e', 'f'.repeat(64)]] }, key),
    signEvent({ ...reaction, tags: [['e', message.id], ['h', '11111111-1111-4111-8111-111111111111']] }, key),
    { ...reaction, content: '✅' },
  ];
  for (const row of bad) await assert.rejects(readAuxiliary([message], 200, async () => [row]));
});
test('a saturated same-second page reports incomplete history', async () => {
  await assert.rejects(readAuxiliary([message], 102, async () => Array(200).fill(reaction)), /saturated/);
});
