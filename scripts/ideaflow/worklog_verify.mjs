// Uses the bridge's existing, aged Schnorr implementation; no dependency update.
import { verifyEvent } from '/home/dev/code/paseo-buzz-bridge-20261114/listener/subscription.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const rows = JSON.parse(input);
  if (!Array.isArray(rows) || !rows.every(verifyEvent)) throw Error('signature');
  process.stdout.write(JSON.stringify(rows.map(e => e.id)));
} catch {
  process.stderr.write('Signed event verification failed\n');
  process.exitCode = 1;
}
