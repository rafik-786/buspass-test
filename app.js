(function () {
  const I = window.Icons;
  const STORAGE_KEY = "buspass.config.overrides.v1";

  // Deep-merge user overrides from localStorage on top of defaults
  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === "object" && !Array.isArray(source[k])) {
        target[k] = deepMerge({ ...(target[k] || {}) }, source[k]);
      } else {
        target[k] = source[k];
      }
    }
    return target;
  }
  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveOverrides(o) { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); }
  function resetOverrides() { localStorage.removeItem(STORAGE_KEY); }

  const cfg = deepMerge(
    JSON.parse(JSON.stringify(window.BusPassConfig)),
    loadOverrides()
  );
  // expose for inspection in devtools
  window._cfg = cfg;

  // ============ AES-128-CBC/PKCS5Padding (matches eTMS APK) ============
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function aesEncryptBase64(plaintext) {
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(cfg.qrCrypto.key),
      { name: "AES-CBC" }, false, ["encrypt"]
    );
    const ct = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: enc.encode(cfg.qrCrypto.iv) },
      key, enc.encode(plaintext)
    );
    let bin = ""; const arr = new Uint8Array(ct);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function buildQrPayload(pass, emp) {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    return JSON.stringify({
      busPassType: pass.busPassType,
      timeStamp:   stamp,
      requestId:   pass.requestId,
      empCode:     emp.empCode,
      empid:       emp.empId,
      busmanagementId: pass.busManagementId,
      empName:     emp.name,
      tripType:    pass.tripType,
      pickTiming:  pass.pickTiming,
      dropTiming:  pass.dropTiming,
      routeId:     pass.routeId
    });
  }

  function qrDataUrl(text) {
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(8, 0);
  }

  async function aesDecryptBase64(b64) {
    const bin = atob(b64);
    const ct = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ct[i] = bin.charCodeAt(i);
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(cfg.qrCrypto.key),
      { name: "AES-CBC" }, false, ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: enc.encode(cfg.qrCrypto.iv) },
      key, ct
    );
    return dec.decode(pt);
  }

  async function decodeQrText(raw) {
    const out = { raw, decrypted: null, parsed: null };
    if (!raw) return out;
    try {
      const plain = await aesDecryptBase64(raw.trim());
      out.decrypted = plain;
      try { out.parsed = JSON.parse(plain); } catch (_) {}
    } catch (_) {}
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]
    );
  }

  function ensureJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "jsQR.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load jsQR.js"));
      document.head.appendChild(s);
    });
  }

  // ============ Router ============
  const routes = {
    "#/home":       renderHome,
    "#/view-pass":  renderViewPass,
    "#/upcoming":   renderUpcoming,
    "#/history":    renderHistory,
    "#/renew":      renderRenew,
    "#/edit":       () => renderTripTypeChooser("Edit Bus Pass"),
    "#/apply":      () => renderTripTypeChooser("Apply Bus Pass"),
    "#/scan":       renderScan,
    "#/settings":   renderSettings,
    "#/logout":     handleLogout
  };

  function navigate(hash) {
    if (!routes[hash]) hash = "#/home";
    closeDrawer();
    window.location.hash = hash;
  }

  function onRouteChange() {
    stopActiveScan();
    const hash = window.location.hash || "#/home";
    const fn = routes[hash] || renderHome;
    const v = document.getElementById("view");
    v.className = "view " + (hash === "#/view-pass" ? "fit-screen" : "scrollable");
    document.body.classList.toggle("no-topbar", hash === "#/home");
    fn();
    highlightDrawerActive(hash);
    v.scrollTop = 0;
  }

  // ============ Top bar config per route ============
  function setTopBar(opts) {
    const left = document.getElementById("topLeftBtn");
    const title = document.getElementById("topbarTitle");
    const bell = document.getElementById("topBellBtn");
    title.textContent = opts.title;
    left.innerHTML = opts.back ? I.back : I.menu;
    left.onclick = opts.back ? () => history.length > 1 ? history.back() : navigate("#/home")
                             : openDrawer;
    bell.hidden = !opts.bell;
    if (opts.bell) {
      bell.innerHTML = I.bell;
      bell.onclick = () => showToast("No new notifications");
    }
  }

  // ============ Screens ============
  async function renderViewPass() {
    setTopBar({ title: cfg.branding.appName, bell: true });
    const v = document.getElementById("view");
    const p = cfg.currentPass;
    v.innerHTML = `
      <section class="route-card">
        <div class="route-from">${p.from}</div>
        <div class="route-arrows">${I.routeArrows}</div>
        <div class="route-to">${p.to}</div>
        <div class="route-times">
          <span class="time-pickup">Office In - ${p.pickTiming}</span>
          <span class="time-drop">Office Out - ${p.dropTiming}</span>
        </div>
      </section>

      <section class="pass-card" id="qrView">
        <div class="corner-accent"></div>
        <div class="pass-title">Confirmed Bus Pass</div>
        <div class="dashed-line"></div>
        <div class="qr-wrapper"><img id="qrImg" alt="QR" /></div>
      </section>

      <section class="pass-card hidden" id="detailsView" style="display:none">
        <div class="corner-accent"></div>
        <div class="pass-title">Confirmed Bus Pass</div>
        <div class="dashed-line"></div>
        <div class="details-grid">
          <div class="detail">
            <div class="detail-label">Name</div>
            <div class="detail-value">${cfg.employee.name}</div>
          </div>
          <div class="detail right">
            <div class="detail-label">Employee ID</div>
            <div class="detail-value">${cfg.employee.empCode}</div>
          </div>
          <div class="detail">
            <div class="detail-label">Bus Stop Name</div>
            <div class="detail-value">${p.busStopName}</div>
          </div>
          <div class="detail right">
            <div class="detail-label">Route Type</div>
            <div class="detail-value">${p.routeTypeLabel}</div>
          </div>
          <div class="detail">
            <div class="detail-label">Start Date</div>
            <div class="detail-value">${p.startDate}</div>
          </div>
          <div class="detail right">
            <div class="detail-label">End Date</div>
            <div class="detail-value">${p.endDate}</div>
          </div>
        </div>
        <div class="route-line">Route : ${p.routeName}</div>
      </section>

      <button class="primary-btn" id="toggleBtn">View Details</button>

      <footer class="brand-footer">
        <img src="${cfg.branding.logoUrl}" alt="Tata Consultancy Services" />
      </footer>
    `;

    const payload = buildQrPayload(p, cfg.employee);
    try {
      const enc = await aesEncryptBase64(payload);
      document.getElementById("qrImg").src = qrDataUrl(enc);
    } catch (e) {
      console.error("QR encryption failed:", e);
      document.getElementById("qrImg").src = qrDataUrl(payload);
    }

    let showingQR = true;
    document.getElementById("toggleBtn").addEventListener("click", () => {
      showingQR = !showingQR;
      document.getElementById("qrView").style.display = showingQR ? "" : "none";
      document.getElementById("detailsView").style.display = showingQR ? "none" : "";
      document.getElementById("toggleBtn").textContent = showingQR ? "View Details" : "View QR";
    });
  }

  function listCard(item, opts) {
    const statusCls = "status-" + item.status.toLowerCase();
    const actions = opts.actions || [];
    return `
      <div class="list-card">
        <div class="row-top">
          <div class="req-id"><b>Request Id : </b>${item.requestId}</div>
          <div class="status ${statusCls}">${item.status}</div>
          ${item.canEdit ? `<button class="edit-btn" data-edit="${item.requestId}">${I.edit}</button>` : ""}
        </div>
        <div class="divider"></div>
        <div class="row-body">
          <div class="marker">${I.pickDropMarker}</div>
          <div class="stops">
            <div class="stop-line"><b>${item.busStop}</b></div>
            <div class="stop-line">${item.facility}</div>
          </div>
        </div>
        <div class="meta">
          <div>Bus Stop : <b>${item.busStop}</b></div>
          <div>Trip : <b>${item.tripType}</b></div>
          <div>Pick : <b>${item.pickTime}</b></div>
          <div>Drop : <b>${item.dropTime}</b></div>
          <div>Start : <b>${item.startDate}</b></div>
          <div>End : <b>${item.endDate}</b></div>
        </div>
        ${actions.length ? `<div class="card-actions">${actions.join("")}</div>` : ""}
      </div>
    `;
  }

  function renderUpcoming() {
    setTopBar({ title: "Buspass Request Status" });
    const list = cfg.upcoming || [];
    const v = document.getElementById("view");
    if (!list.length) {
      v.innerHTML = `<div class="list-empty">${cfg.copy.noUpcoming}</div>`;
      return;
    }
    v.innerHTML = `<div class="list-bg">` + list.map(item => listCard(item, {
      actions: item.canCancel
        ? [`<button class="pill pill-cancel" data-cancel="${item.requestId}">Cancel</button>`]
        : []
    })).join("") + `</div>`;

    v.querySelectorAll("[data-cancel]").forEach(b => {
      b.addEventListener("click", () => openCancelFlow(b.getAttribute("data-cancel")));
    });
    v.querySelectorAll("[data-edit]").forEach(b => {
      b.addEventListener("click", () => navigate("#/edit"));
    });
  }

  function renderHistory() {
    setTopBar({ title: "Bus Pass History" });
    const list = cfg.history || [];
    const v = document.getElementById("view");
    if (!list.length) {
      v.innerHTML = `<div class="list-empty">${cfg.copy.noHistory}</div>`;
      return;
    }
    v.innerHTML = `<div class="list-bg">` + list.map(item => listCard(item, {})).join("") + `</div>`;
  }

  function renderRenew() {
    setTopBar({ title: "Renew Bus Pass", back: true });
    const p = cfg.currentPass;
    const months = cfg.renewMonths || [];
    const v = document.getElementById("view");
    v.innerHTML = `
      <section class="route-card">
        <div class="route-from">${p.from}</div>
        <div class="route-arrows">${I.routeArrows}</div>
        <div class="route-to">${p.to}</div>
        <div class="route-times">
          <span>Office In - ${p.pickTiming}</span>
          <span>Office Out - ${p.dropTiming}</span>
        </div>
      </section>

      <section class="section-card">
        <div class="form-label">Bus Stop</div>
        <div class="form-value">${p.busStopName}</div>
        <div class="form-label">Route</div>
        <div class="form-value">${p.routeName}</div>
        <div class="section-divider"></div>
        <div class="section-h">Select Month</div>
        <div class="month-grid">
          ${months.map((m, i) => `
            <div class="month-pill" data-idx="${i}">
              <div class="m-label">${m.label}</div>
              <div class="m-charge">${m.charges}</div>
              <div class="m-date">${m.date}</div>
            </div>
          `).join("")}
        </div>
      </section>

      <button class="primary-btn" id="renewBtn" disabled>Renew</button>

      <div class="modify-link">
        <span>${cfg.copy.modifyPrompt}</span>
        <a href="#/edit">Click Here</a>
      </div>
    `;

    let selected = null;
    v.querySelectorAll(".month-pill").forEach(el => {
      el.addEventListener("click", () => {
        v.querySelectorAll(".month-pill").forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        selected = el.getAttribute("data-idx");
        document.getElementById("renewBtn").disabled = false;
      });
    });
    document.getElementById("renewBtn").addEventListener("click", () => {
      if (selected == null) return;
      showToast("Bus pass renewal submitted for " + months[selected].label);
      setTimeout(() => navigate("#/upcoming"), 900);
    });
  }

  function renderTripTypeChooser(title) {
    setTopBar({ title, back: true });
    const p = cfg.currentPass;
    const v = document.getElementById("view");
    v.innerHTML = `
      <section class="facility-card">
        <div>${I.pickDropMarker}</div>
        <div class="lines">
          <div class="line">Your location: ${p.busStopName}</div>
          <div class="line">Your Selected Facility: ${p.to}</div>
        </div>
      </section>

      <h2 class="trip-header">Please select your bus pass trip type:</h2>

      <div class="trip-card" data-trip="P">
        <div class="home-icon">${I.homeBldg}</div>
        <div class="office-icon">${I.officeBldg}</div>
        <div class="t-title">Pick Up</div>
        <div class="t-sub">Home &nbsp;→&nbsp; Office</div>
      </div>

      <div class="trip-card" data-trip="D">
        <div class="home-icon">${I.officeBldg}</div>
        <div class="office-icon">${I.homeBldg}</div>
        <div class="t-title">Drop</div>
        <div class="t-sub">Office &nbsp;→&nbsp; Home</div>
      </div>

      <div class="trip-card" data-trip="B">
        <div class="home-icon">${I.homeBldg}</div>
        <div class="office-icon">${I.officeBldg}</div>
        <div class="t-title">Both</div>
        <div class="t-sub">Home ↔ Office</div>
      </div>

      <button class="primary-btn" id="tripNextBtn" disabled style="margin-top:20px">Proceed</button>
    `;
    let pick = null;
    v.querySelectorAll(".trip-card").forEach(c => c.addEventListener("click", () => {
      v.querySelectorAll(".trip-card").forEach(x => x.classList.remove("selected"));
      c.classList.add("selected");
      pick = c.getAttribute("data-trip");
      document.getElementById("tripNextBtn").disabled = false;
    }));
    document.getElementById("tripNextBtn").addEventListener("click", () => {
      const tripLabel = { P: "Pick Up", D: "Drop", B: "Both" }[pick];
      showToast(`Trip type "${tripLabel}" selected — proceeding...`);
      setTimeout(() => navigate("#/renew"), 800);
    });
  }

  // ============ Scan QR ============
  let _scanState = null;

  function stopActiveScan() {
    if (!_scanState) return;
    _scanState.cancelled = true;
    if (_scanState.raf) cancelAnimationFrame(_scanState.raf);
    if (_scanState.stream) _scanState.stream.getTracks().forEach(t => t.stop());
    _scanState = null;
  }

  function renderEtmsFields(p) {
    const rows = [
      ["Employee Name", p.empName],
      ["Employee Code", p.empCode],
      ["Employee Id",   p.empid],
      ["Request Id",    p.requestId],
      ["Bus Pass Type", p.busPassType],
      ["Trip Type",     p.tripType],
      ["Pick Timing",   p.pickTiming],
      ["Drop Timing",   p.dropTiming],
      ["Route Id",      p.routeId],
      ["Bus Mgmt Id",   p.busmanagementId],
      ["Timestamp",     p.timeStamp]
    ];
    return `<div class="scan-grid">` + rows.map(([k, v]) => `
      <div class="scan-field">
        <div class="scan-k">${k}</div>
        <div class="scan-v">${escapeHtml(v == null ? "—" : String(v))}</div>
      </div>
    `).join("") + `</div>`;
  }

  async function renderScan() {
    setTopBar({ title: "Scan QR", back: true });
    const v = document.getElementById("view");
    v.innerHTML = `
      <section class="scan-card">
        <div class="scan-viewport">
          <video id="scanVideo" playsinline muted autoplay></video>
          <div class="scan-reticle">
            <span class="rc tl"></span><span class="rc tr"></span>
            <span class="rc bl"></span><span class="rc br"></span>
          </div>
        </div>
        <div class="scan-status" id="scanStatus">Requesting camera…</div>
        <div class="scan-hint">Hold the QR code inside the frame.</div>
      </section>
      <canvas id="scanCanvas" style="display:none"></canvas>
      <section class="scan-result" id="scanResult" hidden></section>
    `;

    const video  = document.getElementById("scanVideo");
    const canvas = document.getElementById("scanCanvas");
    const status = document.getElementById("scanStatus");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = "Camera not supported in this browser.";
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
    } catch (e) {
      status.textContent =
        e.name === "NotAllowedError"
          ? "Camera permission denied. Enable it and try again."
        : e.name === "NotFoundError"
          ? "No camera found on this device."
        : "Camera unavailable (" + e.name + "). HTTPS or localhost is required.";
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch (_) {}

    const state = { stream, cancelled: false, raf: null };
    _scanState = state;
    status.textContent = "Point the camera at a QR code…";

    let detector = null;
    if ("BarcodeDetector" in window) {
      try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
    }
    if (!detector) {
      status.textContent = "Loading decoder…";
      try { await ensureJsQR(); }
      catch { if (!state.cancelled) status.textContent = "Failed to load decoder."; return; }
      if (state.cancelled) return;
      status.textContent = "Point the camera at a QR code…";
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let lastDecodeAt = 0;

    async function tick() {
      if (state.cancelled) return;
      if (video.readyState < 2) { state.raf = requestAnimationFrame(tick); return; }

      let text = null;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else {
          // throttle jsQR to ~10 Hz — it's CPU-heavy
          const now = performance.now();
          if (now - lastDecodeAt > 100) {
            lastDecodeAt = now;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code) text = code.data;
          }
        }
      } catch (_) {}

      if (text) { onDetected(text); return; }
      state.raf = requestAnimationFrame(tick);
    }
    state.raf = requestAnimationFrame(tick);

    async function onDetected(text) {
      stopActiveScan();
      const out = await decodeQrText(text);
      const resultEl = document.getElementById("scanResult");
      const statusEl = document.getElementById("scanStatus");
      if (!resultEl) return;
      const isEtms = !!out.parsed;
      const kindLabel = isEtms ? "eTMS Bus Pass" : (out.decrypted ? "Decrypted (not JSON)" : "Raw QR");
      const kindClass = isEtms ? "kind-etms" : (out.decrypted ? "kind-decrypted" : "kind-raw");
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div class="scan-result-header">
          <span class="scan-kind ${kindClass}">${kindLabel}</span>
        </div>
        ${isEtms
          ? renderEtmsFields(out.parsed)
          : `<pre class="scan-text">${escapeHtml(out.decrypted || out.raw)}</pre>`}
        <details class="scan-details">
          <summary>Show raw QR data</summary>
          <pre class="scan-text">${escapeHtml(out.raw)}</pre>
        </details>
        <div class="scan-actions">
          <button class="primary-btn" id="scanAgainBtn">Scan Again</button>
          <button class="primary-btn secondary" id="scanCopyBtn">Copy</button>
        </div>
      `;
      if (statusEl) statusEl.textContent = "QR detected.";
      document.getElementById("scanAgainBtn").addEventListener("click", () => renderScan());
      document.getElementById("scanCopyBtn").addEventListener("click", async () => {
        const txt = isEtms ? JSON.stringify(out.parsed, null, 2) : (out.decrypted || out.raw);
        try { await navigator.clipboard.writeText(txt); showToast("Copied"); }
        catch { showToast("Copy failed"); }
      });
    }
  }

  function renderHome() {
    // No toolbar on OptionActivity in the original APK — hide it on home.
    document.body.classList.add("no-topbar");
    const v = document.getElementById("view");
    const tiles = cfg.homeTiles || [];
    v.innerHTML = `
      <div class="home-bg">
        <div class="home-headers">
          <h2 class="home-welcome">Welcome To</h2>
          <h1 class="home-app">TCS eTMS</h1>
          <p class="home-prompt">PLEASE SELECT YOUR SERVICE</p>
        </div>
        <div class="home-tiles-list">
          ${tiles.map(t => `
            <button class="home-tile ${t.active ? '' : 'inactive'}" data-route="${t.route}" data-label="${t.label}">
              <span class="home-tile-icon">${I[t.icon] || I.tileBuspass}</span>
              <span class="home-tile-label">${t.label}</span>
            </button>
          `).join("")}
          <button class="home-tile home-tile-settings" data-route="#/settings" data-label="Settings">
            <span class="home-tile-icon">${I.tileSettings}</span>
            <span class="home-tile-label">Settings</span>
          </button>
        </div>
      </div>
    `;
    v.querySelectorAll(".home-tile").forEach(t => {
      t.addEventListener("click", () => {
        const r = t.getAttribute("data-route");
        const lbl = t.getAttribute("data-label");
        if (r) navigate(r);
        else showToast(`${lbl} — coming soon`);
      });
    });
  }

  // ============ Settings (editable config with localStorage persistence) ============
  // Schema describes which fields are editable, their group label, input type
  const SETTINGS_SCHEMA = [
    { group: "Branding", fields: [
      { path: "branding.appName",  label: "App Title",  type: "text" }
    ]},
    { group: "Employee", fields: [
      { path: "employee.name",     label: "Name",        type: "text" },
      { path: "employee.empCode",  label: "Employee Code", type: "text" },
      { path: "employee.empId",    label: "Employee Id", type: "text" }
    ]},
    { group: "Current Bus Pass", fields: [
      { path: "currentPass.from",            label: "From (Bus Stop)",    type: "text" },
      { path: "currentPass.to",              label: "To (Facility)",       type: "text" },
      { path: "currentPass.busStopName",     label: "Bus Stop Name",       type: "text" },
      { path: "currentPass.pickTiming",      label: "Office In Time",      type: "text" },
      { path: "currentPass.dropTiming",      label: "Office Out Time",     type: "text" },
      { path: "currentPass.startDate",       label: "Start Date",          type: "text" },
      { path: "currentPass.endDate",         label: "End Date",            type: "text" },
      { path: "currentPass.routeTypeLabel",  label: "Route Type Label",    type: "text" },
      { path: "currentPass.routeName",       label: "Route Description",   type: "text" },
      { path: "currentPass.tripType",        label: "Trip Type Code (P/D/B)", type: "text" },
      { path: "currentPass.busPassType",     label: "Pass Type Code",      type: "text" },
      { path: "currentPass.requestId",       label: "Request Id",          type: "number" },
      { path: "currentPass.routeId",         label: "Route Id",            type: "text" },
      { path: "currentPass.busManagementId", label: "Bus Management Id",   type: "number" }
    ]},
    { group: "QR Encryption (eTMS hardcoded)", fields: [
      { path: "qrCrypto.key", label: "AES Key (16 bytes)", type: "text" },
      { path: "qrCrypto.iv",  label: "AES IV (16 bytes)",  type: "text" }
    ]}
  ];

  function getByPath(obj, p) { return p.split(".").reduce((a, k) => a == null ? a : a[k], obj); }
  function setByPath(obj, p, val) {
    const keys = p.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
  }

  function renderSettings() {
    setTopBar({ title: "Settings", back: true });
    const v = document.getElementById("view");
    v.innerHTML = `
      <form id="settingsForm" class="settings-form" autocomplete="off">
        ${SETTINGS_SCHEMA.map(group => `
          <fieldset class="settings-group">
            <legend>${group.group}</legend>
            ${group.fields.map(f => {
              const val = getByPath(cfg, f.path);
              return `
                <label class="settings-field">
                  <span class="settings-label">${f.label}</span>
                  <input class="settings-input"
                         name="${f.path}"
                         type="${f.type}"
                         value="${val == null ? "" : String(val).replace(/"/g, "&quot;")}" />
                </label>
              `;
            }).join("")}
          </fieldset>
        `).join("")}

        <div class="settings-actions">
          <button type="button" class="primary-btn settings-reset" id="settingsReset">Reset to Defaults</button>
          <button type="submit" class="primary-btn settings-save">Save Changes</button>
        </div>
      </form>
    `;

    document.getElementById("settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const overrides = loadOverrides();
      [...form.querySelectorAll(".settings-input")].forEach(inp => {
        let val = inp.value;
        if (inp.type === "number" && val !== "") val = Number(val);
        setByPath(overrides, inp.name, val);
        setByPath(cfg, inp.name, val);
      });
      saveOverrides(overrides);
      showToast("Settings saved");
      // refresh drawer name + any open data
      document.getElementById("drawerName").textContent = cfg.employee.name;
    });

    document.getElementById("settingsReset").addEventListener("click", () => {
      resetOverrides();
      showToast("Reset — reloading defaults");
      setTimeout(() => window.location.reload(), 500);
    });
  }

  function renderPlaceholder(title, body) {
    setTopBar({ title, back: true });
    document.getElementById("view").innerHTML = `<div class="placeholder">${body}</div>`;
  }

  function handleLogout() {
    setTopBar({ title: "Logout", back: true });
    document.getElementById("view").innerHTML = `<div class="placeholder">You have been logged out.</div>`;
  }

  // ============ Cancel flow (policy → reason → confirm) ============
  function openCancelFlow(requestId) {
    showDialog({
      header: "Alert",
      body:   cfg.copy.cancelPolicy,
      cancelText: "Cancel",
      confirmText: "Confirm",
      onConfirm: () => pickReason(requestId)
    });
  }

  function pickReason(requestId) {
    const overlay = document.getElementById("dialogOverlay");
    overlay.querySelector(".dialog").classList.add("reason-dialog");
    document.getElementById("dialogHeader").textContent = "Select Reason";
    document.getElementById("dialogBody").innerHTML =
      `<div class="reason-list">` +
      cfg.cancelReasons.map(r => `<div class="reason-item">${r}</div>`).join("") +
      `</div>`;
    document.querySelector(".dialog-actions").style.display = "none";
    overlay.classList.add("show");
    overlay.querySelectorAll(".reason-item").forEach(el => {
      el.addEventListener("click", () => {
        const reason = el.textContent;
        closeDialog();
        showToast(`Cancelled request ${requestId} — ${reason}`);
        const idx = cfg.upcoming.findIndex(u => String(u.requestId) === String(requestId));
        if (idx >= 0) { cfg.upcoming[idx].status = "Cancelled"; cfg.upcoming[idx].canCancel = false; }
        renderUpcoming();
      });
    });
  }

  // ============ Dialog primitive ============
  function showDialog({ header, body, cancelText, confirmText, onConfirm, onCancel }) {
    const overlay = document.getElementById("dialogOverlay");
    overlay.querySelector(".dialog").classList.remove("reason-dialog");
    document.getElementById("dialogHeader").textContent = header;
    document.getElementById("dialogBody").innerHTML = body;
    document.querySelector(".dialog-actions").style.display = "";
    const c = document.getElementById("dialogCancel");
    const ok = document.getElementById("dialogConfirm");
    c.textContent = cancelText || "Cancel";
    ok.textContent = confirmText || "Confirm";
    c.onclick = () => { closeDialog(); onCancel && onCancel(); };
    ok.onclick = () => { closeDialog(); onConfirm && onConfirm(); };
    overlay.classList.add("show");
  }
  function closeDialog() {
    document.getElementById("dialogOverlay").classList.remove("show");
  }

  // ============ Drawer ============
  function buildDrawer() {
    const nav = document.getElementById("drawerNav");
    nav.innerHTML = cfg.drawer.map(item => `
      <button class="drawer-item" data-route="${item.route}">
        ${I[item.icon] || ""}
        <span>${item.label}</span>
      </button>
    `).join("");
    nav.querySelectorAll(".drawer-item").forEach(b => {
      b.addEventListener("click", () => {
        const r = b.getAttribute("data-route");
        navigate(r);
      });
    });
    document.getElementById("drawerName").textContent = cfg.employee.name;
  }
  function openDrawer() {
    document.getElementById("drawer").classList.add("open");
    document.getElementById("scrim").classList.add("show");
  }
  function closeDrawer() {
    document.getElementById("drawer").classList.remove("open");
    document.getElementById("scrim").classList.remove("show");
  }
  function highlightDrawerActive(hash) {
    document.querySelectorAll(".drawer-item").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-route") === hash);
    });
  }

  // ============ Toast ============
  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ============ Init ============
  document.addEventListener("DOMContentLoaded", () => {
    buildDrawer();
    document.getElementById("scrim").addEventListener("click", closeDrawer);
    window.addEventListener("hashchange", onRouteChange);
    if (!window.location.hash) window.location.hash = "#/home";
    onRouteChange();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => {
        console.warn("SW register failed:", e);
      });
    }
  });
})();
