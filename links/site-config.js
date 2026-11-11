// Values Duncan fills in once the accounts exist (store/launch docs:
// mobile/store/). Empty = the page shows "coming soon" instead of a link.
// Loaded by index.html, add.html and support.html.
window.AHOY_SITE = {
  // https://testflight.apple.com/join/XXXXXXXX (TestFlight -> external group -> Public Link)
  testflight: '',
  // Play internal test: Play Console -> Testing -> Internal testing -> Testers -> "Copy link"
  // (https://play.google.com/apps/internaltest/...), later the store URL.
  play: '',
  // https://apps.apple.com/app/id0000000000 once there's a public App Store listing.
  appstore: '',
  // Support contact shown on /support. Leave empty to show only the in-app route.
  supportEmail: '',
}

// Fills every [data-store="testflight|play|appstore"] link and
// [data-support-email] element from AHOY_SITE.
document.addEventListener('DOMContentLoaded', function () {
  var site = window.AHOY_SITE
  document.querySelectorAll('[data-store]').forEach(function (el) {
    var url = site[el.getAttribute('data-store')]
    if (url) {
      el.href = url
      el.removeAttribute('aria-disabled')
      el.textContent = el.textContent.replace(' (coming soon)', '')
    }
  })
  document.querySelectorAll('[data-support-email]').forEach(function (el) {
    if (site.supportEmail) {
      var a = document.createElement('a')
      a.href = 'mailto:' + site.supportEmail
      a.textContent = site.supportEmail
      el.replaceChildren(a)
    }
  })
})
