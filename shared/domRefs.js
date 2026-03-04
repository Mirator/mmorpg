// @ts-check

/**
 * @param {{ getElementById: (id: string) => unknown }} root
 * @param {Record<string, string>} refs
 */
export function bindElementRefs(root, refs) {
  return Object.fromEntries(
    Object.entries(refs).map(([key, id]) => [key, root.getElementById(id)])
  );
}

/**
 * @param {{ querySelectorAll: (selector: string) => unknown }} root
 * @param {Record<string, string>} refs
 */
export function bindQueryRefs(root, refs) {
  return Object.fromEntries(
    Object.entries(refs).map(([key, selector]) => [key, root.querySelectorAll(selector)])
  );
}
