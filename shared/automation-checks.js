/* Automation checks, shared by the Automation Finder and the Automation
   Journey Map. Works out which automations in the register look out of date,
   unfinished or inconsistent, from their status, dates, name and details.

   Use:  const checks = AutomationChecks.checkAll(automations);
         checks.get(AutomationChecks.keyFor(automation))
           -> { group: 'first' | 'tidy' | 'later', reasons: [{ group, title, detail }], lastDate,
                checkedOn, recentlyChecked }
           or undefined if nothing is flagged (or it's retired).

   "Last Checked" in the register (the "checked" field from the flow) is when
   someone last reviewed the automation. For LIMITS.recheckDays after that it's
   "recentlyChecked" and the pages hide its flag, unless the automation was
   changed after the check.

   To tune the checks, change LIMITS or the word lists below. Both pages
   pick the change up. */

(function () {
  /* How long before something counts as old, in months (except recheckDays). */
  const LIMITS = {
    message: 12,    // active automation that sends something, unchanged this long
    active: 12,     // any other active automation, unchanged this long
    temporary: 3,   // temporary automation still active this long
    paused: 6,      // paused this long: probably ready to retire
    draft: 3,       // draft (not a template) untouched this long
    recheckDays: 90 // after a "Last Checked" date, hide the flag this many days
  };

  /* Words in a name, or in the first sentence of its purpose (what it does,
     before any side notes), that mean the automation sends something. */
  const SENDS = /\b(sends?|emails?|sms|smses|texts?|notif(y|ies|ication|ications)|reminders?|alerts?|newsletters?)\b/i;
  const SEASONAL = /\b(christmas|xmas|new years?|eofy|easter)\b/i;
  const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
  const MONTHS = { jan:0, feb:1, mar:2, apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };

  /* Every flag is labelled "Might need update"; the group sets its colour and
     how urgent it is. */
  const LABEL = 'Might need update';
  const GROUPS = [
    { key: 'first', title: 'Check first', label: 'Check first', short: 'Sending, unfinished or contradictory',
      blurb: 'Still running and either sending something that may be out of date, only meant to run for a while, or with details that don’t add up.' },
    { key: 'tidy', title: 'Tidy up', label: 'Tidy up', short: 'Probably ready to retire',
      blurb: 'Paused or draft automations that haven’t been touched in a long time. If they’re not coming back, retire them so the register stays easy to read.' },
    { key: 'later', title: 'When there’s time', label: 'Review', short: 'Renames and routine reviews',
      blurb: 'Probably fine, but with an old financial year in the name, or not reviewed in over a year.' }
  ];
  const ORDER = { first: 0, tidy: 1, later: 2 };

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  /* Australian financial year: FY27 runs 1 July 2026 to 30 June 2027. */
  const CURRENT_FY = (TODAY.getMonth() >= 6 ? TODAY.getFullYear() + 1 : TODAY.getFullYear()) % 100;

  function clean(value) {
    const s = String(value == null ? '' : value).trim();
    return s && s.toUpperCase() !== 'N/A' ? s : '';
  }

  /* The flow sends dates as ISO text (its Excel "DateTime Format" is ISO 8601).
     A date typed into Excel as text comes through as typed, so Australian
     day/month/year text is accepted too. */
  function parseDate(value) {
    const s = clean(value);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
    if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    return null;
  }

  function formatDate(d) {
    return d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }

  function monthsSince(d) {
    return (TODAY.getFullYear() - d.getFullYear()) * 12 + (TODAY.getMonth() - d.getMonth()) - (TODAY.getDate() < d.getDate() ? 1 : 0);
  }

  function age(d) {
    const m = monthsSince(d);
    if (m >= 24) return Math.floor(m / 12) + ' years';
    if (m >= 12) return 'over a year';
    return m + (m === 1 ? ' month' : ' months');
  }

  function statusOf(status) {
    const s = clean(status).toLowerCase();
    if (s.startsWith('active')) return 'active';
    if (s.startsWith('paused')) return 'paused';
    if (s.startsWith('retired') || s.startsWith('hibernat')) return 'retired';
    if (s.startsWith('draft')) return 'draft';
    return s;
  }

  function normalName(name) {
    return clean(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function hasLink(url) {
    try { return new URL(clean(url)).protocol === 'https:'; } catch { return false; }
  }

  function financialYears(name) {
    return [...name.matchAll(/\bFY\s?(?:20)?(\d{2})\b/gi)].map(m => +m[1]);
  }

  /* Month + year in a name, e.g. "MAY-25", "[MAR 2026]", "APRIL 26". */
  function nameMonths(name) {
    const out = [];
    for (const m of name.matchAll(/\b(jan|feb|mar|apr|april|may|jun|june|jul|july|aug|sept|sep|oct|nov|dec)[\s\-]?(?:20)?(\d{2})\b/gi)) {
      out.push({ text: m[0], date: new Date(2000 + +m[2], MONTHS[m[1].toLowerCase()], 1) });
    }
    return out;
  }

  /* The same key both pages use to look an automation up: the number at the
     end of its Bullhorn Automation link, or record + name if it has no link. */
  function keyFor(a) {
    const m = clean(a.url).match(/(\d+)\s*\/?\s*$/);
    return m ? 'id:' + m[1] : 'name:' + clean(a.record) + '|' + normalName(a.name);
  }

  function checkOne(a, duplicates) {
    const reasons = [];
    const add = (group, title, detail) => reasons.push({ group, title, detail });

    const name = clean(a.name), purpose = clean(a.purpose), list = clean(a.list);
    const created = parseDate(a.created);
    const modified = parseDate(a.modified);
    const last = modified || created;
    const status = statusOf(a.status);
    const activation = clean(a.activation).toLowerCase();
    const sends = SENDS.test(name + ' ' + purpose.split(/\.\s/)[0]);

    if (status === 'active') {
      if (last && sends && monthsSince(last) >= LIMITS.message) {
        add('first', 'Sends something and hasn’t changed in ' + age(last),
          'Check the wording, links, attachments and anyone named in it are still current.');
      } else if (last && monthsSince(last) >= LIMITS.active) {
        add('later', 'Not changed in ' + age(last), 'Check it still does the right job.');
      }

      if (activation === 'temporary') {
        const past = nameMonths(name).filter(m => monthsSince(m.date) >= LIMITS.temporary);
        if (past.length) {
          add('first', 'Temporary, named for ' + past.map(m => m.text).join(', ') + ', still active',
            'Pause or retire it if it has finished its job.');
        } else if (last && monthsSince(last) >= LIMITS.temporary) {
          add('first', 'Temporary, but active for ' + age(last),
            'Pause or retire it if it has finished its job, or change it to Always ON.');
        }
      }

      if (SEASONAL.test(name)) add('first', 'Seasonal, still active', 'Check it should be running at this time of year.');
      if (/\btest\b/i.test(name)) add('first', 'Looks like a test, still active', 'Pause or retire it if it’s no longer needed.');

      const missing = [];
      if (!activation) missing.push('activation type');
      if (!hasLink(a.url)) missing.push('link');
      if (!purpose) missing.push('purpose');
      if (!list) missing.push('list');
      if (!created && !modified) missing.push('dates');
      if (missing.length) add('first', 'Missing from the register: ' + missing.join(', '), 'Fill these in on the register.');

      const fys = financialYears(name);
      if (fys.length && Math.max(...fys) < CURRENT_FY) {
        add('later', 'Named for FY' + Math.max(...fys) + ', still active',
          'Rename it, or check whether it should have been replaced by an FY' + CURRENT_FY + ' version.');
      }
    }

    if (status === 'paused' && last && monthsSince(last) >= LIMITS.paused) {
      add('tidy', 'Paused for ' + age(last), 'Retire it if it isn’t coming back.');
    }
    if (status === 'draft' && activation !== 'template' && last && monthsSince(last) >= LIMITS.draft) {
      add('tidy', 'Draft, untouched for ' + age(last), 'Finish it or retire it.');
    }
    if (status === 'draft' && activation === 'template') {
      const fys = financialYears(name);
      if (fys.length && Math.max(...fys) < CURRENT_FY) {
        add('later', 'Template for FY' + Math.max(...fys), 'Update it for FY' + CURRENT_FY + ' or retire it.');
      }
    }

    if (created && modified && modified < created) {
      add('first', 'Last changed before it was created',
        'Created ' + formatDate(created) + ', last changed ' + formatDate(modified) + '. One of the dates in the register is wrong.');
    }
    if ((created && created > TODAY) || (modified && modified > TODAY)) {
      add('first', 'Has a date in the future', 'Check the dates in the register.');
    }

    const nameStates = STATES.filter(s => new RegExp('\\b' + s + '\\b').test(name));
    const listStates = STATES.filter(s => new RegExp('\\b' + s + '\\b').test(list));
    if (nameStates.length === 1 && listStates.length && !listStates.includes(nameStates[0])) {
      add('first', 'Name says ' + nameStates[0] + ' but the list says ' + listStates.join('/'), 'Check it’s using the right list.');
    }

    if (duplicates.has(clean(a.record) + '|' + normalName(name))) {
      add('first', 'Same name as another automation', 'Check one isn’t a leftover copy.');
    }

    if (!reasons.length) return null;
    reasons.sort((x, y) => ORDER[x.group] - ORDER[y.group]);

    const checkedOn = parseDate(a.checked);
    const recentlyChecked = !!checkedOn && checkedOn <= TODAY &&
      (TODAY - checkedOn) / 86400000 < LIMITS.recheckDays &&
      !(modified && modified > checkedOn);
    return { group: reasons[0].group, reasons, lastDate: last, checkedOn, recentlyChecked };
  }

  /* Check every automation in the register. Retired ones are skipped. */
  function checkAll(rows) {
    const live = (rows || []).filter(a => clean(a.name) && statusOf(a.status) !== 'retired');
    const counts = {};
    const seen = new Set();
    for (const a of live) {
      const k = keyFor(a);
      if (seen.has(k)) continue;
      seen.add(k);
      const n = clean(a.record) + '|' + normalName(a.name);
      counts[n] = (counts[n] || 0) + 1;
    }
    const duplicates = new Set(Object.keys(counts).filter(k => counts[k] > 1));

    const out = new Map();
    for (const a of live) {
      const k = keyFor(a);
      if (out.has(k)) continue;
      const result = checkOne(a, duplicates);
      if (result) out.set(k, result);
    }
    return out;
  }

  /* The date a recently checked automation comes back on the list. */
  function recheckDate(check) {
    return check && check.checkedOn ? new Date(check.checkedOn.getTime() + LIMITS.recheckDays * 86400000) : null;
  }

  window.AutomationChecks = { LABEL, GROUPS, ORDER, LIMITS, checkAll, keyFor, formatDate, recheckDate };
})();
