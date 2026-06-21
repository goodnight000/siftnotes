import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const modulePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'lib',
  'update-prompt-policy.ts',
);
const require = createRequire(import.meta.url);

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require,
  });
  return module.exports;
}

const { shouldOpenUpdateDialog } = loadTsModule(modulePath);

assert.equal(
  shouldOpenUpdateDialog({ available: true }),
  true,
  'available updates should open the update dialog automatically',
);

assert.equal(
  shouldOpenUpdateDialog({ available: false }),
  false,
  'no-update checks should not open the update dialog',
);

assert.equal(
  shouldOpenUpdateDialog(null),
  false,
  'missing update info should not open the update dialog',
);
