/**
 * Adapted from WordWeave's `shared/lib/classNames/classNames.ts` (see CLAUDE.md →
 * "Styling approach"). Joins a base class with boolean modifier classes and any
 * extra classes, skipping falsy ones — the backbone of every variant-composition
 * component in `shared/ui`.
 */
export type Mods = Record<string, boolean | undefined>;

export function classNames(
  base: string,
  mods: Mods = {},
  additional: Array<string | undefined> = [],
): string {
  return [
    base,
    ...additional.filter(Boolean),
    ...Object.entries(mods)
      .filter(([, value]) => Boolean(value))
      .map(([className]) => className),
  ].join(" ");
}
