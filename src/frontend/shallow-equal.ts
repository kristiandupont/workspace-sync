/**
 * Compares own enumerable properties with `Object.is`. Pass as the `isEqual`
 * argument of `useWorkspaceSelector` when the selector builds a fresh object or
 * array each run (`w => ({ a: w.a, b: w.b })`), which `Object.is` would treat
 * as changed every time.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}
