import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, summarizeImportResults } from '../dist/env.js';

test('parseEnvFile parses keys and values', () => {
  const raw = `
# Comment
FOO=bar
BAZ="hello world"
EMPTY=
SPACED = value
`;
  const entries = parseEnvFile(raw);
  assert.deepEqual(entries, [
    { key: 'FOO', value: 'bar' },
    { key: 'BAZ', value: 'hello world' },
    { key: 'EMPTY', value: '' },
    { key: 'SPACED', value: 'value' },
  ]);
});

test('summarizeImportResults counts created vs pending', () => {
  const results = [{}, { status: 'pending' }, { status: 'pending' }, {}];
  const summary = summarizeImportResults(results);
  assert.deepEqual(summary, { created: 2, pending: 2 });
});
