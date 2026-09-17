// Emits the module record a dedicated redeployment binds against, derived from the human
// deployment record rather than hand-written, so the arcade can never be wired to a module the
// human application has not already qualified.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const HUMAN = '0x78d3341e3452d7ec1add9371de3008639eed8eb0';
const source = JSON.parse(await readFile('deployments/chaos-events.json', 'utf8'));

assert.equal(String(source.game?.app).toLowerCase(), HUMAN, 'Bind only to the qualified human deployment');
assert.equal(source.game?.releaseStatus, 'qualified-chaos-events', 'The source record must be a qualified release');
const address = /^0x[\da-fA-F]{40}$/;
for (const [name, value] of Object.entries(source.modules ?? {})) {
  assert(address.test(String(value)), `Module ${name} is not an address`);
}
assert(address.test(String(source.flow)), 'The game flow library is not an address');
assert(address.test(String(source.modules?.ChaosEngine)), 'ChaosEngine is required');

const record = {app: source.game.app, modules: source.modules, flow: source.flow, qualifiedAt: source.qualifiedAt};
await mkdir('artifacts/agents', {recursive: true});
await writeFile('artifacts/agents/qualified-modules.json', JSON.stringify(record, null, 2));
console.log(JSON.stringify({app: record.app, flow: record.flow, engine: record.modules.ChaosEngine, modules: Object.keys(record.modules).length}));
