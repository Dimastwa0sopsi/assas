/** Резолв/лоад-хуки: подмена 'three' и пустые CSS-модули. */
import { pathToFileURL } from 'node:url';

const stub = pathToFileURL(new URL('./three-stub.mjs', import.meta.url).pathname).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: stub, shortCircuit: true, format: 'module' };
  if (specifier.endsWith('.css')) return { url: 'gimverse:empty-css', shortCircuit: true, format: 'module' };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === 'gimverse:empty-css') return { format: 'module', source: 'export default {};', shortCircuit: true };
  return next(url, context);
}
