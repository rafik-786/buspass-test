(function () {
  const cfg = window.BusPassConfig;
  const I = window.Icons;

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

  function qrImgUrl(data, size) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=" +
           size + "x" + size + "&margin=0&data=" + encodeURIComponent(data);
  }

  // ============ Router ============
  const routes = {
    "#/view-pass":  renderViewPass,
    "#/upcoming":   renderUpcoming,
    "#/history":    renderHistory,
    "#/renew":      renderRenew,
    "#/edit":       () => renderTripTypeChooser("Edit Bus Pass"),
    "#/apply":      () => renderTripTypeChooser("Apply Bus Pass"),
    "#/settings":   () => renderPlaceholder("Settings", "Settings screen"),
    "#/logout":     handleLogout
  };

  function navigate(hash) {
    if (!routes[hash]) hash = "#/view-pass";
    closeDrawer();
    window.location.hash = hash;
  }

  function onRouteChange() {
    const hash = window.location.hash || "#/view-pass";
    const fn = routes[hash] || renderViewPass;
    const v = document.getElementById("view");
    v.className = "view " + (hash === "#/view-pass" ? "fit-screen" : "scrollable");
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
    left.onclick = opts.back ? () => history.length > 1 ? history.back() : navigate("#/view-pass")
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
      document.getElementById("qrImg").src = qrImgUrl(enc, 360);
    } catch (e) {
      console.error("QR encryption failed:", e);
      document.getElementById("qrImg").src = qrImgUrl(payload, 360);
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
    if (!window.location.hash) window.location.hash = "#/view-pass";
    onRouteChange();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => {
        console.warn("SW register failed:", e);
      });
    }
  });
})();
