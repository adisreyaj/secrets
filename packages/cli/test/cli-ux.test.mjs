import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const run = (args, env = {}) =>
  spawnSync(process.execPath, ['dist/index.mjs', ...args], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, ...env },
    encoding: 'utf-8',
  })

test('--json returns structured error payload', () => {
  const result = run(['wat', '--json'])
  assert.notEqual(result.status, 0)

  const line = result.stderr.trim().split('\n')[0]
  const parsed = JSON.parse(line)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error.code, 'USAGE_ERROR')
})

test('init --yes fails fast without selectors', () => {
  const result = run(['init', '--yes'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Non-interactive mode requires at least one selector/)
})
