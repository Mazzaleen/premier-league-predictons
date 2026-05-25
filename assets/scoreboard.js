// Generic scoring + leaderboard renderer.
// Reads window.SEASON_CONFIG and renders into #leaderboard-body.
//
// Config shape:
// {
//   topN:         6,                // number of league positions scored
//   hasReleg:     true,              // whether to score relegation
//   hasMegaBonus: true,              // +2pt for perfect ordered top N
//   awards: [
//     { key: 'poty',  label: 'PFA POTY',     max: 2 },
//     ...
//   ],
//   actualResults: { topN: ['ARS',...], releg: [...], poty: '...', ... },
//   predictions:  { Friend1: { topN: [...], releg: [...], poty: '...', ... }, ... }
// }

(function () {
  const cfg = window.SEASON_CONFIG;
  if (!cfg) return;

  const {
    topN = 6,
    hasReleg = false,
    hasMegaBonus = true,
    awards = [],
    actualResults = {},
    predictions = {},
  } = cfg;

  function score(picks, actual) {
    if (!actual.topN) return null;
    let s = 0;

    if (picks.topN && actual.topN) {
      picks.topN.forEach((t, i) => {
        if (actual.topN.includes(t)) s += 1;
        if (actual.topN[i] === t) s += 2;
      });
      if (hasMegaBonus && picks.topN.every((t, i) => actual.topN[i] === t))
        s += 2;
    }

    if (hasReleg && actual.releg && picks.releg) {
      picks.releg.forEach((t) => {
        if (actual.releg.includes(t)) s += 1;
      });
    }

    awards.forEach((a) => {
      if (actual[a.key] && picks[a.key] && picks[a.key] === actual[a.key])
        s += a.max;
    });

    return s;
  }

  function buildBreakdown(picks, actual) {
    const sections = {};
    let total = 0;
    const ordinals = [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
      '8th',
      '9th',
      '10th',
    ];

    if (picks.topN && actual.topN) {
      const key = `Top ${topN}`;
      sections[key] = [];
      picks.topN.forEach((t, i) => {
        const inTop = actual.topN.includes(t);
        const exact = actual.topN[i] === t;
        const pts = (inTop ? 1 : 0) + (exact ? 2 : 0);
        total += pts;
        const cls = exact ? 'hit' : inTop ? 'partial' : '';
        sections[key].push({
          label: `${ordinals[i] || i + 1 + 'th'}: <strong>${t}</strong> · actual ${actual.topN[i]}`,
          pts,
          cls,
        });
      });
      if (hasMegaBonus && picks.topN.every((t, i) => actual.topN[i] === t)) {
        sections[key].push({
          label: '<strong>Perfect order bonus</strong>',
          pts: 2,
          cls: 'hit',
        });
        total += 2;
      }
    }

    if (hasReleg && actual.releg && picks.releg) {
      sections['Relegation'] = [];
      picks.releg.forEach((t) => {
        const hit = actual.releg.includes(t);
        if (hit) total += 1;
        sections['Relegation'].push({
          label: `<strong>${t}</strong>${hit ? '' : ' · stayed up'}`,
          pts: hit ? 1 : 0,
          cls: hit ? 'hit' : '',
        });
      });
    }

    if (awards.length) {
      sections['Awards'] = [];
      awards.forEach((a) => {
        const pickVal = picks[a.key];
        const hit = pickVal && actual[a.key] && pickVal === actual[a.key];
        if (hit) total += a.max;
        const display =
          pickVal == null
            ? '<em style="color:var(--muted)">no pick</em>'
            : `<strong>${pickVal}</strong>`;
        sections['Awards'].push({
          label: `${a.label}: ${display}`,
          pts: hit ? a.max : 0,
          cls: hit ? 'hit' : '',
        });
      });
    }

    let html = '<div class="bd-panel">';
    for (const [name, items] of Object.entries(sections)) {
      html += `<div class="bd-section"><h4>${name}</h4>`;
      items.forEach((item) => {
        const sign = item.pts > 0 ? '+' : '';
        html += `<div class="bd-row ${item.cls}"><span class="bd-label">${item.label}</span><span class="bd-pts">${sign}${item.pts}</span></div>`;
      });
      html += '</div>';
    }
    html += `<div class="bd-total"><span class="bd-total-label">Total</span><span class="bd-total-pts">${total} pt</span></div>`;
    html += '</div>';
    return html;
  }

  const haveResults =
    Array.isArray(actualResults.topN) && actualResults.topN.length > 0;

  const rows = Object.entries(predictions).map(([name, picks]) => ({
    name,
    score: score(picks, actualResults),
  }));

  if (haveResults) {
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  } else {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  let lastScore = null,
    currentRank = 0;
  rows.forEach((r, i) => {
    if (r.score !== lastScore) {
      currentRank = i + 1;
      lastScore = r.score;
    }
    r.rank = currentRank;
  });

  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;

  tbody.innerHTML = rows
    .map((r, idx) => {
      const podium = haveResults && r.rank <= 3 ? ` podium-${r.rank}` : '';
      const rankCell = haveResults ? '#' + r.rank : '—';
      const pts = r.score === null ? '—' : r.score + ' pt';
      const breakdownRow = haveResults
        ? `<tr class="lb-breakdown" data-idx="${idx}" hidden><td colspan="3">${buildBreakdown(predictions[r.name], actualResults)}</td></tr>`
        : '';
      return `<tr class="lb-row${podium}" data-idx="${idx}"><td class="rank">${rankCell}</td><td class="name">${r.name}</td><td class="score">${pts}</td></tr>${breakdownRow}`;
    })
    .join('');

  document.querySelectorAll('.lb-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = row.dataset.idx;
      const target = document.querySelector(`.lb-breakdown[data-idx="${idx}"]`);
      if (!target) return;
      const wasHidden = target.hasAttribute('hidden');
      target.toggleAttribute('hidden');
      row.classList.toggle('expanded', wasHidden);
    });
  });

  // Mark correct picks in the predictions table with a green tick
  if (haveResults) {
    const categoryMap = {
      'PFA POTY': { key: 'poty', kind: 'player' },
      'Golden Boot': { key: 'gb', kind: 'player' },
      Playmaker: { key: 'play', kind: 'player' },
      'Golden Glove': { key: 'gg', kind: 'player' },
      MOTY: { key: 'mgr', kind: 'player' },
    };

    function getPlayerText(playerEl) {
      // First text node only — strips out any qualifier child span
      const node = playerEl.childNodes[0];
      return node ? (node.nodeValue || '').trim() : '';
    }

    function getPillCode(pillEl) {
      // First text node of pill — abbreviation, ignoring crest img
      let txt = '';
      pillEl.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) txt += n.nodeValue;
      });
      return txt.trim();
    }

    document.querySelectorAll('table.predictions tbody tr').forEach((tr) => {
      const catCell = tr.querySelector('td.cat-col');
      if (!catCell) return;
      const cat = catCell.textContent.trim();

      // Top-N position rows: "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"
      const posMatch = cat.match(/^(\d+)(st|nd|rd|th)$/);
      if (posMatch) {
        const idx = parseInt(posMatch[1], 10) - 1;
        const expected = actualResults.topN && actualResults.topN[idx];
        if (!expected) return;
        tr.querySelectorAll('td:not(.cat-col):not(.actual-col) .pill').forEach(
          (pill) => {
            if (getPillCode(pill) === expected) pill.classList.add('hit-pill');
          },
        );
        return;
      }

      // Relegation row
      if (cat.toLowerCase().startsWith('relegation') && actualResults.releg) {
        tr.querySelectorAll('td:not(.cat-col):not(.actual-col) .pill').forEach(
          (pill) => {
            if (actualResults.releg.includes(getPillCode(pill)))
              pill.classList.add('hit-pill');
          },
        );
        return;
      }

      // Award rows — match by category text (handles "PFA YPOTY (U23)" variants)
      let key = null;
      if (cat.startsWith('PFA YPOTY')) key = 'ypoty';
      else if (categoryMap[cat]) key = categoryMap[cat].key;
      if (!key) return;
      const expected = actualResults[key];
      if (!expected) return;
      tr.querySelectorAll('td:not(.cat-col):not(.actual-col) .player').forEach(
        (p) => {
          if (getPlayerText(p) === expected) p.classList.add('hit-player');
        },
      );
    });
  }
})();

