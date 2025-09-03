// Content script: scrape medication info from the NHI IMU page
(function () {
  // Normalize text
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  // Parse ROC or ISO-like dates e.g. 114/08/05 -> 2025-08-05
  function parseDate(s) {
    if (!s) return null;
    const txt = s.trim();
    const m = txt.match(/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      let y = Number(m[1]);
      if (y < 1900) y = y + 1911; // assume ROC year
      return new Date(y, Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(txt);
    return isNaN(d) ? null : d;
  }

  // Note: six-month filtering removed per user request; keep parseDate for visitDate only

  // target the DataTables table structure you provided (try several selectors)
  function extractFromDataTable() {
    const tableSelectors = ['#DataTables_Table_1', '#DataTables_Table_0', '.dataTables_scrollBody table', 'table.dataTable', 'table.table-default'];
    let table = null;
    for (const s of tableSelectors) { table = document.querySelector(s); if (table) break; }
    if (!table) return [];
    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const headers = headerCells.map(h => norm(h.innerText));
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const meds = rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const row = { raw: norm(tr.innerText) };
      // if headers align, map header -> cell text
      if (headers.length && headers.length <= cells.length + 2) {
        headers.forEach((h, i) => {
          row[h] = norm((cells[i] && cells[i].innerText) || '');
        });
      } else {
        // fallback by index
        row['項次'] = norm(cells[0] && cells[0].innerText);
        row['就醫日期'] = norm(cells[1] && cells[1].innerText);
        row['來源'] = norm(cells[2] && cells[2].innerHTML);
        row['主診斷'] = norm(cells[3] && cells[3].innerText);
        row['ATC3名稱'] = norm(cells[4] && cells[4].innerText);
        row['成分名稱'] = norm(cells[6] && cells[6].innerText);
        row['藥品名稱'] = norm(cells[7] && cells[7].innerText);
        row['用法用量'] = norm(cells[8] && cells[8].innerText);
        row['藥品用量'] = norm(cells[9] && cells[9].innerText);
        row['給藥日數'] = norm(cells[10] && cells[10].innerText);
      }
      // convenience fields
      row.visitDate = parseDate(row['就醫日期']);
      row.components = row['成分名稱'] || '';
      row.drugName = row['藥品名稱'] || '';
      row.dose = row['用法用量'] || '';
      row.days = row['給藥日數'] || '';
      return row;
    });
    return meds;
  }

    return meds;
  const SGLT2 = ['canagliflozin','dapagliflozin','empagliflozin','ertugliflozin','卡納格列汀','達格列淨','恩格列淨','dapagliflozin','empagliflozin'];

  // Wait for DataTables to render rows (if it's async). Poll until tbody has rows or timeout.
  function waitForTableRows(timeoutMs = 3000) {
    return new Promise(resolve => {
      const start = Date.now();
      function check() {
        const table = document.querySelector('#DataTables_Table_1') || document.querySelector('.dataTables_scrollBody table') || document.querySelector('table.dataTable');
        const rows = table && table.querySelectorAll && table.querySelectorAll('tbody tr');
        if (rows && rows.length > 0) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 200);
      }
      check();
    });
  }
  const ANTIPLATELET = ['aspirin','clopidogrel','plavix','prasugrel','ticagrelor','阿司匹林','氯吡格雷','普拉格雷','替卡格雷'];
  const NOAC = ['dabigatran','rivaroxaban','apixaban','edoxaban','達比加群','利伐沙班','阿哌沙班','依多沙班'];
  const WARFARIN = ['warfarin','coumadin','華法林'];
  const HEPARIN = ['clexane','enoxaparin','依諾肝素','低分子肝素','heparin'];

  function classify(row) {
    const name = (row.drugName || row.components || row.raw || '').toLowerCase();
    if (SGLT2.some(x => name.includes(x))) return 'SGLT2';
    if (ANTIPLATELET.some(x => name.includes(x))) return 'Antiplatelet';
    if (NOAC.some(x => name.includes(x))) return 'NOAC';
    if (WARFARIN.some(x => name.includes(x))) return 'Warfarin';
    if (HEPARIN.some(x => name.includes(x))) return 'Heparin';
    return 'Other';
  }

  function isActive(row) {
    // active if visitDate within 6 months or contains typical active words
    if (row.visitDate && withinSixMonthsDate(row.visitDate)) return true;
    if (/目前|持續|至今|ongoing|active|current/i.test(row.raw)) return true;
    return false;
  }

  async function runAsync() {
    // wait briefly for async table rendering
    await waitForTableRows(3000);
    const meds = extractFromDataTable();
    const processed = meds.map(r => {
      const category = classify(r);
      const active = isActive(r);
      return Object.assign({}, r, { category, active });
    });

    try {
      chrome.storage.local.set({ lastMeds: processed, scrapedAt: new Date().toISOString() }, () => {
        console.log('NHI Med Organizer: saved', processed.length, 'items');
      });
    } catch (e) {
      localStorage.setItem('lastMeds', JSON.stringify(processed));
    }
    return processed;
  }

  // run immediately (best-effort) and expose async trigger
  runAsync().catch(() => {});
  window.__nhi_med_organizer_run = runAsync;

  // mark as injected for debugging
  try {
    chrome.storage.local.set({ contentScriptLoaded: true, contentScriptLoadedAt: new Date().toISOString() });
  } catch (e) {
    try { localStorage.setItem('contentScriptLoaded', new Date().toISOString()); } catch (e2) {}
  }

  // Listen for messages from the extension popup
    try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'run') {
        // async run
        runAsync().then(processed => sendResponse({ ok: true, count: processed.length })).catch(err => {
          console.error('run failed', err);
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
        });
        return true; // indicate async response
      }
      if (msg && msg.action === 'ping') {
        try { sendResponse({ ok: true, alive: true }); } catch (e) { try { sendResponse({ ok: true, alive: true }); } catch (e2) {} }
        return true;
      }
  // applyFilter removed — no handler
    });
  } catch (e) {
    console.error('onMessage listener setup failed', e);
  }
})();
