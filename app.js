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

// Helper parsing JSON GViz yang lebih akurat
function parseGVizData(text, fallbackHeaders) {
  try {
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonString = text.substring(startIdx, endIdx + 1);
    const jsonData = JSON.parse(jsonString);
    const table = jsonData.table;

    if (!table || !table.rows) return [];

    // Tentukan nama kolom berdasarkan label GViz atau fallback array
    const cols = table.cols.map((col, idx) => {
      if (col && col.label && col.label.trim() !== "") {
        return col.label.trim().toUpperCase().replace(/\s+/g, "_");
      }
      return (fallbackHeaders[idx] || `COL_${idx}`).toUpperCase();
    });

    return (
      table.rows
        .map((row) => {
          if (!row || !row.c) return null;
          let obj = {};
          row.c.forEach((cell, idx) => {
            let colName = cols[idx];
            let val = "";
            if (cell && cell.v !== null && cell.v !== undefined) {
              val = cell.f !== undefined ? cell.f : cell.v;
            }
            obj[colName] = val.toString().trim();
          });
          return obj;
        })
        // Ambil row yang memiliki ID_WARGA valid
        .filter((row) => row && row.ID_WARGA && row.ID_WARGA !== "")
    );
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
      "RT",
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

  // Hitung berapa warga yang sudah memiliki catatan pemeriksaan
  const terperiksa = dataset.filter(
    (d) => d.LAST_UPDATED && d.LAST_UPDATED !== "",
  ).length;

  // 1. Dashboard Utama
  if (document.getElementById("stat-total")) {
    document.getElementById("stat-total").innerText = dataset.length;
    document.getElementById("stat-lansia").innerText = lansia.length;
    document.getElementById("stat-remaja").innerText = remaja.length;
    if (document.getElementById("stat-terperiksa")) {
      document.getElementById("stat-terperiksa").innerText = terperiksa;
    }

    renderDashboardCharts(lansia.length, remaja.length);
    renderRecentActivityTable();
  }

  // 2. Halaman Lansia
  if (document.getElementById("table-lansia-body")) {
    renderLansiaView(lansia);
  }

  // 3. Halaman Remaja
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

function renderRecentActivityTable() {
  const tbody = document.getElementById("table-dashboard-recent");
  if (!tbody) return;

  // Urutkan warga berdasarkan LAST_UPDATED
  const recentData = [...dataset]
    .filter((d) => d.LAST_UPDATED && d.LAST_UPDATED !== "")
    .slice(0, 5);

  if (recentData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada aktivitas pemeriksaan</td></tr>`;
    return;
  }

  tbody.innerHTML = recentData
    .map(
      (item) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-3 font-semibold text-slate-700">${item.ID_WARGA}</td>
        <td class="p-3">
          <div class="font-medium text-slate-800">${item.NAMA_LENGKAP || "Warga"}</div>
          <div class="text-xs text-slate-400">${item.KATEGORI || "-"} (${item.JK || "-"})</div>
        </td>
        <td class="p-3"><span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">RT ${item.RT || "-"}</span></td>
        <td class="p-3"><span class="font-semibold ${item.IMT ? "text-indigo-600" : "text-slate-400"}">${item.IMT || "-"}</span></td>
        <td class="p-3">${item.TEKANAN_DARAH || "-"}</td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED}</td>
      </tr>
    `,
    )
    .join("");
}

// Visualisasi Dashboard Utama
function renderDashboardCharts(lansiaCount, remajaCount) {
  // Chart 1: Kategori Warga (Doughnut)
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
            borderWidth: 0,
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

  // Chart 2: Gender Warga (Pie)
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
          {
            data: [lCount, pCount],
            backgroundColor: ["#10b981", "#f43f5e"],
            borderWidth: 0,
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

  // Chart 3: Summary Status IMT Gabungan (Bar)
  const canvasDashImt = document.getElementById("chart-dashboard-imt");
  if (canvasDashImt) {
    let imtSummary = { Normal: 0, "Kurang / Lebih": 0, "Belum Diukur": 0 };

    dataset.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      if (kat.includes("normal")) imtSummary["Normal"]++;
      else if (
        kat.includes("kurang") ||
        kat.includes("underweight") ||
        kat.includes("lebih") ||
        kat.includes("overweight") ||
        kat.includes("obesitas")
      ) {
        imtSummary["Kurang / Lebih"]++;
      } else {
        imtSummary["Belum Diukur"]++;
      }
    });

    if (charts.dashImt) charts.dashImt.destroy();
    charts.dashImt = new Chart(canvasDashImt, {
      type: "bar",
      data: {
        labels: Object.keys(imtSummary),
        datasets: [
          {
            label: "Jumlah Warga",
            data: Object.values(imtSummary),
            backgroundColor: ["#10b981", "#f59e0b", "#cbd5e1"],
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
}

function renderLansiaView(lansiaData) {
  const isAdmin = checkAdminStatus();
  const tableContainer = document.getElementById("container-table-lansia");
  const guestNotice = document.getElementById("guest-notice-lansia");

  // Access Control Tabel
  if (isAdmin) {
    if (tableContainer) tableContainer.classList.remove("hidden");
    if (guestNotice) guestNotice.classList.add("hidden");
  } else {
    if (tableContainer) tableContainer.classList.add("hidden");
    if (guestNotice) guestNotice.classList.remove("hidden");
  }

  // Ringkasan Statistik Kartu
  const elTotal = document.getElementById("stat-lansia-total");
  const elL = document.getElementById("stat-lansia-l");
  const elP = document.getElementById("stat-lansia-p");

  const lCount = lansiaData.filter(
    (d) => (d.JK || "").toUpperCase() === "L",
  ).length;
  const pCount = lansiaData.filter(
    (d) => (d.JK || "").toUpperCase() === "P",
  ).length;

  if (elTotal) elTotal.innerText = lansiaData.length;
  if (elL) elL.innerText = lCount;
  if (elP) elP.innerText = pCount;

  // Render Tabel Data
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
        <td class="p-3"><span class="px-2 py-1 bg-slate-100 rounded text-xs">RT ${item.RT || "-"}</span></td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED || "-"}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data lansia</td></tr>`;
  }

  // Chart 1: Gender Lansia (Bar Chart)
  const canvasGender = document.getElementById("chart-lansia-gender");
  if (canvasGender) {
    if (charts.lansiaGender) charts.lansiaGender.destroy();
    charts.lansiaGender = new Chart(canvasGender, {
      type: "bar",
      data: {
        labels: ["Laki-laki (L)", "Perempuan (P)"],
        datasets: [
          {
            label: "Jumlah Lansia",
            data: [lCount, pCount],
            backgroundColor: ["#4f46e5", "#ec4899"],
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

  // Chart 2: Kelompok Usia Lansia (Doughnut Chart - Warna Beda & Kontras)
  const canvasUsia = document.getElementById("chart-lansia-usia");
  if (canvasUsia) {
    let kelUsia = {
      "60 - 69 th": 0,
      "70 - 79 th": 0,
      "≥ 80 th": 0,
      "Belum terisi": 0,
    };
    lansiaData.forEach((d) => {
      const u = parseFloat(d.USIA);
      if (isNaN(u) || d.USIA === "") kelUsia["Belum terisi"]++;
      else if (u < 70) kelUsia["60 - 69 th"]++;
      else if (u < 80) kelUsia["70 - 79 th"]++;
      else kelUsia["≥ 80 th"]++;
    });

    if (charts.lansiaUsia) charts.lansiaUsia.destroy();
    charts.lansiaUsia = new Chart(canvasUsia, {
      type: "doughnut",
      data: {
        labels: Object.keys(kelUsia),
        datasets: [
          {
            data: Object.values(kelUsia),
            backgroundColor: ["#14b8a6", "#3b82f6", "#6366f1", "#94a3b8"],
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

  // Chart 3: IMT Lansia (Pie Chart - Pewarnaan Bermakna/Semantik Risiko)
  const canvasImt = document.getElementById("chart-lansia-imt");
  if (canvasImt) {
    let imtData = {
      "Normal (18.5-24.9)": 0,
      "Underweight (<18.5)": 0,
      "Overweight (25-29.9)": 0,
      "Obesitas (≥30)": 0,
      "Belum Diukur": 0,
    };
    lansiaData.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      const val = parseFloat(d.IMT);

      if (kat.includes("normal") || (val >= 18.5 && val <= 24.9))
        imtData["Normal (18.5-24.9)"]++;
      else if (
        kat.includes("kurang") ||
        kat.includes("underweight") ||
        val < 18.5
      )
        imtData["Underweight (<18.5)"]++;
      else if (
        kat.includes("lebih") ||
        kat.includes("overweight") ||
        (val >= 25 && val <= 29.9)
      )
        imtData["Overweight (25-29.9)"]++;
      else if (kat.includes("obesitas") || val >= 30)
        imtData["Obesitas (≥30)"]++;
      else imtData["Belum Diukur"]++;
    });

    if (charts.lansiaImt) charts.lansiaImt.destroy();
    charts.lansiaImt = new Chart(canvasImt, {
      type: "pie",
      data: {
        labels: Object.keys(imtData),
        datasets: [
          {
            data: Object.values(imtData),
            backgroundColor: [
              "#10b981",
              "#f59e0b",
              "#f97316",
              "#dc2626",
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

  // Chart 4: IMT Berdasarkan Gender (Grouped Bar Chart)
  const canvasImtGender = document.getElementById("chart-lansia-imt-gender");
  if (canvasImtGender) {
    const categories = [
      "Normal",
      "Underweight",
      "Overweight",
      "Obesitas",
      "Belum Diukur",
    ];
    let imtL = [0, 0, 0, 0, 0];
    let imtP = [0, 0, 0, 0, 0];

    lansiaData.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      const val = parseFloat(d.IMT);
      const isLaki = (d.JK || "").toUpperCase() === "L";
      let idx = 4;

      if (kat.includes("normal") || (val >= 18.5 && val <= 24.9)) idx = 0;
      else if (
        kat.includes("kurang") ||
        kat.includes("underweight") ||
        val < 18.5
      )
        idx = 1;
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

    if (charts.lansiaImtGender) charts.lansiaImtGender.destroy();
    charts.lansiaImtGender = new Chart(canvasImtGender, {
      type: "bar",
      data: {
        labels: categories,
        datasets: [
          {
            label: "Laki-laki (L)",
            data: imtL,
            backgroundColor: "#4f46e5",
            borderRadius: 4,
          },
          {
            label: "Perempuan (P)",
            data: imtP,
            backgroundColor: "#ec4899",
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

  // Chart 5: Tekanan Darah Lansia (Line Chart & Label Rentang Medis)
  const canvasTd = document.getElementById("chart-lansia-td");
  if (canvasTd) {
    let tdData = {
      "< 90/60 mmHg": 0,
      "90-120 / 60-80 mmHg": 0,
      "120-139 / 80-89 mmHg": 0,
      "≥ 140/90 mmHg": 0,
      "Belum Diukur": 0,
    };

    lansiaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();

      if (kat.includes("hipo") || kat.includes("rendah"))
        tdData["< 90/60 mmHg"]++;
      else if (kat.includes("normal")) tdData["90-120 / 60-80 mmHg"]++;
      else if (kat.includes("pre") || kat.includes("sedang"))
        tdData["120-139 / 80-89 mmHg"]++;
      else if (kat.includes("hiper") || kat.includes("tinggi"))
        tdData["≥ 140/90 mmHg"]++;
      else if (rawTd.includes("/")) {
        const parts = rawTd.split("/").map((x) => parseFloat(x.trim()));
        const sys = parts[0];
        const dia = parts[1];
        if (sys < 90 || dia < 60) tdData["< 90/60 mmHg"]++;
        else if (sys <= 120 && dia <= 80) tdData["90-120 / 60-80 mmHg"]++;
        else if (sys <= 139 || dia <= 89) tdData["120-139 / 80-89 mmHg"]++;
        else tdData["≥ 140/90 mmHg"]++;
      } else {
        tdData["Belum Diukur"]++;
      }
    });

    if (charts.lansiaTd) charts.lansiaTd.destroy();
    charts.lansiaTd = new Chart(canvasTd, {
      type: "line",
      data: {
        labels: Object.keys(tdData),
        datasets: [
          {
            label: "Jumlah Lansia",
            data: Object.values(tdData),
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: "#0284c7",
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

  // Chart 6: Tekanan Darah Berdasarkan Gender (Grouped Bar Chart & Label Rentang Medis)
  const canvasTdGender = document.getElementById("chart-lansia-td-gender");
  if (canvasTdGender) {
    const categoriesTd = [
      "< 90/60",
      "90-120/60-80",
      "120-139/80-89",
      "≥ 140/90",
      "Belum Diukur",
    ];
    let tdL = [0, 0, 0, 0, 0];
    let tdP = [0, 0, 0, 0, 0];

    lansiaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();
      const isLaki = (d.JK || "").toUpperCase() === "L";
      let idx = 4;

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

    if (charts.lansiaTdGender) charts.lansiaTdGender.destroy();
    charts.lansiaTdGender = new Chart(canvasTdGender, {
      type: "bar",
      data: {
        labels: categoriesTd,
        datasets: [
          {
            label: "Laki-laki (L)",
            data: tdL,
            backgroundColor: "#4f46e5",
            borderRadius: 4,
          },
          {
            label: "Perempuan (P)",
            data: tdP,
            backgroundColor: "#ec4899",
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

// Visualisasi & Tabel Halaman Remaja
function renderRemajaView(remajaData) {
  const isAdmin = checkAdminStatus();
  const tableContainer = document.getElementById("container-table-remaja");
  const guestNotice = document.getElementById("guest-notice-remaja");

  // Access Control Tabel
  if (isAdmin) {
    if (tableContainer) tableContainer.classList.remove("hidden");
    if (guestNotice) guestNotice.classList.add("hidden");
  } else {
    if (tableContainer) tableContainer.classList.add("hidden");
    if (guestNotice) guestNotice.classList.remove("hidden");
  }

  // Ringkasan Statistik Kartu
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

  // Render Tabel Data
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
        <td class="p-3"><span class="px-2 py-1 bg-slate-100 rounded text-xs">RT ${item.RT || "-"}</span></td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED || "-"}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data remaja</td></tr>`;
  }

  // Chart 1: Gender Remaja (Bar Chart)
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

  // Chart 2: Kelompok Usia Remaja (Doughnut Chart - Warna Beda & Kontras)
  const canvasUsia = document.getElementById("chart-remaja-usia");
  if (canvasUsia) {
    let kelUsia = {
      "10 - 14 th": 0,
      "15 - 18 th": 0,
      "Belum terisi": 0,
    };
    remajaData.forEach((d) => {
      const u = parseFloat(d.USIA);
      if (isNaN(u) || d.USIA === "") kelUsia["Belum terisi"]++;
      else if (u <= 14) kelUsia["10 - 14 th"]++;
      else kelUsia["15 - 18 th"]++;
    });

    if (charts.remajaUsia) charts.remajaUsia.destroy();
    charts.remajaUsia = new Chart(canvasUsia, {
      type: "doughnut",
      data: {
        labels: Object.keys(kelUsia),
        datasets: [
          {
            data: Object.values(kelUsia),
            backgroundColor: ["#06b6d4", "#3b82f6", "#94a3b8"],
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

  // Chart 3: IMT Remaja (Pie Chart - Pewarnaan Bermakna/Semantik Risiko)
  const canvasImt = document.getElementById("chart-remaja-imt");
  if (canvasImt) {
    let imtData = {
      "Normal (18.5-24.9)": 0,
      "Underweight (<18.5)": 0,
      "Overweight (25-29.9)": 0,
      "Obesitas (≥30)": 0,
      "Belum Diukur": 0,
    };
    remajaData.forEach((d) => {
      const kat = (d.KATEGORI_IMT || "").toLowerCase();
      const val = parseFloat(d.IMT);

      if (kat.includes("normal") || (val >= 18.5 && val <= 24.9))
        imtData["Normal (18.5-24.9)"]++;
      else if (
        kat.includes("kurang") ||
        kat.includes("underweight") ||
        val < 18.5
      )
        imtData["Underweight (<18.5)"]++;
      else if (
        kat.includes("lebih") ||
        kat.includes("overweight") ||
        (val >= 25 && val <= 29.9)
      )
        imtData["Overweight (25-29.9)"]++;
      else if (kat.includes("obesitas") || val >= 30)
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
              "#10b981",
              "#f59e0b",
              "#f97316",
              "#dc2626",
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

  // Chart 4: IMT Berdasarkan Gender (Grouped Bar Chart)
  const canvasImtGender = document.getElementById("chart-remaja-imt-gender");
  if (canvasImtGender) {
    const categories = [
      "Normal",
      "Underweight",
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
      let idx = 4;

      if (kat.includes("normal") || (val >= 18.5 && val <= 24.9)) idx = 0;
      else if (
        kat.includes("kurang") ||
        kat.includes("underweight") ||
        val < 18.5
      )
        idx = 1;
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

  // Chart 5: Tekanan Darah Remaja (Line Chart & Label Rentang Medis)
  const canvasTd = document.getElementById("chart-remaja-td");
  if (canvasTd) {
    let tdData = {
      "< 90/60 mmHg": 0,
      "90-120 / 60-80 mmHg": 0,
      "120-139 / 80-89 mmHg": 0,
      "≥ 140/90 mmHg": 0,
      "Belum Diukur": 0,
    };

    remajaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();

      if (kat.includes("hipo") || kat.includes("rendah"))
        tdData["< 90/60 mmHg"]++;
      else if (kat.includes("normal")) tdData["90-120 / 60-80 mmHg"]++;
      else if (kat.includes("pre") || kat.includes("sedang"))
        tdData["120-139 / 80-89 mmHg"]++;
      else if (kat.includes("hiper") || kat.includes("tinggi"))
        tdData["≥ 140/90 mmHg"]++;
      else if (rawTd.includes("/")) {
        const parts = rawTd.split("/").map((x) => parseFloat(x.trim()));
        const sys = parts[0];
        const dia = parts[1];
        if (sys < 90 || dia < 60) tdData["< 90/60 mmHg"]++;
        else if (sys <= 120 && dia <= 80) tdData["90-120 / 60-80 mmHg"]++;
        else if (sys <= 139 || dia <= 89) tdData["120-139 / 80-89 mmHg"]++;
        else tdData["≥ 140/90 mmHg"]++;
      } else {
        tdData["Belum Diukur"]++;
      }
    });

    if (charts.remajaTd) charts.remajaTd.destroy();
    charts.remajaTd = new Chart(canvasTd, {
      type: "line",
      data: {
        labels: Object.keys(tdData),
        datasets: [
          {
            label: "Jumlah Remaja",
            data: Object.values(tdData),
            borderColor: "#0d9488",
            backgroundColor: "rgba(13, 148, 136, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: "#0d9488",
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

  // Chart 6: Tekanan Darah Berdasarkan Gender (Grouped Bar Chart & Label Rentang Medis)
  const canvasTdGender = document.getElementById("chart-remaja-td-gender");
  if (canvasTdGender) {
    const categoriesTd = [
      "< 90/60",
      "90-120/60-80",
      "120-139/80-89",
      "≥ 140/90",
      "Belum Diukur",
    ];
    let tdL = [0, 0, 0, 0, 0];
    let tdP = [0, 0, 0, 0, 0];

    remajaData.forEach((d) => {
      const kat = (d.KETERANGAN || "").toLowerCase();
      const rawTd = (d.KETERANGAN || "").toString();
      const isLaki = (d.JK || "").toUpperCase() === "L";
      let idx = 4;

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
