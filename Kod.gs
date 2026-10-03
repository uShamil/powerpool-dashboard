const STATUS_SHEET = 'Durumlar';
const PRODUCTS_SHEET = 'Ürünler';
const STATUS_HEADERS = ['Ürün ID','Trendyol','Hepsiburada','n11','E-Pool','Havuz Topt.','Son Kontrol','Kontrol Eden'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
    if (action === 'load' || action === 'get' || action === 'statuses') return loadStatuses_();
    if (action === 'save' || action === 'savestatus' || action === 'update') return saveStatus_(e.parameter || {});
    if (action === 'initialize' || action === 'initializedatabase') return initializeDatabase_();
    return json_({success:true,service:'PowerPool Ürün Takip API',actions:['load','save','initializeDatabase']});
  } catch (err) {
    return json_({success:false,error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = String(body.action || '').toLowerCase();
    if (action === 'load' || action === 'get' || action === 'statuses') return loadStatuses_();
    if (action === 'save' || action === 'savestatus' || action === 'update') return saveStatus_(body);
    if (action === 'initialize' || action === 'initializedatabase') return initializeDatabase_();
    return json_({success:false,error:'Geçersiz action'});
  } catch (err) {
    return json_({success:false,error:String(err && err.message || err)});
  }
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Google Sheet bulunamadı. Apps Script projesini ilgili Sheet üzerinden açın.');
  return ss;
}

function getOrCreateStatusSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(STATUS_SHEET);
  if (!sh) sh = ss.insertSheet(STATUS_SHEET);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,STATUS_HEADERS.length).setValues([STATUS_HEADERS]);
  else {
    const first = sh.getRange(1,1,1,STATUS_HEADERS.length).getValues()[0];
    if (first.join('|') !== STATUS_HEADERS.join('|')) sh.getRange(1,1,1,STATUS_HEADERS.length).setValues([STATUS_HEADERS]);
  }
  return sh;
}

function loadStatuses_() {
  const sh = getOrCreateStatusSheet_();
  const last = sh.getLastRow();
  const statuses = {};
  if (last >= 2) {
    const rows = sh.getRange(2,1,last-1,8).getValues();
    rows.forEach(r => {
      const id = String(r[0] || '').trim();
      if (!id) return;
      statuses[id] = {
        trendyol: normalizeStatus_(r[1]),
        hepsiburada: normalizeStatus_(r[2]),
        n11: normalizeStatus_(r[3]),
        epool: normalizeStatus_(r[4]),
        havuz: normalizeStatus_(r[5])
      };
    });
  }
  return json_({success:true,statuses:statuses});
}

function saveStatus_(p) {
  const id = String(p.productId || p.id || '').trim();
  if (!id) throw new Error('productId eksik');
  const sh = getOrCreateStatusSheet_();
  const last = sh.getLastRow();
  let rowNumber = 0;
  if (last >= 2) {
    const ids = sh.getRange(2,1,last-1,1).getValues();
    for (let i=0;i<ids.length;i++) {
      if (String(ids[i][0] || '').trim() === id) { rowNumber = i + 2; break; }
    }
  }
  const row = [
    id,
    normalizeStatus_(p.trendyol),
    normalizeStatus_(p.hepsiburada),
    normalizeStatus_(p.n11),
    normalizeStatus_(p.epool),
    normalizeStatus_(p.havuz),
    new Date(),
    Session.getActiveUser().getEmail() || 'PowerPool'
  ];
  if (rowNumber) sh.getRange(rowNumber,1,1,8).setValues([row]);
  else sh.getRange(sh.getLastRow()+1,1,1,8).setValues([row]);
  SpreadsheetApp.flush();
  return json_({success:true,saved:true,productId:id});
}

function normalizeStatus_(v) {
  const s = String(v == null ? '?' : v).trim();
  return (s === '✓' || s === '×' || s === '?') ? s : '?';
}

function initializeDatabase() { return initializeDatabase_(); }

function initializeDatabase_() {
  const sh = getOrCreateStatusSheet_();
  const ss = getSpreadsheet_();
  const prod = ss.getSheetByName(PRODUCTS_SHEET);
  if (!prod) return json_({success:true,message:'Durumlar hazır; Ürünler sayfası bulunamadı.',added:0});
  const lastP = prod.getLastRow();
  if (lastP < 2) return json_({success:true,message:'Ürünler sayfasında ürün yok.',added:0});
  const productIds = prod.getRange(2,1,lastP-1,1).getValues().map(r=>String(r[0]||'').trim()).filter(Boolean);
  const existing = new Set();
  const lastS = sh.getLastRow();
  if (lastS >= 2) sh.getRange(2,1,lastS-1,1).getValues().forEach(r=>{const id=String(r[0]||'').trim();if(id)existing.add(id);});
  const add = productIds.filter(id=>!existing.has(id)).map(id=>[id,'?','?','?','?','?',new Date(),'PowerPool']);
  if (add.length) sh.getRange(sh.getLastRow()+1,1,add.length,8).setValues(add);
  SpreadsheetApp.flush();
  return json_({success:true,message:'Durumlar hazır.',added:add.length,total:productIds.length});
}
