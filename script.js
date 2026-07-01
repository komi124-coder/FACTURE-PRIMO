import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFRJ8nsVdo8n5kAM9iiEzcl-XDgbuecXU",
  authDomain: "gestion-boutique-74147.firebaseapp.com",
  projectId: "gestion-boutique-74147",
  storageBucket: "gestion-boutique-74147.firebasestorage.app",
  messagingSenderId: "556382632150",
  appId: "1:556382632150:web:7cd071e38425f514d3f177"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── ÉTAT GLOBAL ───────────────────────────────────────
let state = {
  biens: [], clients: [], factures: [], paiements: [], journal: [],
  biensFilter: 'tous', clientsFilter: 'tous',
  facturesFilter: 'tous', facturesSearch: '',
  journalFilter: 'tous',
  lignes: [], nextFactNum: 1,
  currentPage: 'dashboard',
  currentInvoiceNum: ''
};

// ─── CATÉGORIES JOURNAL ───────────────────────────────
const JOURNAL_CATS = {
  recette: [
    { value:'loyer-in',    label:'Loyer reçu',           css:'cat-loyer-in' },
    { value:'honoraires',  label:'Honoraires',            css:'cat-honoraires' },
    { value:'foncier-rec', label:'Dossier foncier',       css:'cat-foncier-rec' },
    { value:'vente',       label:'Vente immobilière',     css:'cat-vente' },
    { value:'autre-rec',   label:'Autre recette',         css:'cat-autre-rec' },
  ],
  depense: [
    { value:'salaires',    label:'Salaires / Personnel',  css:'cat-salaires' },
    { value:'fournitures', label:'Fournitures / Matériel',css:'cat-fournitures' },
    { value:'loyer-out',   label:'Loyer bureau',          css:'cat-loyer-out' },
    { value:'telecom',     label:'Télécom / Internet',    css:'cat-telecom' },
    { value:'transport',   label:'Transport / Carburant', css:'cat-transport' },
    { value:'autre-dep',   label:'Autre dépense',         css:'cat-autre-dep' },
  ]
};
const getCatInfo = (type, value) => {
  const list = JOURNAL_CATS[type] || [];
  return list.find(c => c.value === value) || { label: value, css: 'cat-autre-rec' };
};

// ─── HELPERS ──────────────────────────────────────────
const fmt = n => Number(Math.round(n)).toLocaleString('fr-FR');
const fmtM = n => { const v=Math.round(n); return v>=1000000 ? (v/1000000).toFixed(1).replace('.0','')+'M' : v>=1000 ? (v/1000).toFixed(0)+'k' : String(v); };
const today = () => { const d=new Date(); return d.toISOString().split('T')[0]; };
const fmtDate = ts => { if(!ts) return '—'; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('fr-FR'); };
const genNum = () => { const n = String(state.nextFactNum).padStart(3,'0'); return `FAC-${new Date().getFullYear()}-${n}`; };
const showToast = (msg, type='success') => {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
};
const setDbStatus = (s) => {
  const dot = document.getElementById('db-dot');
  const lbl = document.getElementById('db-label');
  if(s==='ok'){ dot.className='db-dot connected'; lbl.textContent='Firebase connecté'; }
  else if(s==='err'){ dot.className='db-dot error'; lbl.textContent='Erreur Firebase'; }
  else { dot.className='db-dot'; lbl.textContent='Connexion...'; }
};
const TYPE_BADGES = { foncier:'b-purple', info:'b-blue', honoraires:'b-teal', loyer:'b-green' };
const TYPE_LABELS = { foncier:'Foncier', info:'Informatique', honoraires:'Honoraires', loyer:'Loyer' };
const STATUT_BADGES = { payee:'b-green', attente:'b-amber', impayee:'b-red', loue:'b-green', disponible:'b-blue', vente:'b-amber', locataire:'b-green', acheteur:'b-blue', prospect:'b-gray' };
const STATUT_LABELS = { payee:'Payée', attente:'En attente', impayee:'Impayée', loue:'Loué', disponible:'Disponible', vente:'À vendre', locataire:'Locataire', acheteur:'Acheteur', prospect:'Prospect' };
const PRESETS = {
  foncier:['Suivi et traitement de dossier de titre foncier','Mutation / Transfert de propriété foncière','Constitution de dossier de lotissement','Attestation de propriété foncière','Immatriculation foncière'],
  info:['Développement de site web','Maintenance réseau et postes informatiques','Installation et configuration serveur','Création d\'application mobile','Formation et assistance informatique'],
  honoraires:['Honoraires de négociation immobilière','Conseil en acquisition de bien','Étude de faisabilité foncière','Représentation et mandatement client','Évaluation et expertise immobilière'],
  loyer:['Loyer mensuel — appartement','Loyer mensuel — villa','Loyer mensuel — bureau','Loyer mensuel — boutique / commerce'],
};

// ─── NAVIGATION ───────────────────────────────────────
window.nav = function(page, el) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  const titles = { dashboard:'Tableau de bord', biens:'Biens immobiliers', clients:'Clients — CRM', paiements:'Paiements & Loyers', factures:'Facturation', 'nouvelle-facture':'Nouvelle facture', journal:'Journal quotidien', rapport:'Rapport financier' };
  document.getElementById('page-title').textContent = titles[page]||page;
  if(el) el.classList.add('active');
  else {
    document.querySelectorAll('.nav-item').forEach(n=>{
      if(n.getAttribute('onclick')&&n.getAttribute('onclick').includes(`'${page}'`)) n.classList.add('active');
    });
  }
  state.currentPage = page;
  if(page==='biens') renderBiens();
  if(page==='clients') renderClients();
  if(page==='paiements') renderPaiements();
  if(page==='factures') renderFactures();
  if(page==='nouvelle-facture') initNF();
  if(page==='journal') initJournal();
  if(page==='rapport') initRapport();
};
window.topbarAction = () => {
  const actions = { dashboard:'nouvelle-facture', biens:'bien', clients:'client', paiements:'paiement', factures:'nouvelle-facture', 'nouvelle-facture':'nouvelle-facture', journal:'journal-entry', rapport:'rapport-noop' };
  const a = actions[state.currentPage]||'nouvelle-facture';
  if(a==='nouvelle-facture') nav('nouvelle-facture',null);
  else if(a==='journal-entry') document.getElementById('j-desc')?.focus();
  else if(a==='rapport-noop') printRapport();
  else openModal(a);
};

