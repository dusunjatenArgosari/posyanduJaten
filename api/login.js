export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { username, password } = req.body || {};

    // Ambil dari Environment Variables Vercel (dengan fallback default jika variabel belum terbaca)
    const ADMIN_USER = process.env.ADMIN_USERNAME || "adminjaten";
    const ADMIN_PASS = process.env.ADMIN_PASSWORD || "j4tenS3ru2026";

    // Validasi login
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      // Login Sukses
      return res.status(200).json({
        success: true,
        message: "Login Berhasil",
        token: "session_admin_jaten_valid",
      });
    } else {
      // Login Gagal: Kembalikan status HTTP 200 dengan payload success: false
      // Cara ini mencegah browser menampilkan '401 Failed to load resource' di console
      return res.status(200).json({
        success: false,
        message: "Username atau Password salah!",
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}
