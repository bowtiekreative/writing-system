/*
 * Progressive enhancement only. Every page works with this file blocked:
 * the menu is a native <details>, the filters are a GET form, the engine is a POST form.
 */
(function () {
  'use strict'

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  // Close the mega menu on Escape, and when focus leaves it.
  var menu = document.getElementById('menu')
  if (menu) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false
        var summary = menu.querySelector('summary')
        if (summary) summary.focus()
      }
    })
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false
    })
    menu.addEventListener('toggle', function () {
      var summary = menu.querySelector('summary')
      if (summary) summary.setAttribute('aria-expanded', menu.open ? 'true' : 'false')
    })
    var summary = menu.querySelector('summary')
    if (summary) summary.setAttribute('aria-expanded', 'false')
  }

  // Reveal on entry: 24px rise, 600ms ease-out, 90ms sibling stagger.
  // Reduced motion gets the finished state immediately, never a shortened animation.
  if (!reduced.matches && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('section .card, section .panel, .steps > li')
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('reveal') })
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return
        var siblings = Array.prototype.slice.call(entry.target.parentNode.children)
        var i = siblings.indexOf(entry.target)
        entry.target.style.transitionDelay = Math.min(i, 6) * 90 + 'ms'
        entry.target.classList.add('is-in')
        io.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 })
    Array.prototype.forEach.call(targets, function (el) { io.observe(el) })
  }

  // Rule browser: submit on select change, so filtering takes one interaction not two.
  var filterForm = document.querySelector('form[action="/rules"]')
  if (filterForm) {
    Array.prototype.forEach.call(filterForm.querySelectorAll('select'), function (sel) {
      sel.addEventListener('change', function () { filterForm.submit() })
    })
  }

  // After the engine posts, put focus on the result so screen-reader users land on it.
  if (window.location.hash === '#result') {
    var result = document.getElementById('result')
    if (result) {
      result.setAttribute('tabindex', '-1')
      result.focus({ preventScroll: true })
    }
  }
})()
