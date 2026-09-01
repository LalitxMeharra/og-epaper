"use strict";

let apiConfigData = null;
const state = { step: 1, maxStep: 1, date: null, lang: null, paper: null, edition: null, extractedPages: [] };
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// Init UI Dates
const today = new Date();
$('#todaySeg').textContent = today.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
$('#ticketSerial').textContent = '#RX-' + Math.floor(1000 + Math.random()*9000);

[0, -1, -2].forEach(off => {
  const d = new Date(today); d.setDate(d.getDate()+off);
  const iso = d.toISOString().slice(0,10);
  const btn = document.createElement('button');
  btn.className = 'chip';
  btn.textContent = off===0 ? `Today · ${d.getDate()}` : (off===-1 ? `Yesterday` : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));
  btn.onclick = () => { 
    state.date = iso.replace(/-/g, ''); 
    $('#customDate').value = '';
    fetchConfig(); 
  };
  $('#quickDates').appendChild(btn);
});

$('#customDate').addEventListener('change', (e) => {
    state.date = e.target.value.replace(/-/g, '');
    $$('.chip', $('#quickDates')).forEach(c => c.classList.remove('selected'));
    fetchConfig();
});

// Fetch Live Directory from Python Backend
async function fetchConfig() {
  updateUI();
  $('#loadingConfig').style.display = 'block';
  $('#langGrid').innerHTML = '';
  
  try {
    const res = await fetch(`/api/config/${state.date}`);
    apiConfigData = await res.json();
    buildLanguages();
  } catch (err) {
    alert("Failed to load papers for this date.");
  }
  $('#loadingConfig').style.display = 'none';
}

function buildLanguages() {
  const grid = $('#langGrid');
  grid.innerHTML = '';
  Object.keys(apiConfigData).forEach(lang => {
    const card = document.createElement('div');
    card.className = 'sel-card';
    card.innerHTML = `<p class="title">${lang.charAt(0).toUpperCase() + lang.slice(1)}</p><p class="sub">${Object.keys(apiConfigData[lang]).length} Papers</p>`;
    card.onclick = () => { state.lang = lang; state.paper = null; state.edition = null; updateUI(); };
    if(state.lang === lang) card.classList.add('selected');
    grid.appendChild(card);
  });
}

function buildPapers() {
  const grid = $('#paperGrid');
  grid.innerHTML = '';
  if(!state.lang || !apiConfigData[state.lang]) return;
  
  Object.keys(apiConfigData[state.lang]).forEach(paper => {
    const card = document.createElement('div');
    card.className = 'sel-card';
    card.innerHTML = `<p class="title">${paper}</p><p class="sub">${Object.keys(apiConfigData[state.lang][paper]).length} Editions</p>`;
    card.onclick = () => { state.paper = paper; state.edition = null; updateUI(); };
    if(state.paper === paper) card.classList.add('selected');
    grid.appendChild(card);
  });
}

function buildEditions() {
  const list = $('#editionList');
  list.innerHTML = '';
  if(!state.paper || !apiConfigData[state.lang][state.paper]) return;

  Object.keys(apiConfigData[state.lang][state.paper]).forEach(edition => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = edition;
    btn.onclick = () => { state.edition = edition; updateUI(); };
    if(state.edition === edition) btn.classList.add('selected');
    list.appendChild(btn);
  });
}

function updateUI() {
  setTicket('tDate', state.date);
  setTicket('tLang', state.lang);
  setTicket('tPaper', state.paper);
  setTicket('tEdition', state.edition);

  if(state.lang) buildPapers();
  if(state.paper) buildEditions();
  validateStep();
}

function setTicket(id, val) {
  const el = document.getElementById(id);
  if(val) { el.textContent = val; el.classList.remove('pending'); }
  else { el.textContent = 'Not selected'; el.classList.add('pending'); }
}

// Step Navigation
const stepBtns = $$('.step');
const panels = $$('.panel');
const fill = $('#stepsFill');
const nextBtn = $('#nextBtn');

function renderStep() {
  panels.forEach(p => p.hidden = Number(p.dataset.panel) !== state.step);
  stepBtns.forEach(btn => {
    const n = Number(btn.dataset.step);
    btn.classList.toggle('active', n === state.step);
    btn.classList.toggle('done', n < state.step);
  });
  fill.style.width = ((state.step-1)/4 * 100) + '%';
  $('#backBtn').style.visibility = state.step === 1 ? 'hidden' : 'visible';
  nextBtn.style.display = state.step === 5 ? 'none' : 'block';
  validateStep();
}

function validateStep() {
  let ok = false;
  if(state.step===1) ok = !!state.date;
  if(state.step===2) ok = !!state.lang;
  if(state.step===3) ok = !!state.paper;
  if(state.step===4) ok = !!state.edition;
  if(state.step===5) ok = true;
  nextBtn.disabled = !ok;
}

nextBtn.onclick = () => { if(!nextBtn.disabled) { state.step++; state.maxStep = Math.max(state.maxStep, state.step); renderStep(); } };
$('#backBtn').onclick = () => { if(state.step > 1) { state.step--; renderStep(); } };

// Extraction & Download Handlers
async function extractEpaper() {
    $('#extractionStatus').textContent = "Cracking Mirror Cipher & Bypassing CDN...";
    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
        const data = await res.json();
        if(data.status === "success") {
            state.extractedPages = data.pages;
            $('#extractionStatus').textContent = `Success! ${data.total} Pages Extracted.`;
            return true;
        } else {
            $('#extractionStatus').textContent = "Failed: " + data.detail;
            return false;
        }
    } catch(e) {
        $('#extractionStatus').textContent = "API Error.";
        return false;
    }
}

$('#readOnlineBtn').onclick = async () => {
    if(state.extractedPages.length === 0) await extractEpaper();
    state.extractedPages.forEach(link => window.open(link, '_blank'));
};

$('#downloadBtn').onclick = async () => {
    if(state.extractedPages.length === 0) await extractEpaper();
    // Creates a basic HTML file with links to save them quickly
    let htmlContent = "<h2>Long Press to Save Images</h2><br>";
    state.extractedPages.forEach((link, idx) => {
        htmlContent += `<a href="${link}" download="Page_${idx+1}.jpg" target="_blank">Download Page ${idx+1}</a><br><br>`;
    });
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};

renderStep();
