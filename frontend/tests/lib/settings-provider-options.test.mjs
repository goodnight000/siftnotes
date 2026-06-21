import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
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
  'settings-provider-options.ts',
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

const {
  getAdvancedTranscriptionProviderOptions,
  getDefaultSummaryModel,
  getDefaultTranscriptionModel,
  getDefaultTranscriptionProvider,
  getPrimarySummaryProviderOptions,
  getPrimaryTranscriptionProviderOptions,
  isCloudTranscriptionProvider,
  resolveApiFirstSummaryConfig,
  resolveApiFirstTranscriptionConfig,
} = loadTsModule(modulePath);

function optionValues(options) {
  return Array.from(options, (option) => option.value);
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

test('transcription settings list API providers first and local models as advanced fallback', () => {
  assert.deepEqual(
    optionValues(getPrimaryTranscriptionProviderOptions()),
    ['elevenLabs', 'groq', 'openai']
  );
  assert.equal(getDefaultTranscriptionProvider().value, 'elevenLabs');
  assert.deepEqual(
    optionValues(getAdvancedTranscriptionProviderOptions()),
    ['parakeet', 'localWhisper']
  );
  assert.equal(getDefaultTranscriptionModel('elevenLabs'), 'scribe_v2');
});

test('summary settings list cloud API providers before local/offline providers', () => {
  assert.deepEqual(
    optionValues(getPrimarySummaryProviderOptions()),
    ['openrouter', 'custom-openai', 'openai', 'claude', 'groq']
  );
  assert.equal(getDefaultSummaryModel('openrouter'), 'openai/gpt-4o-mini');
});

test('old local transcription settings resolve to ElevenLabs Scribe', () => {
  assert.deepEqual(
    plainObject(resolveApiFirstTranscriptionConfig({
      provider: 'parakeet',
      model: 'parakeet-tdt-0.6b-v3-int8',
      apiKey: null,
    })),
    {
      provider: 'elevenLabs',
      model: 'scribe_v2',
      apiKey: null,
    },
  );
});

test('recording preflight treats API transcription providers as cloud-backed', () => {
  assert.equal(isCloudTranscriptionProvider('elevenLabs'), true);
  assert.equal(isCloudTranscriptionProvider('groq'), true);
  assert.equal(isCloudTranscriptionProvider('openai'), true);
  assert.equal(isCloudTranscriptionProvider('parakeet'), false);
  assert.equal(isCloudTranscriptionProvider('localWhisper'), false);
});

test('old local summary settings resolve to OpenRouter', () => {
  assert.deepEqual(
    plainObject(resolveApiFirstSummaryConfig({
      provider: 'builtin-ai',
      model: 'qwen3.5:4b',
      whisperModel: 'large-v3',
      apiKey: null,
      ollamaEndpoint: null,
    })),
    {
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      whisperModel: 'large-v3',
      apiKey: null,
      ollamaEndpoint: null,
    },
  );
});
