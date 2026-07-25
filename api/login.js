export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { username, password } = req.body;

    // Ambil kredensial rahasia dari Environment Variables Vercel
    const ADMIN_USER = process.env.ADMIN_USERNAME ;
    const ADMIN_PASS = process.env.ADMIN_PASSWORD ;

    // Validasi login
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      // Login Sukses (Kirim token sederhana/status)
      return res.status(200).json({ 
        success: true, 
        message: "Login Berhasil",
        token: "session_admin_jaten_valid" 
      });
    } else {
      // Login Gagal
      return res.status(401).json({ 
        success: false, 
        message: "Username atau Password salah!" 
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}