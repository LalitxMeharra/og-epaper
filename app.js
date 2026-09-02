"use strict";

let apiConfigData = null;
const state = { step: 1, maxStep: 1, date: null, lang: null, paper: null, edition: null, extractedPages: [] };
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const HISTORY_KEY = 'og_epaper_history';

function getLocalYYYYMMDD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

const today = new Date();
$('#todaySeg').textContent = today.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
$('#ticketSerial').textContent = '#RX-' + Math.floor(1000 + Math.random()*9000);

// --- History Logic ---
function saveToHistory() {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    const entry = { lang: state.lang, paper: state.paper, edition: state.edition, date: state.date };
    
    // Remove duplicate if exact paper & edition exists
    history = history.filter(h => !(h.paper === entry.paper && h.edition === entry.edition));
    
    history.unshift(entry);
    if(history.length > 3) history = history.slice(0, 3); // Max 3 items
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    const sec = $('#historySection');
    const list = $('#historyList');
    list.innerHTML = '';
    
    if(history.length === 0) {
        sec.style.display = 'none';
        return;
    }
    
    sec.style.display = 'block';
    history.forEach((h) => {
        const dFormat = h.date.replace(/(\d{4})(\d{2})(\d{2})/, "$3-$2-$1");
        const card = document.createElement('div');
        card.className = 'hist-card';
        card.innerHTML = `
            <div>
                <div class="hist-title">${h.paper} - ${h.edition}</div>
                <div class="hist-meta">Language: ${h.lang} | Last Date: ${dFormat}</div>
            </div>
            <div class="hist-actions">
                <button class="hist-btn" onclick="quickLoadHistory('${h.lang}', '${h.paper}', '${h.edition}', '${h.date}')">Read ${dFormat}</button>
                <button class="hist-btn" onclick="quickLoadHistory('${h.lang}', '${h.paper}', '${h.edition}', '${getLocalYYYYMMDD(new Date())}')">Read Today</button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.quickLoadHistory = async function(lang, paper, edition, targetDate) {
    const statusEl = $('#historyStatus');
    statusEl.style.display = 'block';
    statusEl.textContent = `Validating availability for ${targetDate}...`;
    
    try {
        const res = await fetch(`/api/config/${targetDate}`);
        const data = await res.json();
        
        // BUG FIX: Used 'in' operator instead of .includes() for JS Objects
        if(data.error || !data[lang] || !data[lang][paper] || !(edition in data[lang][paper])) {
            alert(`Sorry, ${paper} (${edition}) is not available on TradingRef for date: ${targetDate}.`);
            statusEl.style.display = 'none';
            return;
        }
        
        apiConfigData = data;
        state.date = targetDate;
        state.lang = lang;
        state.paper = paper;
        state.edition = edition;
        state.extractedPages = [];
        $('#extractionStatus').textContent = "";
        
        updateUI();
        state.step = 5;
        state.maxStep = 5;
        renderStep();
    } catch(e) {
        console.error(e);
        alert("API Error: Unable to fetch data.");
    }
    statusEl.style.display = 'none';
};

[0, -1, -2, -3].forEach(off => {
    const d = new Date(today); 
    d.setDate(d.getDate() + off);
    const dateStr = getLocalYYYYMMDD(d);
    
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = off === 0 ? `Today · ${d.getDate()}` : (off === -1 ? `Yesterday` : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));
    btn.dataset.val = dateStr;
    
    btn.onclick = () => { 
        state.date = dateStr; 
        $('#customDate').value = '';
        fetchConfig(); 
    };
    $('#quickDates').appendChild(btn);
});

$('#customDate').addEventListener('change', (e) => {
    if(!e.target.value) return;
    const d = new Date(e.target.value);
    state.date = getLocalYYYYMMDD(d);
    fetchConfig();
});

async function fetchConfig() {
    updateUI();
    $('#loadingConfig').style.display = 'block';
    $('#langGrid').innerHTML = '';
    
    try {
        const res = await fetch(`/api/config/${state.date}`);
        const data = await res.json();
        
        if(data.error || data.detail) {
            alert("Backend Error: " + (data.message || data.detail));
            $('#loadingConfig').style.display = 'none';
            return;
        }
        
        apiConfigData = data;
        buildLanguages();
        
        state.step = 2; 
        state.maxStep = Math.max(state.maxStep, 2);
        renderStep();
    } catch (err) {
        alert("Deploy to Vercel first! Local HTML cannot fetch /api/ routes.");
    }
    $('#loadingConfig').style.display = 'none';
}

function buildLanguages() {
    const grid = $('#langGrid');
    grid.innerHTML = '';
    if (typeof apiConfigData !== 'object' || apiConfigData === null) return;
    
    Object.keys(apiConfigData).forEach(lang => {
        const card = document.createElement('div');
        card.className = 'sel-card';
        card.innerHTML = `<p class="title">${lang.charAt(0).toUpperCase() + lang.slice(1)}</p><p class="sub">${Object.keys(apiConfigData[lang]).length} Papers</p>`;
        
        card.onclick = () => { 
            state.lang = lang; state.paper = null; state.edition = null; 
            state.extractedPages = [];
            $('#extractionStatus').textContent = "";
            
            updateUI(); 
            state.step = 3; state.maxStep = Math.max(state.maxStep, 3);
            renderStep();
        };
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
        
        card.onclick = () => { 
            state.paper = paper; state.edition = null; 
            state.extractedPages = [];
            $('#extractionStatus').textContent = "";

            updateUI(); 
            state.step = 4; state.maxStep = Math.max(state.maxStep, 4);
            renderStep();
        };
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
        
        btn.onclick = () => { 
            state.edition = edition; 
            state.extractedPages = [];
            $('#extractionStatus').textContent = "";

            updateUI(); 
            state.step = 5; state.maxStep = Math.max(state.maxStep, 5);
            renderStep();
            
            // Save to Local History
            saveToHistory();
        };
        if(state.edition === edition) btn.classList.add('selected');
        list.appendChild(btn);
    });
}

function updateUI() {
    $$('.chip', $('#quickDates')).forEach(c => c.classList.toggle('selected', c.dataset.val === state.date));
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

stepBtns.forEach(b => b.onclick = () => {
    const n = Number(b.dataset.step);
    if(n <= state.maxStep) { state.step = n; renderStep(); }
});

async function extractEpaper() {
    const statusEl = $('#extractionStatus');
    statusEl.textContent = "Fetching Direct URLs from Server...";
    statusEl.style.color = "var(--rust)";
    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
        const data = await res.json();
        if(data.status === "success") {
            state.extractedPages = data.pages;
            statusEl.textContent = `Success! ${data.total} Pages Loaded.`;
            statusEl.style.color = "var(--success)";
            return true;
        } else {
            statusEl.textContent = "Failed: " + (data.detail || "Server error");
            return false;
        }
    } catch(e) {
        statusEl.textContent = "API Error. Deploy to Vercel to fix.";
        return false;
    }
}

// --- Professional Gallery Viewer (PhotoSwipe) ---
$('#readOnlineBtn').onclick = async () => {
    if(state.extractedPages.length === 0) {
        const success = await extractEpaper();
        if(!success) return;
    }
    
    const dataSource = state.extractedPages.map(url => ({
        src: url,
        w: 1400,
        h: 2100, 
        alt: 'E-Paper Page'
    }));
    
    const lightbox = new window.PhotoSwipeLightbox({
        dataSource: dataSource,
        pswpModule: window.PhotoSwipe,
        bgOpacity: 0.95,
        wheelToZoom: true,
        padding: { top: 20, bottom: 20, left: 20, right: 20 }
    });
    
    lightbox.init();
    lightbox.loadAndOpen(0);
};

// --- Compressed Single PDF Downloader ---
$('#downloadBtn').onclick = async () => {
    if(state.extractedPages.length === 0) {
        const success = await extractEpaper();
        if(!success) return;
    }
    
    const statusEl = $('#extractionStatus');
    statusEl.textContent = "Optimizing & Building PDF... Please wait.";
    statusEl.style.color = "var(--ink)";
    
    try {
        const { jsPDF } = window.jspdf;
        let pdf = null;
        
        for(let i = 0; i < state.extractedPages.length; i++) {
            statusEl.textContent = `Processing Page ${i+1} of ${state.extractedPages.length}...`;
            
            const response = await fetch(state.extractedPages[i]);
            const blob = await response.blob();
            const b64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            
            const img = new Image();
            img.src = b64;
            await new Promise(r => img.onload = r);
            
            const orientation = img.width > img.height ? 'l' : 'p';
            if (i === 0) {
                pdf = new jsPDF({ orientation: orientation, unit: 'px', format: [img.width, img.height] });
            } else {
                pdf.addPage([img.width, img.height], orientation);
                pdf.setPage(i + 1);
            }
            
            pdf.addImage(b64, 'JPEG', 0, 0, img.width, img.height);
        }
        
        statusEl.textContent = "Saving PDF file...";
        const fileName = `${state.paper}_${state.edition}_${state.date}.pdf`.replace(/\s+/g, "_");
        pdf.save(fileName);
        
        statusEl.textContent = "Download Complete! Size Minimized.";
        statusEl.style.color = "var(--success)";
    } catch (e) {
        statusEl.textContent = "PDF Generation failed. Try reading online.";
        statusEl.style.color = "var(--rust)";
    }
};

renderHistory();
renderStep();
