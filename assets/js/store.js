/* DHL Payroll Answers - data layer.
   Demo build: everything lives in the browser. No server, no network calls.
   Swap the four functions at the bottom for fetch() calls when a backend exists. */
(function () {
  'use strict';

  var KEY = 'dhl-payroll-faq.v1';

  var CATEGORIES = [
    'Pay dates and payslips',
    'Overtime and shift pay',
    'Deductions and tax',
    'Leave and absence'
  ];

  function nowIso() { return new Date().toISOString(); }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function seed() {
    var t = nowIso();
    return {
      version: 1,
      faqs: [
        { id: 'f1', category: CATEGORIES[0], published: true, createdAt: t, updatedAt: t,
          question: 'When do I get paid each month?',
          answer: 'Salary is paid on the 27th of each month, or the working day before if the 27th falls on a weekend or a bank holiday. Most banks clear the money the same day, though a few take until the next working morning. If a payday is moving, an announcement goes out in the week before.' },
        { id: 'f2', category: CATEGORIES[0], published: true, createdAt: t, updatedAt: t,
          question: 'Where can I find my payslip?',
          answer: 'Payslips are published a day or two before payday and you can download them as a PDF. Keep the last twelve months to hand for anything to do with tax, a mortgage or a visa application. If a payslip is missing from your list, ask Emma and she can reissue it.' },
        { id: 'f3', category: CATEGORIES[0], published: true, createdAt: t, updatedAt: t,
          question: 'What is the cut-off for a change to my bank details?',
          answer: 'A bank detail change needs to reach payroll before the 15th of the month to take effect that month. Anything later lands on the following pay run. Check the account number twice before you submit it, because a payment sent to a closed account can take up to ten working days to come back.' },
        { id: 'f4', category: CATEGORIES[1], published: true, createdAt: t, updatedAt: t,
          question: 'How is overtime calculated?',
          answer: 'Overtime is paid at time and a quarter for the first two hours and time and a half after that, worked out on your basic hourly rate rather than your shift rate. Only approved hours count, so make sure your manager has signed the overtime off before you work it. Overtime always shows as its own line on the payslip.' },
        { id: 'f5', category: CATEGORIES[1], published: true, createdAt: t, updatedAt: t,
          question: 'Do night shifts carry an extra payment?',
          answer: 'Night shifts carry a shift premium on top of the basic rate. The size of the premium depends on the shift pattern in your contract, so two people on the same grade can see different amounts. If your premium looks wrong, send Emma the shift dates and she will check them against the roster.' },
        { id: 'f6', category: CATEGORIES[1], published: true, createdAt: t, updatedAt: t,
          question: 'Who approves overtime before I work it?',
          answer: 'Your line manager approves overtime, not payroll. Once it is approved it goes to payroll with the timesheet, and payroll pays whatever has been approved. If you worked hours that were never approved, speak to your manager first, because payroll cannot add them without that approval.' },
        { id: 'f7', category: CATEGORIES[2], published: true, createdAt: t, updatedAt: t,
          question: 'Why is my net pay lower than last month?',
          answer: 'The usual causes are a change of tax code, a benefit in kind being applied, a student loan repayment starting or stopping, or a pension contribution moving to a new percentage. Compare the deductions on this payslip with last month and you can normally spot which line moved. If it is not obvious, send Emma both payslips and she will break it down.' },
        { id: 'f8', category: CATEGORIES[2], published: true, createdAt: t, updatedAt: t,
          question: 'My tax code looks wrong. What should I do?',
          answer: 'Send Emma the tax code shown on your payslip and she will check it against the notice from HMRC. Payroll can only apply the code HMRC sends, so a correction usually has to come from HMRC first. Keep any letter or email from HMRC about your code, as it speeds the fix up.' },
        { id: 'f9', category: CATEGORIES[2], published: true, createdAt: t, updatedAt: t,
          question: 'How do I update my home address?',
          answer: 'Update the address in the HR system first, because payroll reads it from there. The change then flows through to your payslip and to anything posted to you. Allow one full pay cycle for it to appear, and tell Emma if you need a P60 or a reference letter sent to the new address sooner.' },
        { id: 'f10', category: CATEGORIES[3], published: true, createdAt: t, updatedAt: t,
          question: 'How is holiday pay worked out?',
          answer: 'Holiday pay is based on your average earnings over the previous twelve weeks, so shifts, overtime and premiums are all included in the average. That is why a holiday week can be paid at a slightly different rate from a normal week. If you want to see the working, Emma can print the twelve week breakdown.' },
        { id: 'f11', category: CATEGORIES[3], published: true, createdAt: t, updatedAt: t,
          question: 'What happens to my pay when I am off sick?',
          answer: 'Sick pay depends on whether you are on full pay, half pay or statutory sick pay, and that depends on your length of service and your absence record. Report the absence on the first day so it is recorded correctly. Payroll applies whatever the absence record shows, so check with your manager if the days do not match.' },
        { id: 'f12', category: CATEGORIES[3], published: true, createdAt: t, updatedAt: t,
          question: 'Does unpaid leave change my pay date?',
          answer: 'The pay date stays the same, but the amount is reduced by the days you took. Unpaid leave is normally deducted in the month you take it, unless you agreed to spread it over several months. If you did spread it, Emma can confirm the remaining instalments.' }
      ],
      questions: [
        { id: 'q1', text: 'I worked the bank holiday on 5 May. Will that show on this month payslip?',
          visibility: 'public', status: 'pending', answer: '', askedAt: t, answeredAt: '', from: 'Warehouse, shift B' },
        { id: 'q2', text: 'Can I split my annual leave into single days instead of full weeks?',
          visibility: 'public', status: 'pending', answer: '', askedAt: t, answeredAt: '', from: 'Operations' },
        { id: 'q3', text: 'My address changed last week. Does that affect my tax code?',
          visibility: 'private', status: 'pending', answer: '', askedAt: t, answeredAt: '', from: 'Customer service' },
        { id: 'q4', text: 'Is the shift premium included when holiday pay is averaged?',
          visibility: 'public', status: 'answered', askedAt: t, answeredAt: t, from: 'Warehouse, shift A',
          answer: 'Yes. The twelve week average includes basic pay, overtime and any shift premium you earned in those weeks. If your holiday pay looks low, it is usually because the twelve weeks before it were mostly day shifts.' }
      ]
    };
  }

  /* localStorage can throw in private windows and is blocked on some file:// setups,
     so fall back to memory rather than breaking the page. */
  var backing = (function () {
    try {
      var probe = '__probe__' + Date.now();
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      return null;
    }
  })();

  var memory = null;
  var listeners = [];

  function read() {
    if (!backing) { return memory || (memory = seed()); }
    try {
      var raw = backing.getItem(KEY);
      if (!raw) { var fresh = seed(); backing.setItem(KEY, JSON.stringify(fresh)); return fresh; }
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faqs)) { throw new Error('unexpected shape'); }
      if (!Array.isArray(parsed.questions)) { parsed.questions = []; }
      return parsed;
    } catch (e) {
      return seed();
    }
  }

  var state = read();

  function commit() {
    if (backing) {
      try { backing.setItem(KEY, JSON.stringify(state)); } catch (e) { backing = null; memory = state; }
    } else {
      memory = state;
    }
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) { /* one bad listener must not stop the rest */ }
    }
  }

  function text(value) { return String(value == null ? '' : value).trim(); }

  function matches(faq, query) {
    if (!query) { return true; }
    var q = query.toLowerCase();
    return (faq.question + ' ' + faq.answer + ' ' + faq.category).toLowerCase().indexOf(q) !== -1;
  }

  var api = {
    categories: function () { return CATEGORIES.slice(); },

    /* opts: { publishedOnly, category, query } */
    listFaqs: function (opts) {
      opts = opts || {};
      var rows = state.faqs.filter(function (f) {
        if (opts.publishedOnly && !f.published) { return false; }
        if (opts.category && f.category !== opts.category) { return false; }
        return matches(f, opts.query);
      });
      return rows.slice().sort(function (a, b) {
        var ai = CATEGORIES.indexOf(a.category), bi = CATEGORIES.indexOf(b.category);
        if (ai !== bi) { return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi); }
        return a.question.localeCompare(b.question);
      });
    },

    getFaq: function (id) {
      for (var i = 0; i < state.faqs.length; i++) { if (state.faqs[i].id === id) { return state.faqs[i]; } }
      return null;
    },

    saveFaq: function (input) {
      var question = text(input.question);
      var answer = text(input.answer);
      if (!question || !answer) { return { ok: false, error: 'A question and an answer are both required.' }; }
      var t = nowIso();
      if (input.id) {
        var existing = api.getFaq(input.id);
        if (!existing) { return { ok: false, error: 'That entry no longer exists.' }; }
        existing.question = question;
        existing.answer = answer;
        existing.category = input.category || existing.category;
        existing.updatedAt = t;
        commit();
        return { ok: true, id: existing.id };
      }
      var faq = {
        id: uid('f'), question: question, answer: answer,
        category: input.category || CATEGORIES[0],
        published: input.published !== false, createdAt: t, updatedAt: t
      };
      state.faqs.push(faq);
      commit();
      return { ok: true, id: faq.id };
    },

    deleteFaq: function (id) {
      var before = state.faqs.length;
      state.faqs = state.faqs.filter(function (f) { return f.id !== id; });
      if (state.faqs.length !== before) { commit(); return { ok: true }; }
      return { ok: false, error: 'That entry no longer exists.' };
    },

    setPublished: function (id, published) {
      var faq = api.getFaq(id);
      if (!faq) { return { ok: false, error: 'That entry no longer exists.' }; }
      faq.published = !!published;
      faq.updatedAt = nowIso();
      commit();
      return { ok: true };
    },

    listQuestions: function (opts) {
      opts = opts || {};
      return state.questions.filter(function (q) {
        if (opts.status && q.status !== opts.status) { return false; }
        return true;
      }).slice().sort(function (a, b) { return String(b.askedAt).localeCompare(String(a.askedAt)); });
    },

    countPending: function () {
      return state.questions.filter(function (q) { return q.status === 'pending'; }).length;
    },

    addQuestion: function (input) {
      var body = text(input.text);
      if (!body) { return { ok: false, error: 'Type your question first.' }; }
      if (body.length > 500) { return { ok: false, error: 'Please keep the question under 500 characters.' }; }
      var q = {
        id: uid('q'), text: body,
        visibility: input.visibility === 'private' ? 'private' : 'public',
        status: 'pending', answer: '', askedAt: nowIso(), answeredAt: '',
        from: text(input.from)
      };
      state.questions.push(q);
      commit();
      return { ok: true, id: q.id, visibility: q.visibility };
    },

    answerQuestion: function (id, input) {
      var q = null;
      for (var i = 0; i < state.questions.length; i++) { if (state.questions[i].id === id) { q = state.questions[i]; } }
      if (!q) { return { ok: false, error: 'That question no longer exists.' }; }
      var body = text(input.answer);
      if (!body) { return { ok: false, error: 'Write an answer before saving.' }; }
      q.answer = body;
      q.status = 'answered';
      q.answeredAt = nowIso();
      if (input.publishToFaq) {
        var created = api.saveFaq({
          question: text(input.faqQuestion) || q.text,
          answer: body,
          category: input.category || CATEGORIES[0]
        });
        if (!created.ok) { return created; }
      }
      commit();
      return { ok: true, published: !!input.publishToFaq };
    },

    deleteQuestion: function (id) {
      var before = state.questions.length;
      state.questions = state.questions.filter(function (q) { return q.id !== id; });
      if (state.questions.length !== before) { commit(); return { ok: true }; }
      return { ok: false, error: 'That question no longer exists.' };
    },

    resetDemo: function () {
      state = seed();
      commit();
      return { ok: true };
    },

    exportJson: function () { return JSON.stringify(state, null, 2); },

    importJson: function (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.faqs)) { throw new Error('shape'); }
        if (!Array.isArray(parsed.questions)) { parsed.questions = []; }
        state = parsed;
        commit();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'That file is not a valid export from this page.' };
      }
    },

    storageAvailable: function () { return !!backing; },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }
  };

  window.PayrollStore = api;
})();
