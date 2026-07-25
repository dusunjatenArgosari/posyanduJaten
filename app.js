// CONFIGURATION
const SPREADSHEET_ID = "1ZIHwVZpAKzliSOM3rYmRIi7tumXoqD3TwdXJQXcDiU0";
const ENCODED_SHEET_URL =
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMVpJSHdWWnBBS3psaVNPTTNyWW1SSWk3dHVtWG9xRDNUd2RYSlFYY0RpVTAvZWRpdD91c3A9c2hhcmluZw==";

let dataset = [];
let charts = {};

// Cek status Admin
function checkAdminStatus() {
  return sessionStorage.getItem("isAdmin") === "true";
}

// Helper untuk parsing JSON GViz dari Google Sheets
function parseGVizData(text, fallbackHeaders) {
  try {
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonString = text.substring(startIdx, endIdx + 1);
    const jsonData = JSON.parse(jsonString);
    const table = jsonData.table;

    if (!table || !table.rows) return [];

    // Tentukan Nama Header Kolom
    const cols = table.cols.map((col, idx) => {
      if (col && col.label && col.label.trim() !== "") {
        return col.label.trim().toUpperCase().replace(/\s+/g, "_");
      }
      return fallbackHeaders[idx] || `COL_${idx}`;
    });

    return table.rows
      .map((row) => {
        if (!row || !row.c) return null;
        let obj = {};
        row.c.forEach((cell, idx) => {
          let colName = cols[idx];
          let val = "";
          if (cell && cell.v !== null && cell.v !== undefined) {
            val = cell.f ? cell.f : cell.v;
          }
          obj[colName] = val.toString().trim();
        });
        return obj;
      })
      .filter((row) => row && row.ID_WARGA && row.ID_WARGA !== "");
  } catch (err) {
    console.error("Gagal parse data GViz:", err);
    return [];
  }
}

// Fetch Data dari 2 Tabel (warga & pemeriksaan)
async function loadSheetData() {
  const urlWarga = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=warga&tqx=out:json`;
  const urlPemeriksaan = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=pemeriksaan&tqx=out:json`;

  try {
    const [resWarga, resPemeriksaan] = await Promise.all([
      fetch(urlWarga),
      fetch(urlPemeriksaan),
    ]);

    const textWarga = await resWarga.text();
    const textPemeriksaan = await resPemeriksaan.text();

    const dataWarga = parseGVizData(textWarga, [
      "ID_WARGA",
      "NAMA_LENGKAP",
      "JK",
      "USIA",
      "KATEGORI",
      "LAST_UPDATED",
    ]);

    const dataPemeriksaan = parseGVizData(textPemeriksaan, [
      "ID_WARGA",
      "IMT",
      "TEKANAN_DARAH",
      "KATEGORI_IMT",
      "KETERANGAN",
      "TANGGAL_PEMERIKSAAN",
    ]);

    // 1. FILTER PEMERIKSAAN TERAKHIR (LATEST EXAMINATION) PER ID_WARGA
    const mapPemeriksaanTerakhir = {};

    dataPemeriksaan.forEach((p) => {
      if (!p.ID_WARGA) return;
      const idKey = p.ID_WARGA.toUpperCase();

      // Jika ada tanggal periksa, bandingkan tanggal
      // Jika tidak ada tanggal/tanggal sama, entri di baris bawah akan selalu menimpa entri di atasnya
      if (!mapPemeriksaanTerakhir[idKey]) {
        mapPemeriksaanTerakhir[idKey] = p;
      } else {
        const tglBaru = p.TANGGAL_PEMERIKSAAN
          ? new Date(p.TANGGAL_PEMERIKSAAN)
          : null;
        const tglLama = mapPemeriksaanTerakhir[idKey].TANGGAL_PEMERIKSAAN
          ? new Date(mapPemeriksaanTerakhir[idKey].TANGGAL_PEMERIKSAAN)
          : null;

        if (tglBaru && tglLama) {
          if (tglBaru >= tglLama) {
            mapPemeriksaanTerakhir[idKey] = p; // Timpa jika tanggal lebih baru atau sama
          }
        } else {
          // Jika tidak ada tanggal resmi, otomatis gunakan entri paling bawah di sheet
          mapPemeriksaanTerakhir[idKey] = p;
        }
      }
    });

    // 2. GABUNGKAN DATA WARGA DENGAN PEMERIKSAAN TERAKHIR TIAP ORANG
    dataset = dataWarga.map((w) => {
      const idKey = (w.ID_WARGA || "").toUpperCase();
      const p = mapPemeriksaanTerakhir[idKey] || {};

      return {
        ...w,
        IMT: p.IMT || p.NILAI_IMT || p.KATEGORI_IMT || "",
        KATEGORI_IMT: p.KATEGORI_IMT || p.STATUS_IMT || "",
        TEKANAN_DARAH: p.KETERANGAN || p.TD || p.SISTOL_DIASTOL || "",
        KETERANGAN: p.KETERANGAN || "",
        LAST_UPDATED:
          p.TANGGAL_PEMERIKSAAN || p.LAST_UPDATED || w.LAST_UPDATED || "",
      };
    });

    console.log(
      "Data Pemeriksaan Terakhir Per-Orang Berhasil Dimuat:",
      dataset,
    );
    renderCurrentPageData();
  } catch (err) {
    console.error("Gagal memuat data:", err);
  }
}

