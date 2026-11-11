/// <reference types="node" />
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import path from 'path'

import { legalLinks, TERMS_OF_USE_URL } from '@/lib/legal'

describe('legal links', () => {
  it("terms of use is Apple's standard EULA", () => {
    expect(TERMS_OF_USE_URL).toBe('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')
  })

  it('Settings lists privacy policy and terms of use', () => {
    expect(legalLinks('ahoy.example')).toEqual([
      { label: 'Privacy policy', url: 'https://ahoy.example/privacy' },
      { label: 'Terms of use', url: TERMS_OF_USE_URL },
    ])
  })

  it('the links/ site privacy page links the same terms', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../links/privacy.html'), 'utf8')
    expect(html).toContain(`href="${TERMS_OF_USE_URL}"`)
  })
})
