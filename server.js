// --- Kütüphaneleri Yükle ---
const express = require('express');
const cors = require('cors');
// 'multer', dosya yüklemelerini (file uploads) yönetmek için kullanılan bir kütüphanedir.
const multer = require('multer');
// 'fs' (File System), Node.js'in içinde gelen, dosyaları okuyup yazmamızı sağlayan bir modüldür.
const fs = require('fs');
// 'path', dosya yollarıyla çalışmayı kolaylaştıran bir modüldür.
const path = require('path');

// --- Sunucu Kurulumu ---
const app = express();
const PORT = 3000;

// --- "Sahte" Veritabanı Dosyası ---
// Artık verileri hafızada değil, bu dosyada saklayacağız.
const DB_FILE = path.join(__dirname, 'db.json');

// --- Dosya Yükleme (Multer) Kurulumu ---
// Yüklenen dosyaların nereye kaydedileceğini ve adlarının ne olacağını ayarla.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        // 'uploads' klasörü yoksa oluştur
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Dosya adını benzersiz hale getir (örn: 1678886400000-odev.pdf)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
// Multer'ı bu ayarlarla başlat
const upload = multer({ storage: storage });

// --- Ara Yazılımlar (Middlewares) ---
app.use(express.json());
app.use(cors());

// YENİ: 'uploads' klasörünü internete "aç"
// Bu, http://localhost:3000/uploads/dosya-adi.pdf gibi linklerin çalışmasını sağlar.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Veritabanı Yardımcı Fonksiyonları ---

// Veritabanı dosyasını okuyan fonksiyon
function readDB() {
    // db.json dosyası yoksa, boş bir şablonla oluştur
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { assignments: [], submissions: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    // Varsa, oku ve JSON olarak parse et
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        // Dosya boşsa veya geçersizse
        if (data.trim() === '') {
             const initialData = { assignments: [], submissions: [] };
             fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
             return initialData;
        }
        return JSON.parse(data);
    } catch (e) {
        console.error("db.json okuma hatası, dosya sıfırlanıyor:", e);
        const initialData = { assignments: [], submissions: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
}

// Veritabanı dosyasına yazan fonksiyon
function writeDB(data) {
    // JSON'u "düzgün" formatla (null, 2) dosyaya yaz
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- API Rotaları (Endpoints) ---

// 1. Rota: TÜM ÖDEVLERİ GETİR (Artık db.json'dan)
app.get('/api/assignments', (req, res) => {
    console.log('GET /api/assignments: Tüm ödevler istendi.');
    const db = readDB();
    const sortedAssignments = db.assignments.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    res.json(sortedAssignments);
});

// 2. Rota: TÜM TESLİMLERİ GETİR (Artık db.json'dan)
app.get('/api/submissions', (req, res) => {
    console.log('GET /api/submissions: Tüm teslimler istendi.');
    const db = readDB();
    res.json(db.submissions);
});

// 3. Rota: YENİ ÖDEV OLUŞTUR (Artık db.json'a yazıyor)
app.post('/api/assignments', (req, res) => {
    console.log('POST /api/assignments: Yeni ödev oluşturuluyor...');
    const { title, description, dueDate } = req.body;

    if (!title || !dueDate) {
        return res.status(400).json({ message: 'Başlık ve tarih zorunludur.' });
    }

    const newAssignment = {
        id: 'id-' + Date.now().toString(),
        title: title,
        description: description,
        dueDate: dueDate,
        createdAt: new Date().toISOString()
    };

    // Veritabanını oku, yeni ödevi ekle, ve geri yaz
    const db = readDB();
    db.assignments.push(newAssignment);
    writeDB(db);
    
    console.log('Yeni ödev eklendi:', newAssignment);
    res.status(201).json(newAssignment);
});

// 4. Rota: YENİ TESLİM OLUŞTUR (Dosya Yükleme ile)
// 'upload.single('submissionFile')' -> Bu, 'submissionFile' adında tek bir dosya beklediğimizi söyler.
app.post('/api/submissions', upload.single('submissionFile'), (req, res) => {
    console.log('POST /api/submissions: Yeni teslim (dosya ile) oluşturuluyor...');
    
    // Metin alanları (studentName, assignmentId) 'req.body' içinde gelir
    const { assignmentId, studentName } = req.body;
    // Yüklenen dosya bilgisi 'req.file' içinde gelir
    const file = req.file;

    if (!assignmentId || !studentName || !file) {
        return res.status(400).json({ message: 'Tüm alanlar ve dosya zorunludur.' });
    }

    const newSubmission = {
        id: 'sub-' + Date.now().toString(),
        assignmentId: assignmentId,
        studentId: 'anonim-kullanici-' + Math.floor(Math.random() * 1000),
        studentName: studentName,
        // Artık bir link değil, sunucudaki dosyanın yolu
        filePath: file.path, 
        fileName: file.originalname,
        // Frontend'in dosyaya erişebilmesi için indirme linki
        downloadUrl: `/uploads/${file.filename}`, 
        submissionTime: new Date().toISOString()
    };
    
    // Teslimatı db.json'a kaydet
    const db = readDB();
    db.submissions.push(newSubmission);
    writeDB(db);

    console.log('Yeni teslim (dosya ile) eklendi:', newSubmission);
    res.status(201).json(newSubmission);
});

// 5. Rota: ÖDEVİ SİL (Artık db.json'dan siliyor)
app.delete('/api/assignments/:id', (req, res) => {
    const { id } = req.params; 
    console.log(`DELETE /api/assignments/${id}: Ödev siliniyor...`);

    const db = readDB();
    const assignmentIndex = db.assignments.findIndex(a => a.id === id);

    if (assignmentIndex === -1) {
        return res.status(404).json({ message: 'Ödev bulunamadı.' });
    }

    // Ödevi sil
    db.assignments.splice(assignmentIndex, 1);
    
    // Bu ödeve ait teslimleri de sil (şimdilik bu kısmı basit tutuyoruz)
    db.submissions = db.submissions.filter(s => s.assignmentId !== id);
    
    // Not: Bu işlem dosyaları 'uploads' klasöründen silmez, sadece veritabanı kaydını siler.
    // Dosyaları da silmek için 'fs.unlinkSync(filePath)' gerekir ama şimdilik bu kadarı yeterli.
    
    writeDB(db);
    
    console.log('Ödev ve ilişkili teslim kayıtları silindi.');
    res.status(204).send();
});


// --- Sunucuyu Başlat ---
app.listen(PORT, () => {
    console.log(`Backend sunucusu (v2) başarıyla http://localhost:${PORT} adresinde çalıştırıldı.`);
    
    // Gerekli klasör ve dosyaları kontrol et/oluştur
    if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, 'uploads'));
        console.log("'uploads' klasörü oluşturuldu.");
    }
    readDB(); // db.json'u kontrol et/oluştur
    console.log("'db.json' veritabanı dosyası hazır.");
});

