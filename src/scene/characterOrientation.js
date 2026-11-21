export function verticalAxisCorrection(size) {
  const y = Number(size?.y);
  const z = Number(size?.z);
  return Number.isFinite(y) && Number.isFinite(z) && z > y * 1.5
    ? -Math.PI / 2
    : 0;
}
