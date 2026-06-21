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
  'update-restore-state.ts',
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
    URL,
  });
  return module.exports;
}

const {
  createUpdateRestoreSnapshot,
  parseUpdateRestoreSnapshot,
  resolveUpdateRestoreDestination,
  serializeUpdateRestoreSnapshot,
} = loadTsModule(modulePath);

const now = 1_800_000;

const meetingSnapshot = createUpdateRestoreSnapshot({
  pathname: '/meeting-details',
  search: '?id=meeting-123&source=recording',
  currentMeeting: { id: 'meeting-123', title: 'Weekly Review' },
  savedAt: now,
});

assert.deepEqual(
  JSON.parse(JSON.stringify(meetingSnapshot)),
  {
    pathname: '/meeting-details',
    search: '?id=meeting-123&source=recording',
    currentMeeting: { id: 'meeting-123', title: 'Weekly Review' },
    savedAt: now,
  },
  'restore snapshots should preserve route, query, selected meeting, and timestamp',
);

assert.equal(
  resolveUpdateRestoreDestination(meetingSnapshot, now + 1000),
  '/meeting-details?id=meeting-123&source=recording',
  'fresh meeting snapshots should restore the full in-app destination',
);

const serialized = serializeUpdateRestoreSnapshot(meetingSnapshot);
assert.deepEqual(
  JSON.parse(JSON.stringify(parseUpdateRestoreSnapshot(serialized))),
  JSON.parse(JSON.stringify(meetingSnapshot)),
  'snapshots should round-trip through JSON storage',
);

assert.equal(
  resolveUpdateRestoreDestination(meetingSnapshot, now + 31 * 60 * 1000),
  null,
  'stale restore snapshots should be ignored',
);

assert.equal(
  resolveUpdateRestoreDestination({
    pathname: 'https://example.com/phish',
    search: '',
    savedAt: now,
  }, now),
  null,
  'absolute external URLs should not be restored',
);

assert.equal(
  resolveUpdateRestoreDestination({
    pathname: '//example.com/phish',
    search: '',
    savedAt: now,
  }, now),
  null,
  'protocol-relative external URLs should not be restored',
);

assert.equal(
  resolveUpdateRestoreDestination({
    pathname: '/admin',
    search: '?id=meeting-123',
    savedAt: now,
  }, now),
  '/',
  'unknown in-app routes should fall back to home',
);

assert.equal(
  parseUpdateRestoreSnapshot('{bad json'),
  null,
  'invalid storage payloads should parse to null',
);