// Compare mode: clicking a friend column header hides the other friends so
// you can read that participant's picks side-by-side with Actual. Clicking
// the same name (or any "Reset" surface) restores all columns.
(function () {
  const table = document.querySelector('table.predictions');
  if (!table) return;
  const friendThs = Array.from(table.querySelectorAll('th.friend'));
  if (friendThs.length < 2) return;

  let focused = null;

  function clearFocus() {
    table.removeAttribute('data-compare');
    table
      .querySelectorAll('.compare-hidden')
      .forEach((el) => el.classList.remove('compare-hidden'));
    friendThs.forEach((th) => th.classList.remove('compare-focus'));
    focused = null;
  }

  function setFocus(th) {
    if (focused === th) {
      clearFocus();
      return;
    }
    clearFocus();
    const colIdx = Array.from(th.parentNode.children).indexOf(th);
    th.classList.add('compare-focus');
    table.setAttribute('data-compare', 'on');
    friendThs.forEach((other) => {
      if (other !== th) other.classList.add('compare-hidden');
    });
    table.querySelectorAll('tbody tr').forEach((tr) => {
      Array.from(tr.children).forEach((cell, i) => {
        if (
          cell.classList.contains('cat-col') ||
          cell.classList.contains('actual-col')
        )
          return;
        if (cell.colSpan && cell.colSpan > 1) return; // section-break
        if (i !== colIdx) cell.classList.add('compare-hidden');
      });
    });
    focused = th;
  }

  friendThs.forEach((th) => {
    th.title = 'Click to compare with Actual · click again to show all';
    th.addEventListener('click', () => setFocus(th));
  });

  // Clicking the Name or Actual header also resets, since they're always visible.
  const resetThs = table.querySelectorAll('thead th.cat-col, thead th.actual-col');
  resetThs.forEach((th) => {
    th.style.cursor = 'pointer';
    th.title = 'Click to show all participants';
    th.addEventListener('click', clearFocus);
  });
})();
