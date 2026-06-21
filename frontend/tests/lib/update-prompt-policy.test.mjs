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

const { getUpdateAction, shouldOpenUpdateDialog } = loadTsModule(modulePath);

assert.equal(
  getUpdateAction({
    mode: 'startup',
    updateInfo: { available: true },
    isRecording: false,
  }),
  'install-silently',
  'startup checks should install available updates silently when recording is inactive',
);

assert.equal(
  getUpdateAction({
    mode: 'interactive',
    updateInfo: { available: true },
    isRecording: false,
  }),
  'prompt',
  'interactive checks should prompt for available updates',
);

assert.equal(
  getUpdateAction({
    mode: 'startup',
    updateInfo: { available: true },
    isRecording: true,
  }),
  'blocked-by-recording',
  'startup checks should not install while recording',
);

assert.equal(
  getUpdateAction({
    mode: 'interactive',
    updateInfo: { available: true },
    isRecording: true,
  }),
  'blocked-by-recording',
  'interactive checks should not install while recording',
);

assert.equal(
  getUpdateAction({
    mode: 'startup',
    updateInfo: { available: false },
    isRecording: false,
  }),
  'none',
  'checks with no available update should do nothing',
);

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
