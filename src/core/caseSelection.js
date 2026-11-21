/** Build the current phase's case order without mutating its definition. */
export function buildPhaseCaseOrder(phase, cases = []) {
  if (phase?.casos) return [...phase.casos];
  return cases.map((caseDef) => caseDef.id);
}

/** Select the next case ID without taking ownership of phase or progress state. */
export function selectNextCaseId({ pool, completedIds = [], previousCaseId, random = Math.random }) {
  const completed = new Set(completedIds);
  const notCompleted = pool.filter((id) => !completed.has(id));
  if (notCompleted.length > 0) return notCompleted[0];

  let id;
  do {
    id = pool[(random() * pool.length) | 0];
  } while (pool.length > 1 && id === previousCaseId);
  return id;
}
