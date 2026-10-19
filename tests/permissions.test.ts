import { describe, expect, it } from 'vitest'
import {
  emptyPermissions,
  grantedCapabilities,
  PERMISSIONS_SPEC_VERSION,
  validatePermissions,
} from '../src/permissions/schema.js'

describe('dsh.permissions schema', () => {
  it('accepts the empty declaration the init template writes', () => {
    const result = validatePermissions(emptyPermissions())
    expect(result.ok).toBe(true)
    expect(PERMISSIONS_SPEC_VERSION).toBe(1)
  })

  it('accepts a partial declaration and fills defaults when read', () => {
    const result = validatePermissions({ filesystem: { read: ['notes/*.md'] } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.permissions.filesystem?.read).toEqual(['notes/*.md'])
      expect(result.permissions.shell).toBeUndefined()
    }
  })

  it('rejects unknown keys so typos cannot silently widen access', () => {
    const result = validatePermissions({ filesystem: { read: [], reed: [] } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.path).toBe('filesystem')
  })

  it('rejects wrong types with a path', () => {
    const result = validatePermissions({ shell: { execute: 'yes' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.path).toBe('shell.execute')
  })

  it('lists granted capabilities', () => {
    const capabilities = grantedCapabilities({
      filesystem: { write: ['tmp/**'] },
      shell: { execute: true, allow: ['git'] },
      network: { outbound: ['api.example.com'] },
    })
    expect(capabilities).toEqual(['filesystem.write', 'shell.execute', 'network.outbound'])
  })
})