// Render data sesuai halaman
function renderCurrentPageData() {
  const isAdmin = checkAdminStatus();
  updateUIState(isAdmin);

  const lansia = dataset.filter(
    (d) => (d.KATEGORI || "").toLowerCase() === "lansia",
  );
  const remaja = dataset.filter(
    (d) => (d.KATEGORI || "").toLowerCase() === "remaja",
  );

  // Dashboard Utama
  if (document.getElementById("stat-total")) {
    document.getElementById("stat-total").innerText = dataset.length;
    document.getElementById("stat-lansia").innerText = lansia.length;
    document.getElementById("stat-remaja").innerText = remaja.length;
    renderDashboardCharts(lansia.length, remaja.length);
  }

  // Halaman Lansia
  if (document.getElementById("table-lansia-body")) {
    renderLansiaView(lansia);
  }

  // Halaman Remaja
  if (document.getElementById("table-remaja-body")) {
    renderRemajaView(remaja);
  }
}

// Update UI Banner & Status Admin
function updateUIState(isAdmin) {
  const banner = document.getElementById("admin-banner");
  if (banner) {
    if (isAdmin) banner.classList.remove("hidden");
    else banner.classList.add("hidden");
  }

  const btnText = document.getElementById("admin-btn-text");
  if (btnText) {
    btnText.innerText = isAdmin ? "Panel Admin" : "Login Admin";
  }

  const loginCard = document.getElementById("admin-login-card");
  const panelCard = document.getElementById("admin-panel-card");
  if (loginCard && panelCard) {
    if (isAdmin) {
      loginCard.classList.add("hidden");
      panelCard.classList.remove("hidden");
    } else {
      loginCard.classList.remove("hidden");
      panelCard.classList.add("hidden");
    }
  }
}

