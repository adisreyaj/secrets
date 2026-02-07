import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createDebugLogger, redactDebugData } from '../dist/log.mjs'

test('redactDebugData redacts sensitive fields and truncates long strings', () => {
  const long = 'x'.repeat(2500)
  const data = redactDebugData({
    authorization: 'Bearer abc',
    nested: {
      token: 'top-secret',
      normal: 'ok',
    },
    cookie: 'session=abc',
    text: long,
  })

  assert.equal(data.authorization, '[REDACTED]')
  assert.equal(data.cookie, '[REDACTED]')
  assert.equal(data.nested.token, '[REDACTED]')
  assert.equal(data.nested.normal, 'ok')
  assert.match(String(data.text), /truncated/) 
})

test('createDebugLogger disabled mode is no-op', () => {
  const logger = createDebugLogger(false)
  assert.doesNotThrow(() => logger('event', { token: 'abc' }))
})

test('login --debug logs fetch diagnostics to stderr', () => {
  const result = spawnSync(
    process.execPath,
    ['dist/index.mjs', 'login', '--debug', '--base-url', 'http://127.0.0.1:1'],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, SECRETS_TOKEN: '' },
      encoding: 'utf-8',
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /\[debug .*http.request/) 
  assert.match(result.stderr, /\[debug .*http.network_error/) 
  assert.doesNotMatch(result.stderr, /Tip: rerun with --debug/) 
})

test('SECRETS_DEBUG=1 enables debug output without --debug flag', () => {
  const result = spawnSync(
    process.execPath,
    ['dist/index.mjs', 'login', '--base-url', 'http://127.0.0.1:1'],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, SECRETS_DEBUG: '1' },
      encoding: 'utf-8',
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /\[debug .*http.request/) 
  assert.doesNotMatch(result.stderr, /Tip: rerun with --debug/) 
})
