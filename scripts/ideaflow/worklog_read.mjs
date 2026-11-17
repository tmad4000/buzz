// Read only signed auxiliary events through the existing authenticated /query.
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { signEvent, verifyEvent } from '/home/dev/code/paseo-buzz-bridge-20261114/listener/subscription.mjs';

const RELAY = 'https://jprojects.communities.buzz.xyz';
const ROOT = '38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb';
const CHANNELS = new Set(['ad66b837-7232-4fa0-b41f-cbc49d415b0b', '53e03008-6a6b-4ba2-a67c-7085ac0e9253']);
const values = (e, name) => e.tags.filter(t => t[0] === name && t.length >= 2).map(t => t[1]);

export async function readAuxiliary(messages, until, query) {
  const allowed = ['ad66b837-7232-4fa0-b41f-cbc49d415b0b', '53e03008-6a6b-4ba2-a67c-7085ac0e9253'];
  if (!Array.isArray(messages) || messages.length > 10000 || !Number.isSafeInteger(until) || until < 0 ||
      !messages.every(e => e.kind === 9 && verifyEvent(e) && e.tags.filter(t => t[0] === 'h').length === 1 &&
        allowed.includes(e.tags.find(t => t[0] === 'h')?.[1]))) throw Error('source binding');
  if (!Array.isArray(messages) || messages.length > 10000 || !Number.isSafeInteger(until)) throw Error('scope');
  const scopes = new Map();
  for (const event of messages) {
    const h = values(event, 'h');
    if (!verifyEvent(event) || event.kind !== 9 || h.length !== 1 || !CHANNELS.has(h[0])) throw Error('message');
    scopes.set(event.id, h[0]);
  }
  const ids = [...scopes.keys()];
  const result = new Map();
  for (let start = 0; start < ids.length; start += 50) {
    const targets = ids.slice(start, start + 50);
    let before = until;
    for (let page = 0; ; page++) {
      if (page >= 1000) throw Error('bound');
      const rows = await query([{ kinds: [7, 40003], '#e': targets, since: 0, until: before, limit: 200 }]);
      if (!Array.isArray(rows) || rows.length > 200) throw Error('response');
      for (const event of rows) {
        const references = values(event, 'e');
        const h = values(event, 'h');
        if (!verifyEvent(event) || ![7, 40003].includes(event.kind) || references.length !== 1 || !targets.includes(references[0]) ||
            event.created_at < 0 || event.created_at > before || h.length > 1 || (h.length && h[0] !== scopes.get(references[0]))) throw Error('auxiliary');
        // Keep signed tags untouched: scope comes from the verified target.
        result.set(event.id, event);
      }
      if (rows.length < 200) break;
      const oldest = Math.min(...rows.map(e => e.created_at));
      if (oldest + 1 >= before) throw Error('saturated');
      before = oldest + 1;
    }
  }
  return [...result.values()];
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > 16 * 1024 * 1024) throw Error('input bound');
  }
  const input = JSON.parse(text);
  const file = '/home/dev/code/paseo-buzz-bridge-20261114/identity/private-key';
  if (fs.statSync(file).mode & 0o077) throw Error('key permissions');
  const key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  if (key.length !== 32) throw Error('key');
  const query = async filters => {
    const body = JSON.stringify(filters);
    const auth = signEvent({ pubkey: ROOT, created_at: Math.floor(Date.now() / 1000), kind: 27235,
      tags: [['u', RELAY + '/query'], ['method', 'POST'], ['nonce', randomUUID()],
        ['payload', createHash('sha256').update(body).digest('hex')]], content: '' }, key);
    if (!verifyEvent(auth)) throw Error('identity');
    const response = await fetch(RELAY + '/query', { method: 'POST', redirect: 'error',
      headers: { Authorization: 'Nostr ' + Buffer.from(JSON.stringify(auth)).toString('base64'), 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('query');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      chunks.push(Buffer.from(chunk));
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw Error('response bound');
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  process.stdout.write(JSON.stringify(await readAuxiliary(input.messages, input.until, query)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => {
  process.stderr.write('Scoped Buzz auxiliary read failed; no source text or credentials logged\n');
  process.exitCode = 1;
});
