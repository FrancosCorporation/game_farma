import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = readFileSync(new URL('../plan.md', import.meta.url), 'utf8');
const summary = readFileSync(new URL('../resumo.md', import.meta.url), 'utf8');
const lines = plan.split(/\r?\n/).filter((line) => /^\| FC-\d{3} \|/.test(line));
const rows = lines.map((line) => {
  const cells = line.split('|').map((cell) => cell.trim());
  return {
    id: cells[1],
    priority: cells[3],
    dependencies: [...(cells[5] ?? '').matchAll(/FC-\d{3}/g)].map((match) => match[0]),
    status: cells[7] ?? '',
  };
});

const ids = rows.map((row) => row.id);
assert.equal(new Set(ids).size, rows.length, 'FC IDs are unique');
const byId = new Map(rows.map((row) => [row.id, row]));
for (const row of rows) {
  for (const dependency of row.dependencies) {
    assert.ok(byId.has(dependency), `${row.id} dependency ${dependency} exists`);
    assert.notEqual(dependency, row.id, `${row.id} does not depend on itself`);
  }
}

const visited = new Set();
const visiting = new Set();
function visit(id) {
  assert.ok(!visiting.has(id), `dependency graph has no cycle at ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of byId.get(id).dependencies) visit(dependency);
  visiting.delete(id);
  visited.add(id);
}
for (const id of ids) visit(id);

const actual = {
  total: rows.length,
  priorities: Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((priority) => [
    priority,
    rows.filter((row) => row.priority === priority).length,
  ])),
  statuses: {
    pending: rows.filter((row) => row.status.startsWith('Pendente')).length,
    partial: rows.filter((row) => row.status.startsWith('Parcial')).length,
    blocked: rows.filter((row) => row.status.startsWith('Bloqueado')).length,
    complete: rows.filter((row) => row.status.startsWith('Concluído')).length,
  },
};

const planCounts = plan.match(
  /\*\*(\d+) objetivos de game no catálogo ativo\.\*\*.*?Prioridades: \*\*P0: (\d+), P1: (\d+), P2: (\d+), P3: (\d+)\*\*\. Estados dos objetivos de game: \*\*Pendente: (\d+), Parcial: (\d+), Bloqueado externo: (\d+), Concluído: (\d+)\*\*/,
);
assert.ok(planCounts, 'plan has one parseable current catalog summary');
assert.deepEqual([
  Number(planCounts[1]), Number(planCounts[2]), Number(planCounts[3]), Number(planCounts[4]),
  Number(planCounts[5]), Number(planCounts[6]), Number(planCounts[7]), Number(planCounts[8]), Number(planCounts[9]),
], [
  actual.total, actual.priorities.P0, actual.priorities.P1, actual.priorities.P2, actual.priorities.P3,
  actual.statuses.pending, actual.statuses.partial, actual.statuses.blocked, actual.statuses.complete,
], 'plan summary matches the catalog rows');

const resumeCounts = summary.match(
  /O catálogo ativo em `plan\.md` contém (\d+) objetivos de game: P0=(\d+), P1=(\d+), P2=(\d+), P3=(\d+); (\d+) pendentes?, (\d+) parciais?, (\d+) bloqueios? externos? e (\d+) concluídos?\./,
);
assert.ok(resumeCounts, 'resumo has a parseable current catalog summary');
assert.deepEqual([
  Number(resumeCounts[1]), Number(resumeCounts[2]), Number(resumeCounts[3]), Number(resumeCounts[4]),
  Number(resumeCounts[5]), Number(resumeCounts[6]), Number(resumeCounts[7]), Number(resumeCounts[8]), Number(resumeCounts[9]),
], [
  actual.total, actual.priorities.P0, actual.priorities.P1, actual.priorities.P2, actual.priorities.P3,
  actual.statuses.pending, actual.statuses.partial, actual.statuses.blocked, actual.statuses.complete,
], 'resumo current count matches the plan and catalog rows');

console.log(`PASS roadmap catalog: ${actual.total} unique IDs, priority/status counts synchronized, dependencies valid and acyclic`);
