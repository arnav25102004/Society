import multer from 'multer';

// Images only (jpg/png), max 5MB — enforced server-side, not just by client intent.
// Extension check backstops MIME sniffing, since multer only sees the client-supplied
// Content-Type on the multipart field, which a malicious client can spoof.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_EXTENSIONS = /\.(jpe?g|png)$/i;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.test(file.originalname)) {
      const err = new Error('Only JPG and PNG images are allowed') as Error & { status: number };
      err.status = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
});
