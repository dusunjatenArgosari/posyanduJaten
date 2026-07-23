// Visualisasi & Tabel Halaman Remaja (Termasuk Chart IMT & Tekanan Darah)
function renderRemajaView(remajaData) {
  // 1. Update Kartu Ringkasan
  const elTotal = document.getElementById("stat-remaja-total");
  const elL = document.getElementById("stat-remaja-l");
  const elP = document.getElementById("stat-remaja-p");

  const lCount = remajaData.filter((d) => d.JK === "L").length;
  const pCount = remajaData.filter((d) => d.JK === "P").length;

  if (elTotal) elTotal.innerText = remajaData.length;
  if (elL) elL.innerText = lCount;
  if (elP) elP.innerText = pCount;

  // 2. Render Tabel Remaja
  const tbody = document.getElementById("table-remaja-body");
  if (tbody) {
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
        <td class="p-3">${item.TEKANAN_DARAH || item.TD || "-"}</td>
        <td class="p-3 text-xs text-slate-400">${item.LAST_UPDATED || "-"}</td>
      </tr>
    `,
        )
        .join("") ||
      `<tr><td colspan="7" class="p-4 text-center text-slate-400">Tidak ada data remaja</td></tr>`;
  }

  // 3. Diagram Jenis Kelamin
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

  // 4. Diagram Kelompok Usia
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

  // 5. Diagram Kategori IMT (Indeks Massa Tubuh)
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
      const kat = (d.KATEGORI_IMT || d.IMT_STATUS || "").toLowerCase();
      const val = parseFloat(d.IMT || d.NILAI_IMT);

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

  // 6. Diagram Kategori Tekanan Darah
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
      const kat = (d.KATEGORI_TD || d.STATUS_TD || "").toLowerCase();
      const rawTd = (d.TEKANAN_DARAH || d.TD || "").toString();

      if (kat.includes("hipo") || kat.includes("rendah")) {
        tdData["Hipotensi (<90/60)"]++;
      } else if (kat.includes("normal")) {
        tdData["Normal (90-120/60-80)"]++;
      } else if (kat.includes("pre") || kat.includes("sedang")) {
        tdData["Pre-Hipertensi (120-139/80-89)"]++;
      } else if (kat.includes("hiper") || kat.includes("tinggi")) {
        tdData["Hipertensi (≥140/90)"]++;
      } else if (rawTd.includes("/")) {
        const parts = rawTd.split("/").map((x) => parseFloat(x.trim()));
        const sys = parts[0];
        const dia = parts[1];

        if (sys < 90 || dia < 60) tdData["Hipotensi (<90/60)"]++;
        else if (sys <= 120 && dia <= 80) tdData["Normal (90-120/60-80)"]++;
        else if (sys <= 139 || dia <= 89)
          tdData["Pre-Hipertensi (120-139/80-89)"]++;
        else tdData["Hipertensi (≥140/90)"]++;
      } else {
        tdData["Belum Diukur"]++;
      }
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
}
