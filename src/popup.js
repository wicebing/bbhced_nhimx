// popup.js - simplified and more reliable

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function loadMeds() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['lastMeds','scrapedAt'], data => resolve(data));
    } catch (e) {
      const last = localStorage.getItem('lastMeds');
      resolve({ lastMeds: last ? JSON.parse(last) : [], scrapedAt: null });
    }
  });
}

function render() {
  loadMeds().then(data => {
    document.getElementById('meta').textContent = '抓取時間: ' + (data.scrapedAt || '無');
    const meds = data.lastMeds || [];
    const reportList = document.getElementById('list');
    reportList.innerHTML = '';

    const grouped = meds.reduce((acc, m) => { (acc[m.category] = acc[m.category] || []).push(m); return acc; }, {});

    const summary = document.getElementById('summary');
    summary.innerHTML = '';
    summary.appendChild(el('div','summary-item','總筆數: ' + meds.length));

    const priority = ['SGLT2','Antiplatelet','NOAC','Warfarin','Heparin'];

    // render priority categories first, always show and say 無使用 when empty
    priority.forEach(cat => {
      const list = grouped[cat] || [];
      const box = el('div','category');
      box.appendChild(el('h3', null, cat + ' (' + list.length + ')' + (list.length ? '' : '（重點）')));
      if (list.length === 0) {
        box.appendChild(el('div','none','無使用'));
      } else {
        const ul = el('ul','meds');
        list.forEach(m => {
          const li = el('li','med');
          if (m.active) li.classList.add('active');
          if (priority.includes(m.category)) li.classList.add('important');
          li.appendChild(el('div','name', m.name || m.drugName || m.raw));
          li.appendChild(el('div','meta', (m.dose || '') + ' ' + (m.start||'') + (m.end?(' - '+m.end):'')));
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      reportList.appendChild(box);
    });

    // render other categories
    const others = Object.keys(grouped).filter(c => !priority.includes(c)).sort();
    others.forEach(cat => {
      const list = grouped[cat] || [];
      const box = el('div','category');
      box.appendChild(el('h3', null, cat + ' (' + list.length + ')'));
      const ul = el('ul','meds');
      list.forEach(m => {
        const li = el('li','med');
        if (m.active) li.classList.add('active');
        li.appendChild(el('div','name', m.name || m.drugName || m.raw));
        li.appendChild(el('div','meta', (m.dose || '') + ' ' + (m.start||'') + (m.end?(' - '+m.end):'')));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      reportList.appendChild(box);
    });
  });
}

// Inline page scraper to run inside the page context (returns meds array)
function inlineScraperCode() {
  // this function is serialized and executed in page context
  return (() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    function parseDate(s){ if(!s) return null; const m = (s||'').trim().match(/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/); if(m){ let y=Number(m[1]); if(y<1900) y=y+1911; return new Date(y,Number(m[2])-1,Number(m[3])); } const d=new Date(s); return isNaN(d)?null:d; }
    const SGLT2 = ['canagliflozin','dapagliflozin','empagliflozin','ertugliflozin','卡納格列汀','達格列淨','恩格列淨'];
    const ANTI = ['aspirin','clopidogrel','prasugrel','ticagrelor','plavix','阿司匹林','氯吡格雷'];
    const NOAC = ['dabigatran','rivaroxaban','apixaban','edoxaban','達比加群','利伐沙班','阿哌沙班'];
    const WARF = ['warfarin','coumadin','華法林'];
    const HEP = ['clexane','enoxaparin','heparin','依諾肝素'];

    const table = document.querySelector('#DataTables_Table_1') || document.querySelector('.dataTables_scrollBody table') || document.querySelector('table.dataTable');
    if (!table) return { ok:false, error: 'table not found' };
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const meds = rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const visit = norm(cells[1] && cells[1].innerText);
      const comp = norm(cells[6] && cells[6].innerText);
      const drug = norm(cells[7] && cells[7].innerText);
      const dose = norm(cells[8] && cells[8].innerText);
      const days = norm(cells[10] && cells[10].innerText);
      const visitDate = parseDate(visit);
      const raw = norm(tr.innerText);
      const nameLower = (drug + ' ' + comp + ' ' + raw).toLowerCase();
      let category = 'Other';
      if (SGLT2.some(x => nameLower.includes(x))) category = 'SGLT2';
      else if (ANTI.some(x => nameLower.includes(x))) category = 'Antiplatelet';
      else if (NOAC.some(x => nameLower.includes(x))) category = 'NOAC';
      else if (WARF.some(x => nameLower.includes(x))) category = 'Warfarin';
      else if (HEP.some(x => nameLower.includes(x))) category = 'Heparin';
      const active = /目前|持續|至今|ongoing|active|current/i.test(raw);
      return { visitDate: visitDate && visitDate.toISOString ? visitDate.toISOString() : null, components: comp, drugName: drug, dose, days, raw, category, active };
    });
    return { ok:true, meds };
  })();
}

// wrapper to execute inline scraper in the page and persist results via callback
function runInlineScraper(tabId, cb) {
  chrome.scripting.executeScript({ target: { tabId }, func: inlineScraperCode }, (res) => {
    const err = chrome.runtime.lastError;
    if (err) { console.warn('inlineScraper executeScript error', err); cb([]); return; }
    const out = res && res[0] && res[0].result;
    if (!out || !out.ok) { console.warn('inlineScraper returned error', out); cb([]); return; }
    cb(out.meds || []);
  });
}

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  // show content-script injection status
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) { setStatus('內容腳本: 未注入'); return; }
      if (resp && resp.ok) setStatus('內容腳本: 已注入');
    });
  });

  document.getElementById('refresh').addEventListener('click', () => {
    setStatus('抓取中…');
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs[0]) { setStatus('找不到目前分頁'); return; }
      const tabId = tabs[0].id;

      // try content script first (fast path)
      let done = false;
      try {
        chrome.tabs.sendMessage(tabId, { action: 'run' }, (resp) => {
          const err = chrome.runtime.lastError;
          if (!err && resp && resp.ok) {
            done = true;
            // content script saved results; render from storage
            setTimeout(() => { render(); setStatus('完成（抓到 ' + resp.count + ' 筆）'); }, 300);
            return;
          }
          // otherwise fallback
          if (!done) {
            setStatus('使用頁面抓取替代內容腳本...');
            runInlineScraper(tabId, (meds) => { try { chrome.storage.local.set({ lastMeds: meds, scrapedAt: new Date().toISOString() }, () => { render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); }); } catch (e) { try { localStorage.setItem('lastMeds', JSON.stringify(meds)); } catch(_){} render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); } });
          }
        });
        // if no quick response in 800ms, trigger inline scraper proactively
        setTimeout(() => {
          if (!done) {
            done = true;
            setStatus('內容腳本未快速回應，開始頁面抓取...');
            runInlineScraper(tabId, (meds) => { try { chrome.storage.local.set({ lastMeds: meds, scrapedAt: new Date().toISOString() }, () => { render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); }); } catch (e) { try { localStorage.setItem('lastMeds', JSON.stringify(meds)); } catch(_){} render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); } });
          }
        }, 800);
      } catch (e) {
        // sendMessage failed immediately — fallback to inline scraper
        setStatus('無法使用內容腳本，改以頁面抓取...');
        runInlineScraper(tabId, (meds) => { try { chrome.storage.local.set({ lastMeds: meds, scrapedAt: new Date().toISOString() }, () => { render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); }); } catch (e) { try { localStorage.setItem('lastMeds', JSON.stringify(meds)); } catch(_){} render(); setStatus('完成（抓到 ' + (meds && meds.length || 0) + ' 筆）'); } });
      }
    });
  });

  const openBtn = document.createElement('button');
  openBtn.textContent = '開啟完整報表';
  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/report.html') });
  });
  document.getElementById('controls').appendChild(openBtn);

  render();
});

// (duplicate DOMContentLoaded block removed)