// Visualisasi Dashboard Utama
function renderDashboardCharts(lansiaCount, remajaCount) {
  const canvasKategori = document.getElementById("chart-kategori");
  if (canvasKategori) {
    if (charts.kategori) charts.kategori.destroy();
    charts.kategori = new Chart(canvasKategori, {
      type: "doughnut",
      data: {
        labels: ["Lansia", "Remaja"],
        datasets: [
          {
            data: [lansiaCount, remajaCount],
            backgroundColor: ["#4f46e5", "#0284c7"],
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  const lCount = dataset.filter(
    (d) => (d.JK || "").toUpperCase() === "L",
  ).length;
  const pCount = dataset.filter(
    (d) => (d.JK || "").toUpperCase() === "P",
  ).length;

  const canvasGender = document.getElementById("chart-gender");
  if (canvasGender) {
    if (charts.gender) charts.gender.destroy();
    charts.gender = new Chart(canvasGender, {
      type: "pie",
      data: {
        labels: ["Laki-laki (L)", "Perempuan (P)"],
        datasets: [
          { data: [lCount, pCount], backgroundColor: ["#10b981", "#f43f5e"] },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
}

// Visualisasi & Tabel Halaman Lansia
function renderLansiaView(lansiaData) {
  const isAdmin = checkAdminStatus();
  const tableContainer = document.getElementById("container-table-lansia");
  const guestNotice = document.getElementById("guest-notice-lansia");

  // Kontrol Akses Fitur Daftar Warga Lansia
  if (isAdmin) {
    if (tableContainer) tableContainer.classList.remove("hidden");
    if (guestNotice) guestNotice.classList.add("hidden");
  } else {
    if (tableContainer) tableContainer.classList.add("hidden");
    if (guestNotice) guestNotice.classList.remove("hidden");
  }

  // Render Isi Tabel
  const tbody = document.getElementById("table-lansia-body");
  if (tbody && isAdmin) {
    tbody.innerHTML =
      lansiaData
        .map(
          (item) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-3 font-semibold text-slate-700">${item.ID_WARGA}</td>
        <td class="p-3">${item.NAMA_LENGKAP || "-"}</td>
        <td class="p-3">${item.JK || "-"}</td>
        <td class="p-3">${item.USIA ? item.USIA + " th" : "-"}</td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED || "-"}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada data lansia</td></tr>`;
  }

  // Render Chart Lansia (tetap bisa dilihat Guest jika diinginkan)
  const lCount = lansiaData.filter(
    (d) => (d.JK || "").toUpperCase() === "L",
  ).length;
  const pCount = lansiaData.filter(
    (d) => (d.JK || "").toUpperCase() === "P",
  ).length;

  const canvasLansiaGender = document.getElementById("chart-lansia-gender");
  if (canvasLansiaGender) {
    if (charts.lansiaGender) charts.lansiaGender.destroy();
    charts.lansiaGender = new Chart(canvasLansiaGender, {
      type: "bar",
      data: {
        labels: ["Laki-laki", "Perempuan"],
        datasets: [
          {
            label: "Jumlah Lansia",
            data: [lCount, pCount],
            backgroundColor: ["#6366f1", "#ec4899"],
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
}

// Visualisasi & Tabel Halaman Remaja
function renderRemajaView(remajaData) {
  const isAdmin = checkAdminStatus();
  const tableContainer = document.getElementById("container-table-remaja");
  const guestNotice = document.getElementById("guest-notice-remaja");

  // Kontrol Akses Fitur Daftar Warga Remaja
  if (isAdmin) {
    if (tableContainer) tableContainer.classList.remove("hidden");
    if (guestNotice) guestNotice.classList.add("hidden");
  } else {
    if (tableContainer) tableContainer.classList.add("hidden");
    if (guestNotice) guestNotice.classList.remove("hidden");
  }

  // 1. Update Kartu Ringkasan
  const elTotal = document.getElementById("stat-remaja-total");
  const elL = document.getElementById("stat-remaja-l");
  const elP = document.getElementById("stat-remaja-p");

  const lCount = remajaData.filter(
    (d) => (d.JK || "").toUpperCase() === "L",
  ).length;
  const pCount = remajaData.filter(
    (d) => (d.JK || "").toUpperCase() === "P",
  ).length;

  if (elTotal) elTotal.innerText = remajaData.length;
  if (elL) elL.innerText = lCount;
  if (elP) elP.innerText = pCount;

  // 2. Render Tabel Remaja (Hanya jika Admin)
  const tbody = document.getElementById("table-remaja-body");
  if (tbody && isAdmin) {
    tbody.innerHTML =
      remajaData
        .map(
          (item) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-3 font-semibold text-slate-700">${item.ID_WARGA}</td>
        <td class="p-3">${item.NAMA_LENGKAP || "-"}</td>
        <td class="p-3">${item.JK || "-"}</td>
        <td class="p-3">${item.USIA ? item.USIA + " th" : "-"}</td>
        <td class="p-3">${item.IMT || item.KATEGORI_IMT || "-"}</td>
        <td class="p-3">${item.TEKANAN_DARAH || item.KATEGORI_TD || "-"}</td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED || "-"}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="7" class="p-4 text-center text-slate-400">Tidak ada data remaja</td></tr>`;
  }

  // 3. Render Diagram Batang: Jenis Kelamin Remaja
  const canvasGender = document.getElementById("chart-remaja-gender");
  if (canvasGender) {
    if (charts.remajaGender) charts.remajaGender.destroy();
    charts.remajaGender = new Chart(canvasGender, {
      type: "bar",
      data: {
        labels: ["Laki-laki (L)", "Perempuan (P)"],
        datasets: [
          {
            label: "Jumlah Remaja",
            data: [lCount, pCount],
            backgroundColor: ["#0284c7", "#f43f5e"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // 4. Render Diagram Doughnut: Kelompok Usia Remaja
  const canvasUsia = document.getElementById("chart-remaja-usia");
  if (canvasUsia) {
    let kelUsia = {
      "< 12 th": 0,
      "12 - 15 th": 0,
      "16 - 19 th": 0,
      "≥ 20 th": 0,
      "Belum terisi": 0,
    };
    remajaData.forEach((d) => {
      const u = parseFloat(d.USIA);
      if (isNaN(u) || d.USIA === "") kelUsia["Belum terisi"]++;
      else if (u < 12) kelUsia["< 12 th"]++;
      else if (u <= 15) kelUsia["12 - 15 th"]++;
      else if (u <= 19) kelUsia["16 - 19 th"]++;
      else kelUsia["≥ 20 th"]++;
    });

    if (charts.remajaUsia) charts.remajaUsia.destroy();
    charts.remajaUsia = new Chart(canvasUsia, {
      type: "doughnut",
      data: {
        labels: Object.keys(kelUsia),
        datasets: [
          {
            data: Object.values(kelUsia),
            backgroundColor: [
              "#38bdf8",
              "#0284c7",
              "#0369a1",
              "#075985",
              "#cbd5e1",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  // 5. Render Chart IMT
  const canvasImt = document.getElementById("chart-remaja-imt");
  if (canvasImt) {
    let imtData = {
      "Underweight (<18.5)": 0,
      "Normal (18.5-24.9)": 0,
      "Overweight (25-29.9)": 0,
      "Obesitas (≥30)": 0,
      "Belum Diukur": 0,
    };
    remajaData.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      const val = parseFloat(d.IMT);

      if (kat.includes("kurang") || kat.includes("underweight") || val < 18.5)
        imtData["Underweight (<18.5)"]++;
      else if (kat.includes("normal") || (val >= 18.5 && val <= 24.9))
        imtData["Normal (18.5-24.9)"]++;
      else if (
        kat.includes("lebih") ||
        kat.includes("overweight") ||
        (val >= 25 && val <= 29.9)
      )
        imtData["Overweight (25-29.9)"]++;
      else if (kat.includes("(obesitas)") || val >= 30)
        imtData["Obesitas (≥30)"]++;
      else imtData["Belum Diukur"]++;
    });

    if (charts.remajaImt) charts.remajaImt.destroy();
    charts.remajaImt = new Chart(canvasImt, {
      type: "pie",
      data: {
        labels: Object.keys(imtData),
        datasets: [
          {
            data: Object.values(imtData),
            backgroundColor: [
              "#38bdf8",
              "#10b981",
              "#f59e0b",
              "#ef4444",
              "#cbd5e1",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  // 6. Render Chart Tekanan Darah
  const canvasTd = document.getElementById("chart-remaja-td");
  if (canvasTd) {
    let tdData = {
      "Hipotensi (<90/60)": 0,
      "Normal (90-120/60-80)": 0,
      "Pre-Hipertensi (120-139/80-89)": 0,
      "Hipertensi (≥140/90)": 0,
      "Belum Diukur": 0,
    };
    remajaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();

      if (kat.includes("hipo") || kat.includes("rendah"))
        tdData["Hipotensi (<90/60)"]++;
      else if (kat.includes("normal")) tdData["Normal (90-120/60-80)"]++;
      else if (kat.includes("pre") || kat.includes("sedang"))
        tdData["Pre-Hipertensi (120-139/80-89)"]++;
      else if (kat.includes("hiper") || kat.includes("tinggi"))
        tdData["Hipertensi (≥140/90)"]++;
      else if (rawTd.includes("/")) {
        const parts = rawTd.split("/").map((x) => parseFloat(x.trim()));
        const sys = parts[0];
        const dia = parts[1];
        if (sys < 90 || dia < 60) tdData["Hipotensi (<90/60)"]++;
        else if (sys <= 120 && dia <= 80) tdData["Normal (90-120/60-80)"]++;
        else if (sys <= 139 || dia <= 89)
          tdData["Pre-Hipertensi (120-139/80-89)"]++;
        else tdData["Hipertensi (≥140/90)"]++;
      } else tdData["Belum Diukur"]++;
    });

    if (charts.remajaTd) charts.remajaTd.destroy();
    charts.remajaTd = new Chart(canvasTd, {
      type: "bar",
      data: {
        labels: [
          "Hipotensi",
          "Normal",
          "Pre-Hipertensi",
          "Hipertensi",
          "Belum Diukur",
        ],
        datasets: [
          {
            label: "Jumlah Remaja",
            data: Object.values(tdData),
            backgroundColor: [
              "#38bdf8",
              "#10b981",
              "#f59e0b",
              "#ef4444",
              "#94a3b8",
            ],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
  // 5. Chart IMT berdasarkan Jenis Kelamin (Grouped Bar Chart)
  const canvasImtGender = document.getElementById("chart-remaja-imt-gender");
  if (canvasImtGender) {
    const categories = [
      "Underweight",
      "Normal",
      "Overweight",
      "Obesitas",
      "Belum Diukur",
    ];
    let imtL = [0, 0, 0, 0, 0];
    let imtP = [0, 0, 0, 0, 0];

    remajaData.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      const val = parseFloat(d.IMT);
      const isLaki = (d.JK || "").toUpperCase() === "L";
      let idx = 4; // Default: Belum Diukur

      if (kat.includes("kurang") || kat.includes("underweight") || val < 18.5)
        idx = 0;
      else if (kat.includes("normal") || (val >= 18.5 && val <= 24.9)) idx = 1;
      else if (
        kat.includes("lebih") ||
        kat.includes("overweight") ||
        (val >= 25 && val <= 29.9)
      )
        idx = 2;
      else if (kat.includes("obesitas") || val >= 30) idx = 3;

      if (isLaki) imtL[idx]++;
      else imtP[idx]++;
    });

    if (charts.remajaImtGender) charts.remajaImtGender.destroy();
    charts.remajaImtGender = new Chart(canvasImtGender, {
      type: "bar",
      data: {
        labels: categories,
        datasets: [
          {
            label: "Laki-laki (L)",
            data: imtL,
            backgroundColor: "#0284c7",
            borderRadius: 4,
          },
          {
            label: "Perempuan (P)",
            data: imtP,
            backgroundColor: "#f43f5e",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // 6. Chart Tekanan Darah berdasarkan Jenis Kelamin (Grouped Bar Chart)
  const canvasTdGender = document.getElementById("chart-remaja-td-gender");
  if (canvasTdGender) {
    const categoriesTd = [
      "Hipotensi",
      "Normal",
      "Pre-Hipertensi",
      "Hipertensi",
      "Belum Diukur",
    ];
    let tdL = [0, 0, 0, 0, 0];
    let tdP = [0, 0, 0, 0, 0];

    remajaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();
      const isLaki = (d.JK || "").toUpperCase() === "L";
      let idx = 4; // Default: Belum Diukur

      if (kat.includes("hipo") || kat.includes("rendah")) idx = 0;
      else if (kat.includes("normal")) idx = 1;
      else if (kat.includes("pre") || kat.includes("sedang")) idx = 2;
      else if (kat.includes("hiper") || kat.includes("tinggi")) idx = 3;
      else if (rawTd.includes("/")) {
        const parts = rawTd.split("/").map((x) => parseFloat(x.trim()));
        const sys = parts[0];
        const dia = parts[1];
        if (sys < 90 || dia < 60) idx = 0;
        else if (sys <= 120 && dia <= 80) idx = 1;
        else if (sys <= 139 || dia <= 89) idx = 2;
        else idx = 3;
      }

      if (isLaki) tdL[idx]++;
      else tdP[idx]++;
    });

    if (charts.remajaTdGender) charts.remajaTdGender.destroy();
    charts.remajaTdGender = new Chart(canvasTdGender, {
      type: "bar",
      data: {
        labels: categoriesTd,
        datasets: [
          {
            label: "Laki-laki (L)",
            data: tdL,
            backgroundColor: "#0284c7",
            borderRadius: 4,
          },
          {
            label: "Perempuan (P)",
            data: tdP,
            backgroundColor: "#f43f5e",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}

// Authentication via Vercel Serverless Function
async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById("username").value;
  const p = document.getElementById("password").value;
  const errEl = document.getElementById("login-error");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: u, password: p }),
    });

    const result = await response.json();

    if (result.success) {
      // Simpan session & token
      sessionStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("adminToken", result.token);
      if (errEl) errEl.classList.add("hidden");

      // Redirect ke dashboard utama
      window.location.href = "index.html";
    } else {
      // Tampilkan pesan error pada UI jika username/password salah
      if (errEl) {
        errEl.innerText = result.message || "Login gagal!";
        errEl.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Error login:", err);
    if (errEl) {
      errEl.innerText = "Terjadi kesalahan koneksi ke server.";
      errEl.classList.remove("hidden");
    }
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("isAdmin");
  updateUIState(false);
  window.location.href = "index.html";
}

function openSpreadsheet() {
  if (checkAdminStatus()) {
    const sheetUrl = atob(ENCODED_SHEET_URL);
    window.open(sheetUrl, "_blank");
  } else {
    alert("Akses ditolak. Anda harus login sebagai admin!");
  }
}

// Initializer
window.addEventListener("DOMContentLoaded", () => {
  loadSheetData();
});