// ─── FIREBASE LOAD ALL ────────────────────────────────
async function loadAll() {
  try {
    setDbStatus('loading');
    const [bSnap, cSnap, fSnap, pSnap, jSnap] = await Promise.all([
      getDocs(query(collection(db,'biens'), orderBy('createdAt','desc'))),
      getDocs(query(collection(db,'clients'), orderBy('createdAt','desc'))),
      getDocs(query(collection(db,'factures'), orderBy('createdAt','desc'))),
      getDocs(query(collection(db,'paiements'), orderBy('createdAt','desc'))),
      getDocs(query(collection(db,'journal'), orderBy('createdAt','desc'))),
    ]);
    state.biens = bSnap.docs.map(d=>({id:d.id,...d.data()}));
    state.clients = cSnap.docs.map(d=>({id:d.id,...d.data()}));
    state.factures = fSnap.docs.map(d=>({id:d.id,...d.data()}));
    state.paiements = pSnap.docs.map(d=>({id:d.id,...d.data()}));
    state.journal = jSnap.docs.map(d=>({id:d.id,...d.data()}));
    state.nextFactNum = state.factures.length + 1;
    setDbStatus('ok');
    populateClientSelects();
    renderDashboard();
  } catch(e) {
    setDbStatus('err');
    showToast('Erreur Firebase : '+e.message, 'error');
    console.error(e);
  }
}

