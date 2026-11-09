/** Minimal configuration helpers used by the vendored ACP runtime. */
export const EFFORTS = ['low', 'medium', 'high'];
export const Config = {};
export function current(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get();
  return value;
}
export function asEffort(value) {
  return EFFORTS.includes(value ?? '') ? value : undefined;
}