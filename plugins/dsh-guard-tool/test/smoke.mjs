import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createToolSpec } from '../spec.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', '..', '..', 'tests', 'fixtures')

test('the tool advertises a name, a description and a required target', () => {
  const tool = createToolSpec()
  assert.equal(tool.name, 'plugin_guard')
  assert.equal(typeof tool.description, 'string')
  assert.equal(tool.parameters.target.required, true)
  assert.equal(tool.parameters.target.type, 'string')
})

test('a clean plugin passes', async () => {
  const result = await createToolSpec().execute({ target: join(fixtures, 'clean-plugin') })
  assert.equal(result.verdict, 'pass')
  assert.equal(result.score, 100)
  assert.equal(result.high, 0)
  assert.match(result.report, /PASS/)
})

test('a dangerous plugin fails and says why', async () => {
  const result = await createToolSpec().execute({ target: join(fixtures, 'dangerous-api') })
  assert.equal(result.verdict, 'fail')
  assert.ok(result.high > 0)
  assert.ok(result.findings.length > 0)
  assert.match(result.findings[0], /^HIGH {2}/)
})

test('json returns the machine-readable report', async () => {
  const result = await createToolSpec().execute({ target: join(fixtures, 'clean-plugin'), json: true })
  const parsed = JSON.parse(result.report)
  assert.equal(parsed.schemaVersion, 1)
  assert.equal(parsed.summary.verdict, 'pass')
})

test('a missing target is an error with the next step in the message', async () => {
  await assert.rejects(createToolSpec().execute({ target: join(fixtures, 'nope') }), /No directory at|Check the path/)
})

test('apply() registers the tool through the real defineTool', async () => {
  const { apply, inject, name } = await import('../index.js')
  assert.equal(name, 'dsh-plugin-guard-tool')
  assert.deepEqual(inject, ['tools'])
  let registered = null
  apply({ tools: { register: (definition) => { registered = definition } } })
  assert.ok(registered, 'a tool definition was registered')
  assert.equal(registered.name, 'plugin_guard')
})