// ─── DASHBOARD ────────────────────────────────────────
function renderDashboard() {
  const now = new Date();
  const thisMonth = state.factures.filter(f => {
    if(!f.createdAt) return false;
    const d = f.createdAt.toDate ? f.createdAt.toDate() : new Date(f.createdAt);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  const totalFact = thisMonth.reduce((s,f)=>s+(f.ttc||0),0);
  const impayes = state.factures.filter(f=>f.statut==='impayee').length;

  document.getElementById('m-biens').textContent = state.biens.length || '0';
  document.getElementById('m-clients').textContent = state.clients.length || '0';
  document.getElementById('m-facture').textContent = fmtM(totalFact);
  document.getElementById('m-impayes').textContent = impayes || '0';

  const dfEl = document.getElementById('dash-factures');
  const df = state.factures.slice(0,5);
  if(!df.length) { dfEl.innerHTML='<div class="empty-state"><p>Aucune facture encore</p><button class="btn btn-primary btn-sm" onclick="nav(\'nouvelle-facture\',null)">Créer une facture</button></div>'; }
  else dfEl.innerHTML=`<table class="tbl"><thead><tr><th>N°</th><th>Client</th><th>Service</th><th>Montant</th><th>Statut</th></tr></thead><tbody>${
    df.map(f=>`<tr onclick="showInvoice('${f.id}')" style="cursor:pointer">
      <td style="font-size:11px;color:var(--green);font-weight:600">${f.numero||'—'}</td>
      <td style="font-weight:500">${f.clientNom||'—'}</td>
      <td><span class="badge ${TYPE_BADGES[f.type]||'b-gray'}">${TYPE_LABELS[f.type]||f.type}</span></td>
      <td style="font-weight:600">${fmt(f.ttc||0)} F</td>
      <td><span class="badge ${STATUT_BADGES[f.statut]||'b-gray'}">${STATUT_LABELS[f.statut]||f.statut}</span></td>
    </tr>`).join('')
  }</tbody></table>`;

  const dbEl = document.getElementById('dash-biens');
  const db2 = state.biens.slice(0,4);
  const icos = { villa:'🏠', appartement:'🏢', bureau:'🏬', boutique:'🏪', terrain:'🌍', autre:'🏗' };
  if(!db2.length) { dbEl.innerHTML='<div class="empty-state"><p>Aucun bien encore</p><button class="btn btn-primary btn-sm" onclick="openModal(\'bien\')">Ajouter un bien</button></div>'; }
  else dbEl.innerHTML=db2.map(b=>`<div class="bien-row">
    <div class="bien-ico">${icos[b.type]||'🏗'}</div>
    <div class="bien-info"><div class="bien-name">${b.nom}</div><div class="bien-loc">${b.localisation||''}</div></div>
    <div><div class="bien-prix">${fmt(b.prix||0)} F</div><span class="badge ${STATUT_BADGES[b.statut]||'b-gray'}">${STATUT_LABELS[b.statut]||b.statut}</span></div>
  </div>`).join('');
}

// ─── BIENS ────────────────────────────────────────────
window.filterBiens = (f,el) => {
  state.biensFilter=f;
  document.querySelectorAll('#page-biens .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderBiens();
};
function renderBiens() {
  const filtered = state.biensFilter==='tous' ? state.biens : state.biens.filter(b=>b.statut===state.biensFilter);
  document.getElementById('biens-count').textContent = `${filtered.length} bien(s)`;
  const el = document.getElementById('biens-table');
  if(!filtered.length){ el.innerHTML='<div class="empty-state"><p>Aucun bien dans cette catégorie</p><button class="btn btn-primary btn-sm" onclick="openModal(\'bien\')">+ Ajouter</button></div>'; return; }
  el.innerHTML=`<table class="tbl"><thead><tr><th>Réf.</th><th>Nom</th><th>Type</th><th>Localisation</th><th>Surface</th><th>Loyer / Prix</th><th>Statut</th><th></th></tr></thead><tbody>${
    filtered.map((b,i)=>`<tr>
      <td style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">PS-${String(i+1).padStart(3,'0')}</td>
      <td style="font-weight:500">${b.nom}</td>
      <td>${b.type||'—'}</td>
      <td style="color:var(--text2)">${b.localisation||'—'}</td>
      <td>${b.surface||'—'}</td>
      <td style="font-weight:600">${fmt(b.prix||0)} F</td>
      <td><span class="badge ${STATUT_BADGES[b.statut]||'b-gray'}">${STATUT_LABELS[b.statut]||b.statut}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="deleteBien('${b.id}')">✕</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}

// ─── CLIENTS ──────────────────────────────────────────
window.filterClients = (f,el) => {
  state.clientsFilter=f;
  document.querySelectorAll('#page-clients .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderClients();
};
function renderClients() {
  const filtered = state.clientsFilter==='tous' ? state.clients : state.clients.filter(c=>c.type===state.clientsFilter);
  document.getElementById('clients-count').textContent = `${filtered.length} client(s)`;
  const el = document.getElementById('clients-table');
  if(!filtered.length){ el.innerHTML='<div class="empty-state"><p>Aucun client dans cette catégorie</p><button class="btn btn-primary btn-sm" onclick="openModal(\'client\')">+ Ajouter</button></div>'; return; }
  el.innerHTML=`<table class="tbl"><thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th>Bien associé</th><th>Statut</th><th></th></tr></thead><tbody>${
    filtered.map(c=>`<tr>
      <td style="font-weight:500">${c.nom}</td>
      <td><span class="badge ${STATUT_BADGES[c.type]||'b-gray'}">${STATUT_LABELS[c.type]||c.type}</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${c.telephone||'—'}</td>
      <td style="color:var(--text2);font-size:12px">${c.email||'—'}</td>
      <td>${c.bienAssocie||'—'}</td>
      <td><span class="badge ${c.actif?'b-green':'b-gray'}">${c.actif?'Actif':'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="deleteClient('${c.id}')">✕</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}

// ─── PAIEMENTS ────────────────────────────────────────
function renderPaiements() {
  const encaisse = state.paiements.filter(p=>p.statut==='paye').reduce((s,p)=>s+(p.montant||0),0);
  const attente = state.paiements.filter(p=>p.statut==='attente').reduce((s,p)=>s+(p.montant||0),0);
  const impayes = state.paiements.filter(p=>p.statut==='impaye').reduce((s,p)=>s+(p.montant||0),0);
  document.getElementById('p-encaisse').textContent = fmtM(encaisse);
  document.getElementById('p-attente').textContent = fmtM(attente);
  document.getElementById('p-impayes').textContent = fmtM(impayes);

  const el = document.getElementById('paiements-table');
  if(!state.paiements.length){ el.innerHTML='<div class="empty-state"><p>Aucun paiement enregistré</p><button class="btn btn-primary btn-sm" onclick="openModal(\'paiement\')">+ Enregistrer</button></div>'; return; }
  const statPB = { paye:'b-green', attente:'b-amber', impaye:'b-red' };
  const statPL = { paye:'Payé', attente:'En attente', impaye:'Impayé' };
  el.innerHTML=`<table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Bien / Objet</th><th>Type</th><th>Montant (FCFA)</th><th>Mode</th><th>Statut</th></tr></thead><tbody>${
    state.paiements.map(p=>`<tr>
      <td style="color:var(--text2)">${fmtDate(p.createdAt)}</td>
      <td style="font-weight:500">${p.clientNom||'—'}</td>
      <td>${p.objet||'—'}</td>
      <td><span class="badge ${TYPE_BADGES[p.type]||'b-gray'}">${TYPE_LABELS[p.type]||p.type||'—'}</span></td>
      <td style="font-weight:600">${fmt(p.montant||0)}</td>
      <td style="font-size:12px;color:var(--text2)">${p.modePaiement||'—'}</td>
      <td><span class="badge ${statPB[p.statut]||'b-gray'}">${statPL[p.statut]||p.statut}</span></td>
    </tr>`).join('')
  }</tbody></table>`;
}

// ─── FACTURES ─────────────────────────────────────────
window.filterFactures = (f,el) => {
  state.facturesFilter=f;
  document.querySelectorAll('#page-factures .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderFactures();
};
window.searchFactures = v => { state.facturesSearch=v; renderFactures(); };

function renderFactures() {
  let list = state.facturesFilter==='tous' ? state.factures : state.factures.filter(f=>f.type===state.facturesFilter);
  if(state.facturesSearch) list=list.filter(f=>[f.clientNom,f.numero,f.description].some(s=>(s||'').toLowerCase().includes(state.facturesSearch.toLowerCase())));

  const total = state.factures.reduce((s,f)=>s+(f.ttc||0),0);
  const payees = state.factures.filter(f=>f.statut==='payee').reduce((s,f)=>s+(f.ttc||0),0);
  const att = state.factures.filter(f=>f.statut==='attente').reduce((s,f)=>s+(f.ttc||0),0);
  const imp = state.factures.filter(f=>f.statut==='impayee').reduce((s,f)=>s+(f.ttc||0),0);
  document.getElementById('f-total').textContent = fmtM(total);
  document.getElementById('f-payees').textContent = fmtM(payees);
  document.getElementById('f-attente').textContent = fmtM(att);
  document.getElementById('f-impayes').textContent = fmtM(imp);

  const el = document.getElementById('factures-table');
  if(!list.length){ el.innerHTML='<div class="empty-state"><p>Aucune facture</p><button class="btn btn-primary btn-sm" onclick="nav(\'nouvelle-facture\',null)">Créer une facture</button></div>'; return; }
  el.innerHTML=`<table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Service</th><th>Description</th><th>HT</th><th>TTC</th><th>Statut</th><th></th></tr></thead><tbody>${
    list.map(f=>`<tr>
      <td style="font-size:11px;color:var(--green);font-weight:600;font-family:'DM Mono',monospace">${f.numero||'—'}</td>
      <td style="color:var(--text2);white-space:nowrap">${fmtDate(f.createdAt)}</td>
      <td style="font-weight:500">${f.clientNom||'—'}</td>
      <td><span class="badge ${TYPE_BADGES[f.type]||'b-gray'}">${TYPE_LABELS[f.type]||f.type}</span></td>
      <td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.description||'—'}</td>
      <td>${fmt(f.ht||0)} F</td>
      <td style="font-weight:600">${fmt(f.ttc||0)} F</td>
      <td><span class="badge ${STATUT_BADGES[f.statut]||'b-gray'}">${STATUT_LABELS[f.statut]||f.statut}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="showInvoice('${f.id}')" title="Aperçu">👁</button>
        <button class="btn btn-ghost btn-sm" onclick="markPaid('${f.id}','${f.statut}')" title="Changer statut">💳</button>
        <button class="btn btn-ghost btn-sm btn-pdf-inline" onclick="quickDownloadPDF('${f.id}')" title="Télécharger PDF">⬇</button>
      </td>
    </tr>`).join('')
  }</tbody></table>`;
}

// ─── SHOW INVOICE ─────────────────────────────────────
window.showInvoice = function(id) {
  const f = state.factures.find(x=>x.id===id); if(!f) return;
  state.currentInvoiceNum = f.numero || 'facture';
  document.getElementById('inv-num').textContent = f.numero||'—';
  document.getElementById('inv-date').textContent = 'Émis le : '+fmtDate(f.createdAt);
  document.getElementById('inv-ech').textContent = f.echeance ? 'Échéance : '+f.echeance : '';
  document.getElementById('inv-ref').textContent = f.ref ? 'Réf : '+f.ref : '';
  document.getElementById('inv-client').innerHTML = `<strong>${f.clientNom||'—'}</strong><br>Ouagadougou, BF`;
  const lignes = f.lignes||[{desc:f.description||'—',qte:1,pu:f.ht||0,tva:f.tauxTva||0}];
  document.getElementById('inv-lignes').innerHTML = lignes.map(l=>`<tr><td>${l.desc}</td><td style="text-align:right">${l.qte}</td><td style="text-align:right">${fmt(l.pu)}</td><td style="text-align:right">${fmt((l.qte||1)*(l.pu||0))}</td></tr>`).join('');
  document.getElementById('inv-ht').textContent = fmt(f.ht||0)+' FCFA';
  document.getElementById('inv-tva-val').textContent = fmt((f.ttc||0)-(f.ht||0))+' FCFA';
  document.getElementById('inv-ttc').textContent = fmt(f.ttc||0)+' FCFA';
  document.getElementById('inv-stamp-wrap').style.display = f.statut==='payee'?'block':'none';
  document.getElementById('inv-bg').style.display = 'flex';
};

// ─── TÉLÉCHARGEMENT PDF ───────────────────────────────
window.downloadInvoicePDF = async function() {
  const btn = document.getElementById('btn-dl-pdf');
  btn.classList.add('pdf-loading');
  btn.textContent = '⏳ Génération...';
  try {
    const element = document.getElementById('inv-preview-content');
    // Cacher les boutons pendant la capture
    const actionDiv = element.querySelector('.no-print');
    if(actionDiv) actionDiv.style.display = 'none';

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    if(actionDiv) actionDiv.style.display = '';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const imgW = 210;
    const imgH = (canvas.height * imgW) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH);
    pdf.save(`${state.currentInvoiceNum || 'facture'}-PRIMO-SOLUTION.pdf`);
    showToast('✓ PDF téléchargé avec succès !');
  } catch(e) {
    showToast('Erreur PDF : '+e.message, 'error');
    console.error(e);
  }
  btn.classList.remove('pdf-loading');
  btn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 16 16"><path d="M2 10v4h12v-4M8 2v8M5 6l3 3 3-3"/></svg> Télécharger PDF';
};

// Téléchargement rapide depuis la liste sans ouvrir l'aperçu
window.quickDownloadPDF = async function(id) {
  const f = state.factures.find(x=>x.id===id); if(!f) return;
  showInvoice(id);
  // Laisser le modal s'afficher puis lancer le téléchargement
  setTimeout(() => downloadInvoicePDF(), 400);
};

// ─── MARK PAID ────────────────────────────────────────
window.markPaid = async function(id, current) {
  const statuts = ['payee','attente','impayee'];
  const next = statuts[(statuts.indexOf(current)+1)%statuts.length];
  try {
    await updateDoc(doc(db,'factures',id), { statut: next });
    const f = state.factures.find(x=>x.id===id);
    if(f) f.statut=next;
    renderFactures(); renderDashboard();
    showToast(`Statut → ${STATUT_LABELS[next]}`);
  } catch(e) { showToast('Erreur : '+e.message,'error'); }
};

// ─── NOUVELLE FACTURE ─────────────────────────────────
let lid = 0;
function initNF() {
  const d = new Date();
  const e = new Date(d); e.setDate(e.getDate()+15);
  document.getElementById('nf-date').value = today();
  document.getElementById('nf-echeance').value = e.toISOString().split('T')[0];
  document.getElementById('nf-num').textContent = 'N° : '+genNum();
  if(!state.lignes.length) onTypeChange();
}
window.onTypeChange = function() {
  const t = document.getElementById('nf-type').value;
  const pMap = {foncier:['Suivi de dossier foncier',200000,18],info:['Prestation informatique',150000,18],honoraires:['Honoraires de conseil',300000,18],loyer:['Loyer mensuel',150000,0]};
  const [desc,pu,tva] = pMap[t];
  state.lignes=[]; lid=0;
  state.lignes.push({id:++lid,desc,qte:1,pu,tva});
  renderLignes();
};
window.addLigne = function() {
  state.lignes.push({id:++lid,desc:'',qte:1,pu:0,tva:18});
  renderLignes();
};
function renderLignes() {
  document.getElementById('nf-lignes').innerHTML = state.lignes.map(l=>`
    <tr>
      <td><input value="${l.desc}" placeholder="Description..." oninput="updL(${l.id},'desc',this.value)"></td>
      <td><input type="number" value="${l.qte}" min="1" style="width:55px" oninput="updL(${l.id},'qte',+this.value)"></td>
      <td><input type="number" value="${l.pu}" oninput="updL(${l.id},'pu',+this.value)"></td>
      <td><select onchange="updL(${l.id},'tva',+this.value)">
        <option value="0" ${l.tva==0?'selected':''}>0%</option>
        <option value="18" ${l.tva==18?'selected':''}>18%</option>
      </select></td>
      <td style="font-weight:600">${fmt(l.qte*l.pu)} F</td>
      <td><button class="btn btn-ghost btn-sm" onclick="delL(${l.id})">✕</button></td>
    </tr>`).join('');
  calcTotaux();
}
window.updL = (id,k,v) => { const l=state.lignes.find(x=>x.id===id); if(l){l[k]=v; renderLignes();} };
window.delL = id => { state.lignes=state.lignes.filter(l=>l.id!==id); renderLignes(); };
function calcTotaux() {
  const ht = state.lignes.reduce((s,l)=>s+(l.qte||0)*(l.pu||0),0);
  const tva = state.lignes.reduce((s,l)=>s+(l.qte||0)*(l.pu||0)*(l.tva||0)/100,0);
  document.getElementById('nf-ht').textContent = fmt(ht)+' FCFA';
  document.getElementById('nf-tva').textContent = fmt(tva)+' FCFA';
  document.getElementById('nf-ttc').textContent = fmt(ht+tva)+' FCFA';
  return {ht,tva,ttc:ht+tva};
}

window.saveFacture = async function() {
  const clientId = document.getElementById('nf-client').value;
  const client = state.clients.find(c=>c.id===clientId);
  const {ht,tva,ttc} = calcTotaux();
  if(!clientId){ showToast('Veuillez sélectionner un client','error'); return; }
  if(!state.lignes.length || !state.lignes[0].desc){ showToast('Ajoutez au moins une ligne','error'); return; }
  const data = {
    numero: genNum(), type: document.getElementById('nf-type').value,
    clientId, clientNom: client?client.nom:'Inconnu',
    lignes: state.lignes, description: state.lignes[0].desc,
    ht, tvaVal: tva, ttc, tauxTva: state.lignes[0].tva,
    echeance: document.getElementById('nf-echeance').value,
    ref: document.getElementById('nf-ref').value,
    modePaiement: document.getElementById('nf-paiement').value,
    notes: document.getElementById('nf-notes').value,
    statut: 'attente', createdAt: serverTimestamp()
  };
  try {
    const ref = await addDoc(collection(db,'factures'), data);
    state.factures.unshift({id:ref.id,...data,createdAt:new Date()});
    state.nextFactNum++;
    state.lignes=[]; lid=0;
    showToast('✓ Facture enregistrée dans Firebase !');
    nav('factures',null);
    renderDashboard();
  } catch(e){ showToast('Erreur Firebase : '+e.message,'error'); }
};

window.previewNF = function() {
  const clientId = document.getElementById('nf-client').value;
  const client = state.clients.find(c=>c.id===clientId);
  const {ht,tva,ttc} = calcTotaux();
  const num = genNum();
  state.currentInvoiceNum = num;
  document.getElementById('inv-num').textContent = num;
  document.getElementById('inv-date').textContent = 'Émis le : '+document.getElementById('nf-date').value;
  document.getElementById('inv-ech').textContent = 'Échéance : '+document.getElementById('nf-echeance').value;
  document.getElementById('inv-ref').textContent = document.getElementById('nf-ref').value ? 'Réf : '+document.getElementById('nf-ref').value : '';
  document.getElementById('inv-client').innerHTML = `<strong>${client?client.nom:'Client non sélectionné'}</strong><br>Ouagadougou, BF`;
  document.getElementById('inv-lignes').innerHTML = state.lignes.map(l=>`<tr><td>${l.desc||'—'}</td><td style="text-align:right">${l.qte}</td><td style="text-align:right">${fmt(l.pu)}</td><td style="text-align:right">${fmt(l.qte*l.pu)}</td></tr>`).join('');
  document.getElementById('inv-ht').textContent = fmt(ht)+' FCFA';
  document.getElementById('inv-tva-val').textContent = fmt(tva)+' FCFA';
  document.getElementById('inv-ttc').textContent = fmt(ttc)+' FCFA';
  document.getElementById('inv-stamp-wrap').style.display='none';
  document.getElementById('inv-bg').style.display='flex';
};

// ─── FACTURE RAPIDE ───────────────────────────────────
window.rpUpdatePreset = function() {
  const t = document.getElementById('rp-type').value;
  document.getElementById('rp-desc').innerHTML = PRESETS[t].map(d=>`<option>${d}</option>`).join('');
};
window.rpCalc = function() {
  const ht = parseFloat(document.getElementById('rp-ht').value)||0;
  const tva = parseFloat(document.getElementById('rp-tva').value)||0;
  document.getElementById('rp-ttc').textContent = fmt(Math.round(ht*(1+tva/100)))+' FCFA';
};
window.rpSave = async function() {
  const clientId = document.getElementById('rp-client').value;
  const client = state.clients.find(c=>c.id===clientId);
  const ht = parseFloat(document.getElementById('rp-ht').value)||0;
  const tvaP = parseFloat(document.getElementById('rp-tva').value)||0;
  const ttc = Math.round(ht*(1+tvaP/100));
  if(!clientId){ showToast('Sélectionnez un client','error'); return; }
  const desc = document.getElementById('rp-desc').value;
  const data = {
    numero: genNum(), type: document.getElementById('rp-type').value,
    clientId, clientNom: client?client.nom:'Inconnu',
    lignes: [{id:1,desc,qte:1,pu:ht,tva:tvaP}],
    description: desc, ht, tvaVal: ttc-ht, ttc, tauxTva: tvaP,
    ref: document.getElementById('rp-ref').value,
    modePaiement: document.getElementById('rp-mp').value,
    statut: 'attente', createdAt: serverTimestamp()
  };
  try {
    const ref = await addDoc(collection(db,'factures'), data);
    state.factures.unshift({id:ref.id,...data,createdAt:new Date()});
    state.nextFactNum++;
    showToast('✓ Facture rapide enregistrée !');
    nav('factures',null); renderDashboard();
  } catch(e){ showToast('Erreur : '+e.message,'error'); }
};
window.rpPreview = function() {
  const clientId = document.getElementById('rp-client').value;
  const client = state.clients.find(c=>c.id===clientId);
  const ht = parseFloat(document.getElementById('rp-ht').value)||0;
  const tvaP = parseFloat(document.getElementById('rp-tva').value)||0;
  const tva = ht*tvaP/100; const ttc = ht+tva;
  const desc = document.getElementById('rp-desc').value;
  const num = genNum();
  state.currentInvoiceNum = num;
  document.getElementById('inv-num').textContent = num;
  document.getElementById('inv-date').textContent = 'Émis le : '+document.getElementById('rp-date').value;
  document.getElementById('inv-ech').textContent = '';
  document.getElementById('inv-ref').textContent = document.getElementById('rp-ref').value ? 'Réf : '+document.getElementById('rp-ref').value : '';
  document.getElementById('inv-client').innerHTML = `<strong>${client?client.nom:'—'}</strong><br>Ouagadougou, BF`;
  document.getElementById('inv-lignes').innerHTML = `<tr><td>${desc}</td><td style="text-align:right">1</td><td style="text-align:right">${fmt(ht)}</td><td style="text-align:right">${fmt(ht)}</td></tr>`;
  document.getElementById('inv-ht').textContent = fmt(ht)+' FCFA';
  document.getElementById('inv-tva-val').textContent = fmt(tva)+' FCFA';
  document.getElementById('inv-ttc').textContent = fmt(ttc)+' FCFA';
  document.getElementById('inv-stamp-wrap').style.display='none';
  document.getElementById('inv-bg').style.display='flex';
};

// ══════════════════════════════════════════════════════
// ─── JOURNAL QUOTIDIEN ────────────────────────────────
// ══════════════════════════════════════════════════════

window.jUpdateCategories = function() {
  const type = document.getElementById('j-type').value;
  const cats = JOURNAL_CATS[type] || [];
  document.getElementById('j-cat').innerHTML = cats.map(c=>`<option value="${c.value}">${c.label}</option>`).join('');
};

function initJournal() {
  document.getElementById('j-date').value = today();
  document.getElementById('j-solde-date').value = today();
  // Mois courant pour le filtre
  const now = new Date();
  document.getElementById('j-filter-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  jUpdateCategories();
  renderJournalMetrics();
  renderJournalSolde();
  renderJournalTable();
  renderJournalGlobal();
}

function renderJournalMetrics() {
  const todayStr = today();
  const now = new Date();
  const recToday = state.journal.filter(e=>e.type==='recette'&&e.dateStr===todayStr).reduce((s,e)=>s+(e.montant||0),0);
  const depToday = state.journal.filter(e=>e.type==='depense'&&e.dateStr===todayStr).reduce((s,e)=>s+(e.montant||0),0);
  const recMonth = state.journal.filter(e=>{
    if(e.type!=='recette') return false;
    const d = new Date(e.dateStr);
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).reduce((s,e)=>s+(e.montant||0),0);
  const depMonth = state.journal.filter(e=>{
    if(e.type!=='depense') return false;
    const d = new Date(e.dateStr);
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).reduce((s,e)=>s+(e.montant||0),0);

  document.getElementById('j-rec-today').textContent = fmt(recToday);
  document.getElementById('j-dep-today').textContent = fmt(depToday);
  document.getElementById('j-rec-month').textContent = fmtM(recMonth);
  document.getElementById('j-dep-month').textContent = fmtM(depMonth);
}

// ─── SOLDE GLOBAL CUMULÉ (toutes périodes) ────────────
function renderJournalGlobal() {
  const totalRec = state.journal.filter(e=>e.type==='recette').reduce((s,e)=>s+(e.montant||0),0);
  const totalDep = state.journal.filter(e=>e.type==='depense').reduce((s,e)=>s+(e.montant||0),0);
  const net = totalRec - totalDep;
  document.getElementById('j-global-rec').textContent = fmt(totalRec)+' F';
  document.getElementById('j-global-dep').textContent = fmt(totalDep)+' F';
  const netEl = document.getElementById('j-global-net');
  netEl.textContent = (net>=0?'+':'')+fmt(net)+' F';
  netEl.style.color = net>=0 ? 'var(--green)' : 'var(--red)';
  const box = document.getElementById('j-global-net-box');
  box.classList.toggle('pos', net>=0);
  box.classList.toggle('neg', net<0);
}

window.renderJournalSolde = function() {
  const dateStr = document.getElementById('j-solde-date').value || today();
  const entries = state.journal.filter(e=>e.dateStr===dateStr);
  const recettes = entries.filter(e=>e.type==='recette').reduce((s,e)=>s+(e.montant||0),0);
  const depenses = entries.filter(e=>e.type==='depense').reduce((s,e)=>s+(e.montant||0),0);
  const solde = recettes - depenses;
  const pos = solde >= 0;

  const el = document.getElementById('journal-solde-content');
  if(!entries.length){
    el.innerHTML=`<div class="empty-state" style="padding:20px"><p>Aucune entrée pour cette date</p></div>`;
    return;
  }
  el.innerHTML=`
    <div class="journal-solde-bar ${pos?'pos':'neg'}">
      <span class="journal-solde-lbl">Solde du ${new Date(dateStr+'T00:00:00').toLocaleDateString('fr-FR')}</span>
      <span class="journal-solde-val ${pos?'pos':'neg'}">${pos?'+':''}${fmt(solde)} FCFA</span>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <div style="flex:1;background:rgba(29,158,117,.07);border-radius:8px;padding:10px 14px;border:1px solid rgba(29,158,117,.15)">
        <div style="font-size:11px;color:var(--text3);font-weight:600">RECETTES</div>
        <div style="font-size:16px;font-weight:700;color:var(--green);font-family:'DM Mono',monospace">+${fmt(recettes)}</div>
      </div>
      <div style="flex:1;background:rgba(239,68,68,.07);border-radius:8px;padding:10px 14px;border:1px solid rgba(239,68,68,.15)">
        <div style="font-size:11px;color:var(--text3);font-weight:600">DÉPENSES</div>
        <div style="font-size:16px;font-weight:700;color:var(--red);font-family:'DM Mono',monospace">-${fmt(depenses)}</div>
      </div>
    </div>
    ${entries.map(e=>{
      const cat = getCatInfo(e.type, e.cat);
      return `<div class="journal-entry-row">
        <span class="journal-entry-cat cat-badge ${cat.css}">${cat.label}</span>
        <div style="flex:1">
          <div class="journal-entry-desc">${e.desc||'—'}</div>
          ${e.note?`<div class="journal-entry-note">${e.note}</div>`:''}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-right:8px">${e.mode||''}</div>
        <span class="journal-entry-amount ${e.type}">${e.type==='recette'?'+':'-'}${fmt(e.montant||0)} F</span>
      </div>`;
    }).join('')}`;
};

window.filterJournal = function(f, el) {
  state.journalFilter = f;
  document.querySelectorAll('.journal-filter-tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderJournalTable();
};

window.renderJournalTable = function() {
  const monthVal = document.getElementById('j-filter-month').value;
  let list = [...state.journal];

  // Filtre mois
  if(monthVal) {
    const [yr, mo] = monthVal.split('-').map(Number);
    list = list.filter(e=>{
      const d = new Date(e.dateStr+'T00:00:00');
      return d.getFullYear()===yr && d.getMonth()+1===mo;
    });
  }
  // Filtre type
  if(state.journalFilter!=='tous') list = list.filter(e=>e.type===state.journalFilter);

  // Trier par date desc
  list.sort((a,b)=>b.dateStr.localeCompare(a.dateStr));

  const el = document.getElementById('journal-table');
  if(!list.length){
    el.innerHTML='<div class="empty-state"><p>Aucune entrée pour cette période</p></div>';
    return;
  }

  // Grouper par date
  const grouped = {};
  list.forEach(e=>{ if(!grouped[e.dateStr]) grouped[e.dateStr]=[]; grouped[e.dateStr].push(e); });
  const dates = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));

  el.innerHTML = dates.map(dateStr=>{
    const entries = grouped[dateStr];
    const rec = entries.filter(e=>e.type==='recette').reduce((s,e)=>s+(e.montant||0),0);
    const dep = entries.filter(e=>e.type==='depense').reduce((s,e)=>s+(e.montant||0),0);
    const dateLabel = new Date(dateStr+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    return `
      <div class="journal-date-header">
        <span class="journal-date-label">${dateLabel}</span>
        <div class="journal-date-line"></div>
        ${rec?`<span style="font-size:11px;color:var(--green);font-weight:600;white-space:nowrap;margin-left:8px">+${fmt(rec)}</span>`:''}
        ${dep?`<span style="font-size:11px;color:var(--red);font-weight:600;white-space:nowrap;margin-left:8px">-${fmt(dep)}</span>`:''}
      </div>
      ${entries.map(e=>{
        const cat = getCatInfo(e.type, e.cat);
        return `<div class="journal-entry-row">
          <span class="journal-entry-cat cat-badge ${cat.css}">${cat.label}</span>
          <div style="flex:1">
            <div class="journal-entry-desc">${e.desc||'—'}</div>
            ${e.note?`<div class="journal-entry-note">${e.note} · ${e.mode||''}</div>`:`<div class="journal-entry-note">${e.mode||''}</div>`}
          </div>
          <span class="journal-entry-amount ${e.type}">${e.type==='recette'?'+':'-'}${fmt(e.montant||0)} F</span>
          <button class="journal-entry-del" onclick="deleteJournal('${e.id}')" title="Supprimer">✕</button>
        </div>`;
      }).join('')}`;
  }).join('');
};

window.saveJournal = async function() {
  const type = document.getElementById('j-type').value;
  const cat  = document.getElementById('j-cat').value;
  const desc = document.getElementById('j-desc').value.trim();
  const montant = parseFloat(document.getElementById('j-montant').value)||0;
  const dateStr = document.getElementById('j-date').value || today();
  const mode = document.getElementById('j-mode').value;
  const note = document.getElementById('j-note').value.trim();

  if(!desc){ showToast('Veuillez saisir une description','error'); return; }
  if(!montant){ showToast('Veuillez saisir un montant','error'); return; }

  const data = { type, cat, desc, montant, dateStr, mode, note, createdAt: serverTimestamp() };
  try {
    const ref = await addDoc(collection(db,'journal'), data);
    state.journal.unshift({id:ref.id,...data,createdAt:new Date()});
    // Reset form
    document.getElementById('j-desc').value='';
    document.getElementById('j-montant').value='';
    document.getElementById('j-note').value='';
    document.getElementById('j-date').value = today();
    showToast(`✓ ${type==='recette'?'Recette':'Dépense'} enregistrée !`);
    renderJournalMetrics();
    renderJournalSolde();
    renderJournalTable();
    renderJournalGlobal();
  } catch(e){ showToast('Erreur Firebase : '+e.message,'error'); }
};

window.deleteJournal = async function(id) {
  if(!confirm('Supprimer cette entrée ?')) return;
  try {
    await deleteDoc(doc(db,'journal',id));
    state.journal = state.journal.filter(e=>e.id!==id);
    showToast('Entrée supprimée');
    renderJournalMetrics();
    renderJournalSolde();
    renderJournalTable();
    renderJournalGlobal();
  } catch(e){ showToast('Erreur : '+e.message,'error'); }
};

// ══════════════════════════════════════════════════════
// ─── RAPPORT FINANCIER ────────────────────────────────
// ══════════════════════════════════════════════════════

function initRapport() {
  document.getElementById('rap-preset').value = 'month';
  rapPreset('month');
}

window.rapPreset = function(val) {
  const now = new Date();
  let du, au;
  if(val==='today'){ du = au = today(); }
  else if(val==='week'){ const d=new Date(now); d.setDate(d.getDate()-6); du = d.toISOString().split('T')[0]; au = today(); }
  else if(val==='month'){ du = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`; au = today(); }
  else if(val==='lastmonth'){
    const d = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const dEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    du = d.toISOString().split('T')[0]; au = dEnd.toISOString().split('T')[0];
  }
  else if(val==='year'){ du = `${now.getFullYear()}-01-01`; au = today(); }
  else return renderRapport();
  document.getElementById('rap-du').value = du;
  document.getElementById('rap-au').value = au;
  renderRapport();
};

window.renderRapport = function() {
  const du = document.getElementById('rap-du').value;
  const au = document.getElementById('rap-au').value;
  if(!du || !au) return;

  const dateInRange = (dateStr) => dateStr >= du && dateStr <= au;

  // Journal sur la période
  const journalPeriode = state.journal.filter(e=>dateInRange(e.dateStr));
  const jRec = journalPeriode.filter(e=>e.type==='recette').reduce((s,e)=>s+(e.montant||0),0);
  const jDep = journalPeriode.filter(e=>e.type==='depense').reduce((s,e)=>s+(e.montant||0),0);

  // Factures sur la période (par date de création)
  const facturesPeriode = state.factures.filter(f=>{
    if(!f.createdAt) return false;
    const d = f.createdAt.toDate ? f.createdAt.toDate() : new Date(f.createdAt);
    const ds = d.toISOString().split('T')[0];
    return dateInRange(ds);
  });
  const facturesPayeesTTC = facturesPeriode.filter(f=>f.statut==='payee').reduce((s,f)=>s+(f.ttc||0),0);

  const totalRec = jRec + facturesPayeesTTC;
  const totalDep = jDep;
  const net = totalRec - totalDep;

  document.getElementById('rap-rec').textContent = fmt(totalRec)+' F';
  document.getElementById('rap-dep').textContent = fmt(totalDep)+' F';
  const netEl = document.getElementById('rap-net');
  netEl.textContent = (net>=0?'+':'')+fmt(net)+' F';
  netEl.style.color = net>=0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('rap-periode-label').textContent =
    `Période du ${new Date(du+'T00:00:00').toLocaleDateString('fr-FR')} au ${new Date(au+'T00:00:00').toLocaleDateString('fr-FR')}`;
  document.getElementById('rap-gen-date').textContent = new Date().toLocaleDateString('fr-FR')+' à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

  // Répartition par catégorie
  const catTotals = {};
  journalPeriode.forEach(e=>{
    const cat = getCatInfo(e.type, e.cat);
    const key = e.type+':'+cat.label;
    if(!catTotals[key]) catTotals[key] = { label:cat.label, type:e.type, css:cat.css, total:0 };
    catTotals[key].total += (e.montant||0);
  });
  const catList = Object.values(catTotals).sort((a,b)=>b.total-a.total);
  const catEl = document.getElementById('rap-categories');
  if(!catList.length){ catEl.innerHTML = '<div class="empty-state" style="padding:20px"><p>Aucune donnée sur cette période</p></div>'; }
  else catEl.innerHTML = `<table class="tbl"><thead><tr><th>Catégorie</th><th>Type</th><th>Montant</th></tr></thead><tbody>${
    catList.map(c=>`<tr>
      <td><span class="cat-badge ${c.css}">${c.label}</span></td>
      <td>${c.type==='recette'?'Recette':'Dépense'}</td>
      <td style="font-weight:600;color:${c.type==='recette'?'var(--green)':'var(--red)'}">${c.type==='recette'?'+':'-'}${fmt(c.total)} F</td>
    </tr>`).join('')
  }</tbody></table>`;

  // Factures de la période
  const facEl = document.getElementById('rap-factures');
  if(!facturesPeriode.length){ facEl.innerHTML = '<div class="empty-state" style="padding:20px"><p>Aucune facture sur cette période</p></div>'; }
  else facEl.innerHTML = `<table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Service</th><th>TTC</th><th>Statut</th></tr></thead><tbody>${
    facturesPeriode.map(f=>`<tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--green)">${f.numero||'—'}</td>
      <td style="color:var(--text2)">${fmtDate(f.createdAt)}</td>
      <td style="font-weight:500">${f.clientNom||'—'}</td>
      <td><span class="badge ${TYPE_BADGES[f.type]||'b-gray'}">${TYPE_LABELS[f.type]||f.type}</span></td>
      <td style="font-weight:600">${fmt(f.ttc||0)} F</td>
      <td><span class="badge ${STATUT_BADGES[f.statut]||'b-gray'}">${STATUT_LABELS[f.statut]||f.statut}</span></td>
    </tr>`).join('')
  }</tbody></table>`;

  // Détail journal
  const jEl = document.getElementById('rap-journal');
  const sortedJournal = [...journalPeriode].sort((a,b)=>b.dateStr.localeCompare(a.dateStr));
  if(!sortedJournal.length){ jEl.innerHTML = '<div class="empty-state" style="padding:20px"><p>Aucune entrée de journal sur cette période</p></div>'; }
  else jEl.innerHTML = `<table class="tbl"><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Mode</th><th>Montant</th></tr></thead><tbody>${
    sortedJournal.map(e=>{
      const cat = getCatInfo(e.type, e.cat);
      return `<tr>
        <td style="color:var(--text2);white-space:nowrap">${new Date(e.dateStr+'T00:00:00').toLocaleDateString('fr-FR')}</td>
        <td><span class="cat-badge ${cat.css}">${cat.label}</span></td>
        <td>${e.desc||'—'}</td>
        <td style="font-size:12px;color:var(--text2)">${e.mode||'—'}</td>
        <td style="font-weight:600;color:${e.type==='recette'?'var(--green)':'var(--red)'}">${e.type==='recette'?'+':'-'}${fmt(e.montant||0)} F</td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
};

window.printRapport = function() {
  window.print();
};

// ─── MODALS ────────────────────────────────────────────
window.openModal = function(type) {
  const biensList = state.biens.map(b=>`<option value="${b.nom}">${b.nom}</option>`).join('');
  const templates = {
    bien: {
      title: 'Ajouter un bien',
      body: `
        <div class="frow2"><div class="fg"><label class="flabel">Nom du bien</label><input class="finput" id="m-nom" placeholder="Villa Cissin"></div>
        <div class="fg"><label class="flabel">Type</label><select class="fselect" id="m-type"><option value="villa">Villa</option><option value="appartement">Appartement</option><option value="bureau">Bureau</option><option value="boutique">Boutique / Commerce</option><option value="terrain">Terrain</option><option value="autre">Autre</option></select></div></div>
        <div class="frow2"><div class="fg"><label class="flabel">Localisation</label><input class="finput" id="m-loc" placeholder="Cissin, Ouagadougou"></div>
        <div class="fg"><label class="flabel">Surface (m²)</label><input class="finput" id="m-surf" type="text" placeholder="200 m²"></div></div>
        <div class="frow2"><div class="fg"><label class="flabel">Loyer / Prix (FCFA)</label><input class="finput" id="m-prix" type="number" placeholder="150000"></div>
        <div class="fg"><label class="flabel">Statut</label><select class="fselect" id="m-statut"><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="vente">À vendre</option></select></div></div>`,
      save: async () => {
        const data = { nom:v('m-nom'), type:v('m-type'), localisation:v('m-loc'), surface:v('m-surf'), prix:parseFloat(v('m-prix'))||0, statut:v('m-statut'), createdAt:serverTimestamp() };
        if(!data.nom){ showToast('Nom requis','error'); return; }
        const ref = await addDoc(collection(db,'biens'), data);
        state.biens.unshift({id:ref.id,...data,createdAt:new Date()});
        showToast('✓ Bien ajouté !'); closeModal(); renderBiens(); renderDashboard();
      }
    },
    client: {
      title: 'Nouveau client',
      body: `
        <div class="frow2"><div class="fg"><label class="flabel">Nom complet</label><input class="finput" id="m-nom" placeholder="Traoré Aminata"></div>
        <div class="fg"><label class="flabel">Type</label><select class="fselect" id="m-type"><option value="locataire">Locataire</option><option value="acheteur">Acheteur</option><option value="prospect">Prospect</option></select></div></div>
        <div class="frow2"><div class="fg"><label class="flabel">Téléphone</label><input class="finput" id="m-tel" placeholder="+226 70 00 00 00"></div>
        <div class="fg"><label class="flabel">Email</label><input class="finput" id="m-email" type="email" placeholder="client@email.com"></div></div>
        <div class="fg"><label class="flabel">Bien associé</label><select class="fselect" id="m-bien"><option value="">— Aucun —</option>${biensList}</select></div>`,
      save: async () => {
        const data = { nom:v('m-nom'), type:v('m-type'), telephone:v('m-tel'), email:v('m-email'), bienAssocie:v('m-bien'), actif:true, createdAt:serverTimestamp() };
        if(!data.nom){ showToast('Nom requis','error'); return; }
        const ref = await addDoc(collection(db,'clients'), data);
        state.clients.unshift({id:ref.id,...data,createdAt:new Date()});
        populateClientSelects();
        showToast('✓ Client ajouté !'); closeModal(); renderClients(); renderDashboard();
      }
    },
    paiement: {
      title: 'Enregistrer un paiement',
      body: `
        <div class="frow2"><div class="fg"><label class="flabel">Client</label><select class="fselect" id="m-client"><option value="">— Sélectionner —</option>${state.clients.map(c=>`<option value="${c.id}|${c.nom}">${c.nom}</option>`).join('')}</select></div>
        <div class="fg"><label class="flabel">Type</label><select class="fselect" id="m-type"><option value="loyer">Loyer</option><option value="foncier">Foncier</option><option value="info">Informatique</option><option value="honoraires">Honoraires</option></select></div></div>
        <div class="fg"><label class="flabel">Objet / Description</label><input class="finput" id="m-objet" placeholder="Loyer villa mars 2026"></div>
        <div class="frow2"><div class="fg"><label class="flabel">Montant (FCFA)</label><input class="finput" id="m-montant" type="number" placeholder="150000"></div>
        <div class="fg"><label class="flabel">Mode paiement</label><select class="fselect" id="m-mp"><option>Espèces</option><option>Virement</option><option>Orange Money</option><option>Moov Money</option></select></div></div>
        <div class="fg"><label class="flabel">Statut</label><select class="fselect" id="m-statut"><option value="paye">Payé</option><option value="attente">En attente</option><option value="impaye">Impayé</option></select></div>`,
      save: async () => {
        const cv = v('m-client').split('|');
        const data = { clientId:cv[0], clientNom:cv[1]||'—', type:v('m-type'), objet:v('m-objet'), montant:parseFloat(v('m-montant'))||0, modePaiement:v('m-mp'), statut:v('m-statut'), createdAt:serverTimestamp() };
        if(!data.clientId){ showToast('Sélectionnez un client','error'); return; }
        const ref = await addDoc(collection(db,'paiements'), data);
        state.paiements.unshift({id:ref.id,...data,createdAt:new Date()});
        showToast('✓ Paiement enregistré !'); closeModal(); renderPaiements(); renderDashboard();
      }
    }
  };
  const t = templates[type]; if(!t) return;
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-bg" id="modal-bg" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">${t.title}</span><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
        <div class="modal-body">${t.body}</div>
        <div class="modal-footer">
          <button class="btn" onclick="closeModal()">Annuler</button>
          <button class="btn btn-primary" onclick="modalSave()">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 16 16"><path d="M2 10v4h12v-4M8 2v8M5 6l3 3 3-3"/></svg>
            Sauvegarder
          </button>
        </div>
      </div>
    </div>`;
  window._modalSaveFn = t.save;
};
window.modalSave = async function() {
  if(window._modalSaveFn) {
    try { await window._modalSaveFn(); }
    catch(e){ showToast('Erreur : '+e.message,'error'); }
  }
};
window.closeModal = () => { document.getElementById('modal-container').innerHTML=''; };

// ─── DELETE ────────────────────────────────────────────
window.deleteBien = async id => {
  if(!confirm('Supprimer ce bien ?')) return;
  await deleteDoc(doc(db,'biens',id));
  state.biens = state.biens.filter(b=>b.id!==id);
  showToast('Bien supprimé'); renderBiens(); renderDashboard();
};
window.deleteClient = async id => {
  if(!confirm('Supprimer ce client ?')) return;
  await deleteDoc(doc(db,'clients',id));
  state.clients = state.clients.filter(c=>c.id!==id);
  populateClientSelects();
  showToast('Client supprimé'); renderClients(); renderDashboard();
};

// ─── UTILS ─────────────────────────────────────────────
const v = id => (document.getElementById(id)||{}).value||'';
function populateClientSelects() {
  const opts = state.clients.map(c=>`<option value="${c.id}">${c.nom}</option>`).join('');
  ['nf-client','rp-client'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.innerHTML='<option value="">— Sélectionner —</option>'+opts; }});
}

// ─── DATE ─────────────────────────────────────────────
const jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const now=new Date();
document.getElementById('topbar-date').textContent = `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`;

document.getElementById('nf-date').value = today();
const e2=new Date(); e2.setDate(e2.getDate()+15);
document.getElementById('nf-echeance').value = e2.toISOString().split('T')[0];
document.getElementById('rp-date').value = today();

// ─── INIT ──────────────────────────────────────────────
rpUpdatePreset(); rpCalc();
jUpdateCategories();
loadAll();