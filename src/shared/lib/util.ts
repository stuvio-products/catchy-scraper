/**
 * Returns the key of an enum/object as a string,
 * but typed as the value of that enum.
 */
export function getEnumKeyAsType<T extends object>(
  enumObj: T,
  value: T[keyof T],
): string {
  // Find the key that corresponds to the value provided
  const key = Object.keys(enumObj).find((k) => enumObj[k as keyof T] === value);
  if (!key) {
    return Object.keys(enumObj)[0];
  }
  return key;
}
