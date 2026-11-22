/* DHL Payroll Answers - public page behaviour.
   Plain DOM, no framework. Everything is built from the shared store so the page
   and the admin screens can never disagree about what an answer says. */
(function () {
  'use strict';

  var S = window.PayrollStore;
  if (!S) { return; }

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    try {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return d.toDateString();
    }
  }

  var CHEVRON = '<svg class="row__chev" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">' +
    '<path d="M4.5 7 9 11.5 13.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var listEl = el('faqList');
  var searchEl = el('faqSearch');
  var askText = el('askText');
  var askNote = el('askNote');

  var openId = null;
  var visibility = 'public';
  var query = '';

  function publishedTotal() {
    return S.listFaqs({ publishedOnly: true }).length;
  }

  function paintHeader() {
    var total = publishedTotal();
    el('bannerText').textContent = total === 1
      ? '1 answer is already published'
      : total + ' answers are already published';

    var pending = S.countPending();
    var badge = el('pendingCount');
    if (pending > 0) {
      badge.textContent = pending;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function emptyState() {
    if (query) {
      return '<div class="empty">' +
        '<p class="empty__title">Nothing matches &ldquo;' + esc(query) + '&rdquo; yet</p>' +
        '<p class="empty__body">Try a shorter word, or type the question in the box at the top of the page and Emma will come back to you.</p>' +
        '</div>';
    }
    return '<div class="empty">' +
      '<p class="empty__title">No answers published yet</p>' +
      '<p class="empty__body">Ask a question above and Emma can publish the answer here for everyone.</p>' +
      '</div>';
  }

  function rowHtml(faq) {
    var open = openId === faq.id;
    return '<div class="row">' +
      '<button class="row__btn" type="button" data-id="' + esc(faq.id) + '"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '"' +
        ' aria-controls="panel-' + esc(faq.id) + '">' +
        '<span>' + esc(faq.question) + '</span>' + CHEVRON +
      '</button>' +
      '<div class="row__panel" id="panel-' + esc(faq.id) + '"' + (open ? '' : ' hidden') + '>' +
        '<p>' + esc(faq.answer) + '</p>' +
        '<p class="row__updated">Last updated ' + esc(formatDate(faq.updatedAt)) + '</p>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var rows = S.listFaqs({ publishedOnly: true, query: query });
    var total = publishedTotal();

    el('faqCount').textContent = query
      ? rows.length + ' of ' + total + (rows.length === 1 ? ' match' : ' match')
      : (total === 1 ? '1 answer published' : total + ' answers published');

    if (!rows.length) {
      listEl.innerHTML = emptyState();
      openId = null;
      return;
    }

    var groups = [];
    var index = {};
    for (var i = 0; i < rows.length; i++) {
      var faq = rows[i];
      if (!index[faq.category]) {
        index[faq.category] = { name: faq.category, items: [] };
        groups.push(index[faq.category]);
      }
      index[faq.category].items.push(faq);
    }

    var html = '';
    for (var g = 0; g < groups.length; g++) {
      var parts = [];
      for (var k = 0; k < groups[g].items.length; k++) { parts.push(rowHtml(groups[g].items[k])); }
      html += '<section class="cat">' +
        '<h3 class="cat__name">' + esc(groups[g].name) + '</h3>' +
        '<div class="rows">' + parts.join('') + '</div>' +
      '</section>';
    }
    listEl.innerHTML = html;
  }

  function setRow(button, open) {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    var panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) { return; }
    if (open) { panel.removeAttribute('hidden'); } else { panel.setAttribute('hidden', ''); }
  }

  function toggleRow(button) {
    var id = button.getAttribute('data-id');
    if (!id) { return; }
    var willOpen = openId !== id;

    /* One answer at a time: close whatever else is open first. */
    var all = listEl.querySelectorAll('.row__btn');
    for (var i = 0; i < all.length; i++) {
      if (all[i] !== button && all[i].getAttribute('aria-expanded') === 'true') { setRow(all[i], false); }
    }
    setRow(button, willOpen);
    openId = willOpen ? id : null;
  }

  function showNote(message, kind) {
    askNote.textContent = message;
    askNote.className = 'form-note form-note--' + (kind === 'err' ? 'err' : 'ok');
    askNote.hidden = false;
  }

  function updateCount() {
    el('askCount').textContent = askText.value.length + ' of 500';
  }

  function setVisibility(next) {
    visibility = next;
    el('visPublic').setAttribute('aria-pressed', next === 'public' ? 'true' : 'false');
    el('visPrivate').setAttribute('aria-pressed', next === 'private' ? 'true' : 'false');
    el('visNote').textContent = next === 'public'
      ? 'Public questions can be added to the FAQ once they are answered, so the next person finds the answer without asking.'
      : 'Private questions go to Emma only. Nothing from a private question is published.';
  }

  listEl.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node !== listEl) {
      if (node.classList && node.classList.contains('row__btn')) { toggleRow(node); return; }
      node = node.parentNode;
    }
  });

  searchEl.addEventListener('input', function () {
    query = searchEl.value.trim();
    render();
  });

  /* The full placeholder needs the width of a desktop field. On a phone the
     shortcut chip owns the right end of the box, so the hint shortens to fit
     the room that is left instead of being clipped mid-word. */
  var widePlaceholder = searchEl.getAttribute('placeholder');
  var narrowSearch = window.matchMedia('(max-width: 420px)');
  function fitPlaceholder() {
    searchEl.setAttribute('placeholder', narrowSearch.matches ? 'Search FAQs' : widePlaceholder);
  }
  fitPlaceholder();
  if (narrowSearch.addEventListener) {
    narrowSearch.addEventListener('change', fitPlaceholder);
  } else if (narrowSearch.addListener) {
    narrowSearch.addListener(fitPlaceholder);
  }

  /* "/" jumps into the search box and Escape backs out of it. Neither key is
     taken away from somebody who is already writing a question. */
  function isTextField(node) {
    if (!node || node.nodeType !== 1) { return false; }
    var tag = node.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select' || node.isContentEditable) { return true; }
    if (tag !== 'input') { return false; }
    var type = (node.getAttribute('type') || 'text').toLowerCase();
    return type !== 'checkbox' && type !== 'radio' && type !== 'button'
      && type !== 'submit' && type !== 'reset' && type !== 'range' && type !== 'file';
  }

  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) { return; }

    if (event.key === '/') {
      if (isTextField(event.target) || isTextField(document.activeElement)) { return; }
      event.preventDefault();
      searchEl.focus();
      var end = searchEl.value.length;
      try { searchEl.setSelectionRange(end, end); } catch (err) { /* not every engine allows it */ }
      return;
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      if (document.activeElement !== searchEl) { return; }
      event.preventDefault();
      searchEl.value = '';
      query = '';
      render();
      searchEl.blur();
    }
  });

  askText.addEventListener('input', updateCount);

  el('askForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var result = S.addQuestion({ text: askText.value, visibility: visibility });
    if (!result.ok) { showNote(result.error, 'err'); return; }
    askText.value = '';
    updateCount();
    showNote(visibility === 'public'
      ? 'Sent. Emma has it, and she can publish the answer here once she has replied.'
      : 'Sent. Emma has it, and only she will see it.', 'ok');
    paintHeader();
  });

  el('visPublic').addEventListener('click', function () { setVisibility('public'); });
  el('visPrivate').addEventListener('click', function () { setVisibility('private'); });

  /* If the admin edits in another tab, pull the public page back in step. */
  window.addEventListener('storage', function (event) {
    if (event.key && event.key.indexOf('dhl-payroll-faq') === 0) { window.location.reload(); }
  });

  paintHeader();
  updateCount();
  render();
})();
