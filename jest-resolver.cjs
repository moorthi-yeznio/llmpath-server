const fs = require('fs');
const path = require('path');

/**
 * Maps relative `./foo.js` / `../foo.js` imports to sibling `.ts` when present (NodeNext-style).
 * Avoids broad moduleNameMapper rules that break node_modules (e.g. `./identifier.js`).
 */
module.exports = (request, options) => {
  const defaultResolver = options.defaultResolver;
  if (
    typeof request === 'string' &&
    request.endsWith('.js') &&
    request.startsWith('.') &&
    options.basedir
  ) {
    const candidate = path.resolve(options.basedir, request);
    const tsPath = candidate.replace(/\.js$/, '.ts');
    if (fs.existsSync(tsPath)) {
      return defaultResolver(tsPath, options);
    }
  }
  return defaultResolver(request, options);
};
