// Legal links shown in Settings (and mirrored on the links/ site footers).
// Terms of use = Apple's standard EULA (no custom terms); App Store Connect
// will reference the same URL in Phase 6.

export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'

export function privacyPolicyUrl(linksDomain: string): string {
  return `https://${linksDomain}/privacy`
}

export interface LegalLink {
  label: string
  url: string
}

export function legalLinks(linksDomain: string): LegalLink[] {
  return [
    { label: 'Privacy policy', url: privacyPolicyUrl(linksDomain) },
    { label: 'Terms of use', url: TERMS_OF_USE_URL },
  ]
}
