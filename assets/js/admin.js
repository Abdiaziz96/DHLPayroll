/* DHL Payroll Answers - admin behaviour.
   One store, one render loop. Every action writes to the store and then re-renders,
   so the queue counts, the sidebar and the answer list can never drift apart. */
(function () {
  'use strict';

  var S = window.PayrollStore;
  if (!S) { return; }

  var CATS = S.categories();

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closest(node, selector) {
    while (node && node.nodeType === 1) {
      if (node.matches && node.matches(selector)) { return node; }
      node = node.parentNode;
    }
    return null;
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

  function findQuestion(id) {
    var all = S.listQuestions({});
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { return all[i]; } }
    return null;
  }

  function optionsHtml(selected) {
    var out = '';
    for (var i = 0; i < CATS.length; i++) {
      out += '<option value="' + esc(CATS[i]) + '"' + (CATS[i] === selected ? ' selected' : '') + '>' + esc(CATS[i]) + '</option>';
    }
    return out;
  }

  var viewEl = el('view');
  var searchEl = el('adminSearch');

  var view = { kind: 'inbox', category: null };
  var query = '';
  var answeringId = null;
  var editingId = null;
  var confirmingId = null;
  var addingOpen = false;

  var toastTimer = null;
  function toast(message) {
    var node = el('toast');
    node.textContent = message;
    node.setAttribute('data-show', 'true');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { node.removeAttribute('data-show'); }, 3400);
  }

  /* ------------------------------------------------------------------ sidebar */

  function navItem(kind, category, label, count, extraClass) {
    var current = view.kind === kind && (view.category || null) === (category || null);
    return '<button class="a-nav__item" type="button" data-view="' + esc(kind) + '"' +
      ' data-category="' + esc(category || '') + '"' + (current ? ' aria-current="true"' : '') + '>' +
      '<span class="a-nav__label">' + esc(label) + '</span>' +
      '<span class="a-nav__count' + (extraClass ? ' ' + extraClass : '') + '">' + count + '</span>' +
    '</button>';
  }

  function renderNav() {
    var pending = S.listQuestions({ status: 'pending' }).length;
    var answered = S.listQuestions({ status: 'answered' }).length;
    el('navPending').textContent = pending;
    el('navAnsweredCount').textContent = answered;

    el('navInbox').setAttribute('aria-current', view.kind === 'inbox' ? 'true' : 'false');
    el('navAnswered').setAttribute('aria-current', view.kind === 'answered' ? 'true' : 'false');

    var all = S.listFaqs({});
    var counts = {};
    for (var i = 0; i < CATS.length; i++) { counts[CATS[i]] = 0; }
    for (var j = 0; j < all.length; j++) {
      if (counts[all[j].category] === undefined) { counts[all[j].category] = 0; }
      counts[all[j].category] += 1;
    }

    var html = navItem('faq', null, 'All answers', all.length, '');
    for (var k = 0; k < CATS.length; k++) {
      html += navItem('faq', CATS[k], CATS[k], counts[CATS[k]] || 0, '');
    }
    el('navCats').innerHTML = html;
  }

  /* --------------------------------------------------------------- question UI */

  function questionHtml(q) {
    var isPrivate = q.visibility === 'private';
    var open = answeringId === q.id;
    var html = '<article class="qitem">';

    html += '<div class="qitem__top">' +
      '<span class="badge ' + (isPrivate ? 'badge--private' : 'badge--public') + '">' + (isPrivate ? 'Private' : 'Public') + '</span>' +
      '<span class="badge badge--pending">Waiting</span>' +
      (q.from ? '<span class="qitem__from">' + esc(q.from) + '</span>' : '') +
      '<span class="qitem__from">' + esc(formatDate(q.askedAt)) + '</span>' +
    '</div>';

    html += '<p class="qitem__text">' + esc(q.text) + '</p>';

    if (open) {
      html += '<div class="qitem__form">';
      html += '<div class="field">' +
        '<label class="field__label" for="ans-' + esc(q.id) + '">Your answer</label>' +
        '<textarea class="textarea" id="ans-' + esc(q.id) + '" data-answer="' + esc(q.id) + '" ' +
          'placeholder="Write it the way you would say it in an email."></textarea>' +
      '</div>';
      html += '<div class="field"><div class="field__row">' +
        '<div><label class="field__label" for="cat-' + esc(q.id) + '">Category</label>' +
        '<select class="select" id="cat-' + esc(q.id) + '" data-category-for="' + esc(q.id) + '">' + optionsHtml(CATS[0]) + '</select></div>' +
        '<div><label class="field__label" for="faqq-' + esc(q.id) + '">FAQ wording</label>' +
        '<input class="input" id="faqq-' + esc(q.id) + '" data-faqq="' + esc(q.id) + '" value="' + esc(q.text) + '"></div>' +
      '</div></div>';
      html += '<div class="field">' +
        '<label class="check"><input type="checkbox" data-publish="' + esc(q.id) + '"' + (isPrivate ? '' : ' checked') + '>' +
        '<span>Also publish this as a public answer in the FAQ</span></label>' +
        '<p class="field__hint">Leave it unticked to reply to the colleague only. The question moves to Already answered either way.</p>' +
      '</div>';
      html += '<div class="qitem__actions">' +
        '<button class="btn btn--primary" type="button" data-action="save-answer" data-id="' + esc(q.id) + '">Save answer</button>' +
        '<button class="btn" type="button" data-action="cancel-answer" data-id="' + esc(q.id) + '">Cancel</button>' +
        '<button class="btn btn--danger" type="button" data-action="delete-question" data-id="' + esc(q.id) + '">Delete question</button>' +
      '</div>';
      html += '</div>';
    } else {
      html += '<div class="qitem__actions">' +
        '<button class="btn btn--primary" type="button" data-action="answer" data-id="' + esc(q.id) + '">Answer</button>' +
        '<button class="btn btn--danger" type="button" data-action="delete-question" data-id="' + esc(q.id) + '">Delete</button>' +
      '</div>';
    }

    html += '</article>';
    return html;
  }

  function answeredHtml(q) {
    var isPrivate = q.visibility === 'private';
    var html = '<article class="qitem">';
    html += '<div class="qitem__top">' +
      '<span class="badge ' + (isPrivate ? 'badge--private' : 'badge--public') + '">' + (isPrivate ? 'Private' : 'Public') + '</span>' +
      '<span class="badge badge--answered">Answered</span>' +
      (q.from ? '<span class="qitem__from">' + esc(q.from) + '</span>' : '') +
      '<span class="qitem__from">' + esc(formatDate(q.answeredAt || q.askedAt)) + '</span>' +
    '</div>';
    html += '<p class="qitem__text">' + esc(q.text) + '</p>';
    html += '<div class="qitem__answer">' + esc(q.answer) + '</div>';
    html += '<div class="qitem__actions">' +
      '<button class="btn" type="button" data-action="publish-question" data-id="' + esc(q.id) + '">Publish to the FAQ</button>' +
      '<button class="btn btn--danger" type="button" data-action="delete-question" data-id="' + esc(q.id) + '">Delete</button>' +
    '</div></article>';
    return html;
  }

  function renderInbox() {
    var rows = S.listQuestions({ status: 'pending' });
    el('viewTitle').textContent = 'Waiting for an answer';
    el('viewLede').textContent = 'Questions colleagues have sent from the public page. Write an answer and you can publish it to the FAQ in the same step.';
    el('viewMeta').textContent = rows.length === 0
      ? 'Nothing waiting'
      : rows.length + (rows.length === 1 ? ' question waiting' : ' questions waiting');

    if (!rows.length) {
      viewEl.innerHTML = '<div class="card"><div class="empty-state">' +
        '<p class="empty-state__title">The queue is empty</p>' +
        '<p class="empty-state__body">Every question has been answered. New ones appear here as soon as a colleague sends one from the public page.</p>' +
      '</div></div>';
      return;
    }

    var html = '<div class="card">' +
      '<div class="card__head"><span class="card__title">Queue</span><span class="card__sub">' +
      rows.length + ' waiting</span></div>' +
      '<div class="card__body card__body--flush">';
    for (var i = 0; i < rows.length; i++) { html += questionHtml(rows[i]); }
    html += '</div></div>';
    viewEl.innerHTML = html;
  }

  function renderAnswered() {
    var rows = S.listQuestions({ status: 'answered' });
    el('viewTitle').textContent = 'Already answered';
    el('viewLede').textContent = 'Questions you have replied to. Publish one to the FAQ when the same question is likely to come up again.';
    el('viewMeta').textContent = rows.length === 0
      ? 'Nothing answered yet'
      : rows.length + (rows.length === 1 ? ' question answered' : ' questions answered');

    if (!rows.length) {
      viewEl.innerHTML = '<div class="card"><div class="empty-state">' +
        '<p class="empty-state__title">Nothing answered yet</p>' +
        '<p class="empty-state__body">Answer a question from the queue and it will show up here.</p>' +
      '</div></div>';
      return;
    }

    var html = '<div class="card">' +
      '<div class="card__head"><span class="card__title">Answered</span><span class="card__sub">' +
      rows.length + ' shown</span></div>' +
      '<div class="card__body card__body--flush">';
    for (var i = 0; i < rows.length; i++) { html += answeredHtml(rows[i]); }
    html += '</div></div>';
    viewEl.innerHTML = html;
  }

  /* -------------------------------------------------------------------- FAQ UI */

  function addCardHtml() {
    if (!addingOpen) {
      return '<div class="card"><div class="card__body">' +
        '<button class="btn btn--primary" type="button" data-action="open-add">Add an answer</button>' +
      '</div></div>';
    }
    return '<div class="card">' +
      '<div class="card__head"><span class="card__title">Add an answer</span><span class="card__spacer"></span>' +
      '<button class="btn btn--sm" type="button" data-action="close-add">Cancel</button></div>' +
      '<div class="card__body">' +
        '<div class="field"><label class="field__label" for="add-q">The question, in the words a colleague would use</label>' +
        '<input class="input" id="add-q" placeholder="For example: how do I claim back an expense?"></div>' +
        '<div class="field"><label class="field__label" for="add-a">The answer</label>' +
        '<textarea class="textarea" id="add-a" placeholder="Keep it short and specific. Say what happens, and what the person should do next."></textarea></div>' +
        '<div class="field"><label class="field__label" for="add-c">Category</label>' +
        '<select class="select" id="add-c">' + optionsHtml(CATS[0]) + '</select></div>' +
        '<button class="btn btn--primary" type="button" data-action="save-add">Add answer</button>' +
      '</div></div>';
  }

  function faqRowHtml(f) {
    var editing = editingId === f.id;
    var confirming = confirmingId === f.id;

    var html = '<div class="frow"><div class="frow__top"><div class="frow__main">';
    html += '<p class="frow__q">' + esc(f.question) + '</p>';
    html += '<p class="frow__a">' + esc(f.answer) + '</p>';
    html += '<div class="frow__tags">' +
      '<span class="badge badge--cat">' + esc(f.category) + '</span>' +
      '<span class="badge ' + (f.published ? 'badge--live' : 'badge--draft') + '">' + (f.published ? 'Live' : 'Hidden') + '</span>' +
      '<span class="qitem__from">Updated ' + esc(formatDate(f.updatedAt)) + '</span>' +
    '</div></div>';

    if (!editing) {
      html += '<div class="frow__actions">' +
        '<span class="switch">' +
          '<button type="button" aria-pressed="' + (f.published ? 'true' : 'false') + '"' +
          ' aria-label="' + (f.published ? 'Hide this answer from the public page' : 'Show this answer on the public page') + '"' +
          ' data-action="toggle" data-id="' + esc(f.id) + '"></button>' +
          (f.published ? 'Live' : 'Hidden') +
        '</span>' +
        '<button class="btn btn--sm" type="button" data-action="edit" data-id="' + esc(f.id) + '">Edit</button>' +
        '<button class="btn btn--sm btn--danger" type="button" data-action="ask-delete" data-id="' + esc(f.id) + '">Delete</button>' +
      '</div>';
    }
    html += '</div>';

    if (editing) {
      html += '<div class="frow__form">' +
        '<div class="field"><label class="field__label" for="eq-' + esc(f.id) + '">Question</label>' +
        '<input class="input" id="eq-' + esc(f.id) + '" data-edit-q="' + esc(f.id) + '" value="' + esc(f.question) + '"></div>' +
        '<div class="field"><label class="field__label" for="ea-' + esc(f.id) + '">Answer</label>' +
        '<textarea class="textarea" id="ea-' + esc(f.id) + '" data-edit-a="' + esc(f.id) + '">' + esc(f.answer) + '</textarea></div>' +
        '<div class="field"><label class="field__label" for="ec-' + esc(f.id) + '">Category</label>' +
        '<select class="select" id="ec-' + esc(f.id) + '" data-edit-c="' + esc(f.id) + '">' + optionsHtml(f.category) + '</select></div>' +
        '<div class="qitem__actions">' +
          '<button class="btn btn--primary" type="button" data-action="save-edit" data-id="' + esc(f.id) + '">Save changes</button>' +
          '<button class="btn" type="button" data-action="cancel-edit" data-id="' + esc(f.id) + '">Cancel</button>' +
        '</div>' +
      '</div>';
    }

    if (confirming) {
      html += '<div class="frow__confirm">' +
        '<span>Delete this answer for good?</span>' +
        '<button class="btn btn--sm btn--danger" type="button" data-action="confirm-delete" data-id="' + esc(f.id) + '">Yes, delete it</button>' +
        '<button class="btn btn--sm" type="button" data-action="cancel-delete" data-id="' + esc(f.id) + '">Keep it</button>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderFaqs() {
    var rows = S.listFaqs({ category: view.category, query: query });
    var total = S.listFaqs({ category: view.category }).length;

    el('viewTitle').textContent = view.category || 'All answers';
    el('viewLede').textContent = 'These are the answers colleagues read on the public page. Edit the wording, hide one that no longer applies, or add a new one.';
    el('viewMeta').textContent = query
      ? rows.length + ' of ' + total + ' match that search'
      : total + (total === 1 ? ' answer' : ' answers') + (view.category ? ' in this category' : '');

    var html = addCardHtml();

    if (!rows.length) {
      html += '<div class="card"><div class="empty-state">' +
        '<p class="empty-state__title">' + (query ? 'No answer matches that search' : 'Nothing in this category yet') + '</p>' +
        '<p class="empty-state__body">' + (query ? 'Try a shorter word, or clear the search box at the top.' : 'Add the first answer above.') + '</p>' +
      '</div></div>';
    } else {
      html += '<div class="card">' +
        '<div class="card__head"><span class="card__title">Answers</span><span class="card__sub">' + rows.length + ' shown</span></div>' +
        '<div class="card__body card__body--flush">';
      for (var i = 0; i < rows.length; i++) { html += faqRowHtml(rows[i]); }
      html += '</div></div>';
    }

    viewEl.innerHTML = html;
  }

  function render() {
    renderNav();
    if (view.kind === 'inbox') { renderInbox(); }
    else if (view.kind === 'answered') { renderAnswered(); }
    else { renderFaqs(); }
  }

  /* ------------------------------------------------------------------ actions */

  function handleAction(action, id) {
    var result;

    if (action === 'answer') { answeringId = id; render(); return; }
    if (action === 'cancel-answer') { answeringId = null; render(); return; }

    if (action === 'save-answer') {
      var answerBox = document.querySelector('[data-answer="' + id + '"]');
      var catBox = document.querySelector('[data-category-for="' + id + '"]');
      var faqQ = document.querySelector('[data-faqq="' + id + '"]');
      var pub = document.querySelector('[data-publish="' + id + '"]');
      result = S.answerQuestion(id, {
        answer: answerBox ? answerBox.value : '',
        category: catBox ? catBox.value : CATS[0],
        faqQuestion: faqQ ? faqQ.value : '',
        publishToFaq: pub ? pub.checked : false
      });
      if (!result.ok) { toast(result.error); return; }
      answeringId = null;
      toast(result.published ? 'Saved and published to the FAQ.' : 'Saved. Only you can see this answer.');
      render();
      return;
    }

    if (action === 'delete-question') {
      var question = findQuestion(id);
      if (!question) { toast('That question no longer exists.'); return; }
      if (!window.confirm('Delete this question for good?')) { return; }
      result = S.deleteQuestion(id);
      toast(result.ok ? 'Question deleted.' : result.error);
      render();
      return;
    }

    if (action === 'publish-question') {
      var answered = findQuestion(id);
      if (!answered) { toast('That question no longer exists.'); return; }
      result = S.saveFaq({ question: answered.text, answer: answered.answer, category: CATS[0] });
      if (!result.ok) { toast(result.error); return; }
      toast('Published. Open All answers to tidy the wording.');
      render();
      return;
    }

    if (action === 'toggle') {
      var faq = S.getFaq(id);
      if (!faq) { toast('That answer no longer exists.'); return; }
      result = S.setPublished(id, !faq.published);
      if (!result.ok) { toast(result.error); return; }
      toast(faq.published ? 'Live on the public page.' : 'Hidden from the public page.');
      render();
      return;
    }

    if (action === 'edit') { editingId = id; confirmingId = null; addingOpen = false; render(); return; }
    if (action === 'cancel-edit') { editingId = null; render(); return; }

    if (action === 'save-edit') {
      var qBox = document.querySelector('[data-edit-q="' + id + '"]');
      var aBox = document.querySelector('[data-edit-a="' + id + '"]');
      var cBox = document.querySelector('[data-edit-c="' + id + '"]');
      result = S.saveFaq({
        id: id,
        question: qBox ? qBox.value : '',
        answer: aBox ? aBox.value : '',
        category: cBox ? cBox.value : CATS[0]
      });
      if (!result.ok) { toast(result.error); return; }
      editingId = null;
      toast('Changes saved.');
      render();
      return;
    }

    if (action === 'ask-delete') { confirmingId = id; editingId = null; render(); return; }
    if (action === 'cancel-delete') { confirmingId = null; render(); return; }

    if (action === 'confirm-delete') {
      result = S.deleteFaq(id);
      confirmingId = null;
      toast(result.ok ? 'Answer deleted.' : result.error);
      render();
      return;
    }

    if (action === 'open-add') { addingOpen = true; editingId = null; render(); return; }
    if (action === 'close-add') { addingOpen = false; render(); return; }

    if (action === 'save-add') {
      result = S.saveFaq({
        question: el('add-q') ? el('add-q').value : '',
        answer: el('add-a') ? el('add-a').value : '',
        category: el('add-c') ? el('add-c').value : CATS[0]
      });
      if (!result.ok) { toast(result.error); return; }
      addingOpen = false;
      toast('Answer added and live on the public page.');
      render();
      return;
    }
  }

  /* ------------------------------------------------------------------- wiring */

  document.querySelector('.a-side').addEventListener('click', function (event) {
    var button = closest(event.target, '.a-nav__item');
    if (!button) { return; }
    view.kind = button.getAttribute('data-view') || 'faq';
    view.category = button.getAttribute('data-category') || null;
    if (view.kind !== 'faq') {
      view.category = null;
      query = '';
      searchEl.value = '';
    }
    answeringId = null;
    editingId = null;
    confirmingId = null;
    addingOpen = false;
    render();
  });

  viewEl.addEventListener('click', function (event) {
    var button = closest(event.target, '[data-action]');
    if (!button) { return; }
    handleAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
  });

  searchEl.addEventListener('input', function () {
    query = searchEl.value.trim();
    /* The search box sits in the top bar, away from the category list, so it always
       searches every answer rather than silently staying inside one category. */
    if (view.kind !== 'faq' || view.category) { view.kind = 'faq'; view.category = null; }
    editingId = null;
    confirmingId = null;
    addingOpen = false;
    render();
  });

  el('btnExport').addEventListener('click', function () {
    try {
      var blob = new Blob([S.exportJson()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'payroll-answers-export.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('Exported. Keep the file somewhere safe.');
    } catch (e) {
      toast('This browser blocked the download.');
    }
  });

  el('btnImport').addEventListener('click', function () {
    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/json,.json';
    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () {
        var result = S.importJson(String(reader.result));
        if (!result.ok) { toast(result.error); return; }
        toast('Imported.');
        render();
      };
      reader.onerror = function () { toast('That file could not be read.'); };
      reader.readAsText(file);
    });
    picker.click();
  });

  el('btnReset').addEventListener('click', function () {
    if (!window.confirm('Reset everything back to the demo content? Any answers you added or edited will be lost.')) { return; }
    S.resetDemo();
    view.kind = 'inbox';
    view.category = null;
    query = '';
    searchEl.value = '';
    answeringId = null;
    editingId = null;
    confirmingId = null;
    addingOpen = false;
    toast('Demo content restored.');
    render();
  });

  el('storageNote').textContent = S.storageAvailable()
    ? 'Changes save in this browser only, so they do not follow you to another laptop.'
    : 'This browser is blocking local storage, so changes last only until the tab is closed.';

  render();
})();
