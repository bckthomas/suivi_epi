/**
 * EPI Gear Tracker — app.js
 * Vanilla JS, no external dependencies.
 *
 * Saving strategy:
 *  - Chrome/Edge: File System Access API (showOpenFilePicker) → writes back to the same file silently.
 *  - Firefox/Safari: FileReader fallback → triggers a JSON download on each save.
 */

(function () {
  'use strict';

  // ─── Feature detect ──────────────────────────────────────────────────────────
  const FSAPI = typeof window.showOpenFilePicker === 'function';

  // ─── State ───────────────────────────────────────────────────────────────────
  let allProducts        = [];   // enriched rows (includes computed fields + _idx)
  let rawData            = [];   // original parsed JSON array (what we write back)
  let fileHandle         = null; // FileSystemFileHandle (FSAPI path)
  let currentFileName    = '';   // for fallback download filename
  let sortCol            = null;
  let sortDir            = 'asc';
  let searchTerm         = '';
  let selectedIdx        = null; // index into allProducts for the detail view

  // ─── DOM refs ────────────────────────────────────────────────────────────────
  // Header
  const saveStatusEl     = document.getElementById('saveStatus');

  // List view
  const viewList         = document.getElementById('view-list');
  const btnLoadFSAPI     = document.getElementById('btnLoadFSAPI');
  const labelFileInput   = document.getElementById('labelFileInput');
  const fileInput        = document.getElementById('fileInput');
  const fileNameEl       = document.getElementById('fileName');
  const searchInput      = document.getElementById('searchInput');
  const table            = document.getElementById('productTable');
  const tbody            = document.getElementById('tableBody');
  const placeholder      = document.getElementById('placeholder');
  const emptyState       = document.getElementById('emptyState');
  const errorBox         = document.getElementById('errorBox');
  const statsEl          = document.getElementById('stats');
  const statsText        = document.getElementById('statsText');
  const fallbackBanner   = document.getElementById('fallbackBanner');
  const headers          = table.querySelectorAll('th[data-col]');

  // New product modal
  const btnNewProduct          = document.getElementById('btnNewProduct');
  const modalNewProduct        = document.getElementById('modalNewProduct');
  const formNewProduct         = document.getElementById('formNewProduct');
  const btnCloseNewProduct     = document.getElementById('btnCloseNewProduct');
  const btnCancelNewProduct    = document.getElementById('btnCancelNewProduct');
  const newProductName         = document.getElementById('newProductName');
  const newProductManufacturer = document.getElementById('newProductManufacturer');
  const newProductType         = document.getElementById('newProductType');
  const newProductDescription  = document.getElementById('newProductDescription');
  const newProductBuyingDate   = document.getElementById('newProductBuyingDate');
  const newProductLifetime     = document.getElementById('newProductLifetime');
  const newProductNameError    = document.getElementById('newProductNameError');
  const newProductManufacturerError = document.getElementById('newProductManufacturerError');
  const newProductTypeError    = document.getElementById('newProductTypeError');
  const newProductBuyingDateError = document.getElementById('newProductBuyingDateError');
  const newProductLifetimeError   = document.getElementById('newProductLifetimeError');

  // Detail view
  const viewDetail       = document.getElementById('view-detail');
  const btnBack          = document.getElementById('btnBack');
  const detailProductName = document.getElementById('detailProductName');
  const detailProductMeta = document.getElementById('detailProductMeta');
  const detailManufacturer = document.getElementById('detailManufacturer');
  const detailEpiStatus  = document.getElementById('detailEpiStatus');
  const detailDescription = document.getElementById('detailDescription');
  const detailBuyingDate = document.getElementById('detailBuyingDate');
  const detailLifetime   = document.getElementById('detailLifetime');
  const detailExpiryDate = document.getElementById('detailExpiryDate');
  const checksBody       = document.getElementById('checksBody');
  const checksTable      = document.getElementById('checksTable');
  const checksEmpty      = document.getElementById('checksEmpty');
  const btnAddCheck      = document.getElementById('btnAddCheck');

  // Modal
  const modal            = document.getElementById('modalAddCheck');
  const formAddCheck     = document.getElementById('formAddCheck');
  const btnCloseModal    = document.getElementById('btnCloseModal');
  const btnCancelCheck   = document.getElementById('btnCancelCheck');
  const checkDate        = document.getElementById('checkDate');
  const checkInspector   = document.getElementById('checkInspector');
  const checkResult      = document.getElementById('checkResult');
  const checkNotes       = document.getElementById('checkNotes');
  const checkDateError   = document.getElementById('checkDateError');
  const checkInspectorError = document.getElementById('checkInspectorError');

  // ─── Initialise UI based on FSAPI support ────────────────────────────────────
  if (FSAPI) {
    btnLoadFSAPI.hidden  = false;
    labelFileInput.hidden = true;
    fileInput.hidden     = true;
  } else {
    btnLoadFSAPI.hidden  = true;
    labelFileInput.hidden = false;
    fallbackBanner.hidden = false;
  }

  // ─── File loading — FSAPI path ────────────────────────────────────────────────
  btnLoadFSAPI.addEventListener('click', async function () {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON files', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      fileHandle = handle;
      currentFileName = handle.name;
      fileNameEl.textContent = handle.name;
      hideError();

      const file = await handle.getFile();
      const text = await file.text();
      loadJSON(text);
    } catch (err) {
      // User cancelled picker — not an error
      if (err && err.name !== 'AbortError') {
        showError('Impossible d\'ouvrir le fichier : ' + err.message);
      }
    }
  });

  // ─── File loading — fallback path ────────────────────────────────────────────
  fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    fileNameEl.textContent = file.name;
    currentFileName = file.name;
    hideError();

    const reader = new FileReader();
    reader.onload = function (evt) { loadJSON(evt.target.result); };
    reader.onerror = function () { showError('Impossible de lire le fichier. Veuillez réessayer.'); };
    reader.readAsText(file);
    fileInput.value = ''; // allow reloading same file
  });

  // ─── Parse & load JSON ────────────────────────────────────────────────────────
  function loadJSON(text) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new TypeError('JSON root must be an array of product objects.');
      }
      rawData = parsed;
      allProducts = rawData.map(function (raw, i) {
        return enrichProduct(raw, i);
      });
      searchInput.disabled = false;
      searchTerm = '';
      searchInput.value = '';
      sortCol = null;
      sortDir = 'asc';
      btnNewProduct.disabled = false;
      resetSortHeaders();
      showListView();
      renderTable();
      setSaveStatus('saved');
    } catch (err) {
      showError('Impossible d\'analyser le fichier : ' + err.message);
      allProducts = [];
      rawData = [];
      hideTable();
    }
  }

  // ─── Saving ───────────────────────────────────────────────────────────────────
  /**
   * Serialize rawData to JSON and either write via FSAPI or trigger a download.
   */
  async function saveData() {
    const json = JSON.stringify(rawData, null, 2);

    if (FSAPI && fileHandle) {
      setSaveStatus('saving');
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('unsaved');
        showError('Échec de la sauvegarde : ' + err.message);
      }
    } else {
      // Fallback: download
      triggerDownload(json, currentFileName || 'epi-gear.json');
      setSaveStatus('saved');
    }
  }

  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function setSaveStatus(state) {
    saveStatusEl.hidden = false;
    saveStatusEl.className = 'save-status ' + state;
    if (state === 'saved')   { saveStatusEl.textContent = '✓ Enregistré'; }
    if (state === 'saving')  { saveStatusEl.textContent = '⏳ Enregistrement…'; }
    if (state === 'unsaved') { saveStatusEl.textContent = '⚠ Modifications non enregistrées'; }
  }

  // ─── Search ───────────────────────────────────────────────────────────────────
  searchInput.addEventListener('input', function () {
    searchTerm = this.value.trim().toLowerCase();
    renderTable();
  });

  // ─── Column sorting ───────────────────────────────────────────────────────────
  headers.forEach(function (th) {
    th.addEventListener('click', function () {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      updateSortHeaders();
      renderTable();
    });
  });

  // ─── View navigation ──────────────────────────────────────────────────────────
  function showListView() {
    viewList.hidden   = false;
    viewDetail.hidden = true;
    selectedIdx       = null;
  }

  function showDetailView(idx) {
    selectedIdx       = idx;
    viewList.hidden   = true;
    viewDetail.hidden = false;
    renderDetailView(idx);
  }

  btnBack.addEventListener('click', showListView);

  // ─── Product row click ────────────────────────────────────────────────────────
  tbody.addEventListener('click', function (e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = parseInt(tr.dataset.idx, 10);
    if (!isNaN(idx)) showDetailView(idx);
  });

  // ─── Lifetime / date utilities ────────────────────────────────────────────────
  /**
   * Convert a lifetime value to a number of days.
   * - Integer 0          → null (illimité, no expiry)
   * - Integer N > 0      → N * 365 days
   * - Legacy string      → parsed for backward-compatibility
   */
  function parseLifetimeToDays(val) {
    // Native integer format (new spec)
    if (typeof val === 'number') {
      return val === 0 ? null : Math.round(val * 365);
    }

    // Legacy string fallback
    if (!val || typeof val !== 'string') return null;
    const s = val.trim().toLowerCase();
    if (s === 'illimité' || s === 'illimite') return null;

    const nlMatch = s.match(/^(\d+(?:\.\d+)?)\s*(year|month|week|day)s?$/);
    if (nlMatch) {
      const n = parseFloat(nlMatch[1]);
      switch (nlMatch[2]) {
        case 'year':  return Math.round(n * 365);
        case 'month': return Math.round(n * 30.4375);
        case 'week':  return Math.round(n * 7);
        case 'day':   return Math.round(n);
      }
    }

    const isoMatch = s.match(/^p(?:(\d+(?:\.\d+)?)y)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)d)?$/i);
    if (isoMatch && (isoMatch[1] || isoMatch[2] || isoMatch[3])) {
      return Math.round(
        parseFloat(isoMatch[1] || 0) * 365 +
        parseFloat(isoMatch[2] || 0) * 30.4375 +
        parseFloat(isoMatch[3] || 0)
      );
    }

    const num = Number(val);
    if (!isNaN(num) && num > 0) return Math.round(num * 365);
    return null;
  }

  /**
   * Format a lifetime value for display.
   * - 0 or null days → "illimité"
   * - 1              → "1 année"
   * - N              → "N années"
   */
  function formatLifetime(val) {
    if (typeof val === 'number') {
      if (val === 0) return 'illimité';
      return val + (val <= 1 ? ' année' : ' années');
    }
    // Legacy string: display as-is
    return val || '—';
  }

  function computeExpiry(buyingDateStr, lifetimeDays) {
    if (!buyingDateStr || lifetimeDays === null) return null;
    const base = new Date(buyingDateStr + 'T00:00:00Z');
    if (isNaN(base.getTime())) return null;
    return new Date(base.getTime() + lifetimeDays * 86400000);
  }

  function formatDate(date) {
    if (!date || isNaN(date.getTime())) return null;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /** Extract the 4-digit year string from a YYYY-MM-DD string. */
  function yearOf(dateStr) {
    return dateStr ? dateStr.slice(0, 4) : null;
  }

  /** Today's year as integer (local time). */
  function thisYear() {
    return new Date().getFullYear();
  }

  /**
   * Compute EPI status for a product:
   *   'done'    — at least one check this calendar year
   *   'missing' — has checks but none this year
   *   'none'    — never checked
   */
  function computeEpiStatus(checks) {
    if (!checks || checks.length === 0) return 'none';
    const year = thisYear();
    const hasThisYear = checks.some(function (c) {
      return c.date && new Date(c.date).getFullYear() === year;
    });
    return hasThisYear ? 'done' : 'missing';
  }

  function epiStatusLabel(status) {
    if (status === 'done')    return '✓ Contrôlé en ' + thisYear();
    if (status === 'missing') return '⚠ Contrôle requis';
    return '— Aucun contrôle';
  }

  // ─── Enrich product ───────────────────────────────────────────────────────────
  function enrichProduct(raw, idx) {
    const lifetimeDays = parseLifetimeToDays(raw.lifetime);
    const expiryDate   = computeExpiry(raw.buyingDate, lifetimeDays);
    const expiryStr    = formatDate(expiryDate);
    const checks       = Array.isArray(raw.epiChecks) ? raw.epiChecks : [];

    let expiryStatus = 'na';
    if (expiryDate) {
      const diff = expiryDate.getTime() - Date.now();
      expiryStatus = diff < 0 ? 'expired' : diff <= 30 * 86400000 ? 'soon' : 'ok';
    }

    return {
      _idx:             idx,
      productName:      raw.productName    || '',
      manufacturer:     raw.manufacturer   || '',
      productType:      raw.productType    || '',
      description:      raw.description    || '',
      buyingDate:       raw.buyingDate     || '',
      lifetime:         formatLifetime(raw.lifetime),
      lifetimeDays:     lifetimeDays,
      expiryDate:       expiryStr,
      expiryStatus:     expiryStatus,
      epiChecks:        checks,
      epiStatus:        computeEpiStatus(checks),
    };
  }

  // ─── Filter & sort ────────────────────────────────────────────────────────────
  function filterProducts(products) {
    if (!searchTerm) return products;
    return products.filter(function (p) {
      return (
        p.productName.toLowerCase().includes(searchTerm) ||
        p.manufacturer.toLowerCase().includes(searchTerm) ||
        p.productType.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.buyingDate.toLowerCase().includes(searchTerm) ||
        p.lifetime.toLowerCase().includes(searchTerm) ||
        (p.expiryDate && p.expiryDate.toLowerCase().includes(searchTerm))
      );
    });
  }

  function sortProducts(products) {
    if (!sortCol) return products;
    return products.slice().sort(function (a, b) {
      if (sortCol === 'buyingDate' || sortCol === 'expiryDate') {
        const va = a[sortCol] ? new Date(a[sortCol]).getTime() : 0;
        const vb = b[sortCol] ? new Date(b[sortCol]).getTime() : 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      if (sortCol === 'lifetime') {
        const va = a.lifetimeDays !== null ? a.lifetimeDays : -Infinity;
        const vb = b.lifetimeDays !== null ? b.lifetimeDays : -Infinity;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const va = (a[sortCol] || '').toLowerCase();
      const vb = (b[sortCol] || '').toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // ─── Render list table ────────────────────────────────────────────────────────
  function renderTable() {
    const filtered = filterProducts(allProducts);
    const sorted   = sortProducts(filtered);

    statsEl.hidden = false;
    const total = allProducts.length;
    const shown = sorted.length;
    statsText.textContent = searchTerm
      ? shown + ' sur ' + total + ' produit' + (total !== 1 ? 's' : '') + ' affiché' + (shown !== 1 ? 's' : '')
      : total + ' produit' + (total !== 1 ? 's' : '');

    if (sorted.length === 0 && total > 0) {
      table.hidden     = true;
      placeholder.hidden = true;
      emptyState.hidden  = false;
      return;
    }

    emptyState.hidden  = true;
    placeholder.hidden = true;
    table.hidden       = false;

    tbody.textContent = '';
    const fragment = document.createDocumentFragment();

    sorted.forEach(function (p) {
      const tr = document.createElement('tr');
      tr.className    = 'row-clickable';
      tr.dataset.idx  = p._idx;
      tr.title        = 'Cliquer pour voir les contrôles EPI';

      appendTd(tr, p.manufacturer);
      appendTd(tr, p.productName);
      appendTd(tr, p.productType);
      const descTd = appendTd(tr, p.description);
      descTd.className = 'col-description';
      appendTd(tr, p.buyingDate || '—');
      appendTd(tr, p.lifetime   || '—');

      // Expiry date — display year only
      const expiryTd = document.createElement('td');
      if (p.expiryDate) {
        const badge = document.createElement('span');
        badge.className   = 'expiry-badge expiry-' + p.expiryStatus;
        badge.textContent = yearOf(p.expiryDate);
        expiryTd.appendChild(badge);
      } else {
        const na = document.createElement('span');
        na.className   = 'expiry-na';
        na.textContent = 'N/A';
        expiryTd.appendChild(na);
      }
      tr.appendChild(expiryTd);

      // EPI status
      const epiTd  = document.createElement('td');
      const epiBadge = document.createElement('span');
      epiBadge.className   = 'epi-status-badge epi-status-' + p.epiStatus;
      epiBadge.textContent = epiStatusLabel(p.epiStatus);
      epiTd.appendChild(epiBadge);
      tr.appendChild(epiTd);

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }

  function appendTd(tr, text) {
    const td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
    return td;
  }

  // ─── Render detail view ───────────────────────────────────────────────────────
  function renderDetailView(idx) {
    const p = allProducts[idx];
    if (!p) return;

    // Header info
    detailProductName.textContent = p.productName || '(sans nom)';
    detailProductMeta.textContent = p.productType || '';
    detailManufacturer.textContent = p.manufacturer || '';
    detailDescription.textContent = p.description || '';
    detailBuyingDate.textContent  = p.buyingDate  || '—';
    detailLifetime.textContent    = p.lifetime    || '—';

    if (p.expiryDate) {
      const badge = document.createElement('span');
      badge.className   = 'expiry-badge expiry-' + p.expiryStatus;
      badge.textContent = yearOf(p.expiryDate);
      detailExpiryDate.textContent = '';
      detailExpiryDate.appendChild(badge);
    } else {
      detailExpiryDate.textContent = '—';
    }

    // EPI year badge
    detailEpiStatus.className   = 'epi-year-badge ' + p.epiStatus;
    detailEpiStatus.textContent = epiStatusLabel(p.epiStatus);

    // Checks table
    renderChecksTable(p);
  }

  function renderChecksTable(p) {
    checksBody.textContent = '';

    const checks = p.epiChecks || [];

    if (checks.length === 0) {
      checksTable.hidden = true;
      checksEmpty.hidden = false;
      return;
    }

    checksTable.hidden = false;
    checksEmpty.hidden = true;

    // Sort checks newest-first
    const sorted = checks.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach(function (c) {
      const tr = document.createElement('tr');

      appendTd(tr, c.date       || '—');
      appendTd(tr, c.inspector  || '—');

      // Result badge
      const resultTd = document.createElement('td');
      const badge    = document.createElement('span');
      badge.className   = 'check-result-badge check-' + (c.result === 'fail' ? 'fail' : 'pass');
      badge.textContent = c.result === 'fail' ? '✗ Non conforme' : '✓ Conforme';
      resultTd.appendChild(badge);
      tr.appendChild(resultTd);

      const notesTd = appendTd(tr, c.notes || '—');
      notesTd.className = 'col-notes';

      fragment.appendChild(tr);
    });

    checksBody.appendChild(fragment);
  }

  // ─── New product modal ────────────────────────────────────────────────────────
  btnNewProduct.addEventListener('click', function () {
    formNewProduct.reset();
    clearNewProductErrors();
    // Default buying date to today
    newProductBuyingDate.value = formatDate(new Date(Date.now()));
    modalNewProduct.showModal();
  });

  btnCloseNewProduct.addEventListener('click',  closeNewProductModal);
  btnCancelNewProduct.addEventListener('click', closeNewProductModal);

  modalNewProduct.addEventListener('click', function (e) {
    if (e.target === modalNewProduct) closeNewProductModal();
  });

  modalNewProduct.addEventListener('cancel', clearNewProductErrors);

  function closeNewProductModal() {
    clearNewProductErrors();
    modalNewProduct.close();
  }

  formNewProduct.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateNewProductForm()) return;

    const newRaw = {
      productName:  newProductName.value.trim(),
      manufacturer: newProductManufacturer.value.trim(),
      productType:  newProductType.value.trim(),
      description:  newProductDescription.value.trim(),
      buyingDate:   newProductBuyingDate.value,
      lifetime:     parseInt(newProductLifetime.value, 10),
      epiChecks:    [],
    };

    rawData.push(newRaw);
    allProducts.push(enrichProduct(newRaw, rawData.length - 1));

    closeNewProductModal();
    renderTable();
    saveData();
  });

  function validateNewProductForm() {
    let valid = true;

    if (!newProductName.value.trim()) {
      newProductNameError.hidden = false;
      newProductName.classList.add('invalid');
      valid = false;
    } else {
      newProductNameError.hidden = true;
      newProductName.classList.remove('invalid');
    }

    if (!newProductManufacturer.value.trim()) {
      newProductManufacturerError.hidden = false;
      newProductManufacturer.classList.add('invalid');
      valid = false;
    } else {
      newProductManufacturerError.hidden = true;
      newProductManufacturer.classList.remove('invalid');
    }

    if (!newProductType.value.trim()) {
      newProductTypeError.hidden = false;
      newProductType.classList.add('invalid');
      valid = false;
    } else {
      newProductTypeError.hidden = true;
      newProductType.classList.remove('invalid');
    }

    if (!newProductBuyingDate.value) {
      newProductBuyingDateError.hidden = false;
      newProductBuyingDate.classList.add('invalid');
      valid = false;
    } else {
      newProductBuyingDateError.hidden = true;
      newProductBuyingDate.classList.remove('invalid');
    }

    if (newProductLifetime.value === '' || parseInt(newProductLifetime.value, 10) < 0) {
      newProductLifetimeError.hidden = false;
      newProductLifetime.classList.add('invalid');
      valid = false;
    } else {
      newProductLifetimeError.hidden = true;
      newProductLifetime.classList.remove('invalid');
    }

    return valid;
  }

  function clearNewProductErrors() {
    [newProductName, newProductManufacturer, newProductType, newProductBuyingDate, newProductLifetime].forEach(function (el) {
      el.classList.remove('invalid');
    });
    [newProductNameError, newProductManufacturerError, newProductTypeError, newProductBuyingDateError, newProductLifetimeError].forEach(function (el) {
      el.hidden = true;
    });
  }

  // ─── Add EPI check modal ──────────────────────────────────────────────────────
  btnAddCheck.addEventListener('click', function () {
    // Set default date to today
    const today = formatDate(new Date(Date.now()));
    checkDate.value      = today;
    checkInspector.value = '';
    checkResult.value    = 'pass';
    checkNotes.value     = '';
    clearFormErrors();
    modal.showModal();
  });

  btnCloseModal.addEventListener('click',  closeModal);
  btnCancelCheck.addEventListener('click', closeModal);

  // Close on backdrop click
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  // Close on Escape (native for <dialog>, but ensure state is clean)
  modal.addEventListener('cancel', clearFormErrors);

  function closeModal() {
    clearFormErrors();
    modal.close();
  }

  // ─── Form submit ──────────────────────────────────────────────────────────────
  formAddCheck.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateCheckForm()) return;

    const newCheck = {
      date:      checkDate.value,
      inspector: checkInspector.value.trim(),
      result:    checkResult.value,
      notes:     checkNotes.value.trim(),
    };

    // Update rawData (what gets written to file)
    if (!Array.isArray(rawData[selectedIdx].epiChecks)) {
      rawData[selectedIdx].epiChecks = [];
    }
    rawData[selectedIdx].epiChecks.push(newCheck);

    // Update enriched allProducts
    allProducts[selectedIdx].epiChecks = rawData[selectedIdx].epiChecks;
    allProducts[selectedIdx].epiStatus = computeEpiStatus(allProducts[selectedIdx].epiChecks);

    closeModal();
    renderDetailView(selectedIdx);
    saveData();
  });

  function validateCheckForm() {
    let valid = true;

    if (!checkDate.value) {
      checkDateError.hidden = false;
      checkDate.classList.add('invalid');
      valid = false;
    } else {
      checkDateError.hidden = true;
      checkDate.classList.remove('invalid');
    }

    if (!checkInspector.value.trim()) {
      checkInspectorError.hidden = false;
      checkInspector.classList.add('invalid');
      valid = false;
    } else {
      checkInspectorError.hidden = true;
      checkInspector.classList.remove('invalid');
    }

    return valid;
  }

  function clearFormErrors() {
    checkDateError.hidden      = true;
    checkInspectorError.hidden = true;
    checkDate.classList.remove('invalid');
    checkInspector.classList.remove('invalid');
  }

  // ─── Sort header utilities ────────────────────────────────────────────────────
  function resetSortHeaders() {
    headers.forEach(function (th) { th.classList.remove('sort-asc', 'sort-desc'); });
  }

  function updateSortHeaders() {
    headers.forEach(function (th) {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === sortCol) {
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  // ─── Error / visibility helpers ──────────────────────────────────────────────
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function hideTable() {
    table.hidden       = true;
    statsEl.hidden     = true;
    emptyState.hidden  = true;
    placeholder.hidden = false;
    tbody.textContent  = '';
  }

}());
