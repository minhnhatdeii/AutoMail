const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Handle Serverless environments (like Vercel) where filesystem is read-only except /tmp
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOADS_DIR = isServerless ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, 'uploads');
const DATA_DIR = isServerless ? path.join(os.tmpdir(), 'data') : path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CAMPAIGN_STATE_FILE = path.join(DATA_DIR, 'campaign_state.json');

// Security: Master Access PIN
const APP_PIN = process.env.APP_PIN || '66882004';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security Middleware: Require PIN for all internal APIs except verify-pin
function requirePin(req, res, next) {
  // Allow SSE connections with query param or header
  const pin = req.headers['x-app-pin'] || req.query.pin;
  if (pin === APP_PIN) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Yêu cầu mã PIN bảo mật để truy cập dữ liệu!' });
}

// Default configuration
const DEFAULT_CONFIG = {
  senderEmail: '',
  appPassword: '',
  senderName: 'Calista',
  senderTitle: 'Sales Manager | Vinh Cuu Stone',
  senderPhone: '+84 816 075 599',
  subjectTemplate: 'Vietnam Basalt & Granite – Direct Quarry & Factory Supplier',
  bodyTemplate: `Dear {{company_name}} team,\n\nI’m {{sender_name}}, {{sender_title}}. We have our own quarry and factory in Vietnam, supplying natural basalt (bluestone) and granite directly.\n\nOur main products:\n- Bluestone saw cut pavers and tiles: 600x1200, 600x900, 400x600, 300x600, in 20/30/50 mm, with 5 finishes\n- Cobbles, tumbled pavers, crazy paving and stepping stones\n- Kerbs, pool coping and wall cladding\n- Granite (yellow and gray) and pebbles\n\nI’ve attached our 2026 catalogue and photos. Are you currently looking for a supplier? If so, please send me the destination port, the products you need and the max cargo weight, and I’ll prepare a quotation right away.\n\nWe look forward to a long-term cooperation with you.\n\nWhatsApp: {{sender_phone}}\n\nBest regards,\n{{sender_name}}\n{{sender_title}}`,
  delayMin: 20,
  delayMax: 45
};

// ================= CORE HELPER FUNCTIONS =================

function loadConfig(filePath = CONFIG_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const loaded = JSON.parse(data);
      if (loaded.bodyTemplate) {
        loaded.bodyTemplate = loaded.bodyTemplate
          .replace(/I’m\s+(Calista|Calistad)[,\s]+(Sales Manager[^\n]*)/gi, 'I’m {{sender_name}}, {{sender_title}}')
          .replace(/I’m\s+(Calista|Calistad)/gi, 'I’m {{sender_name}}')
          .replace(/WhatsApp:\s*\+84\s*816\s*075\s*599/gi, 'WhatsApp: {{sender_phone}}')
          .replace(/Best regards,\s*\n\s*(Calista|Calistad)\s*\n\s*([^\n]+)/gi, 'Best regards,\n{{sender_name}}\n{{sender_title}}');
      }
      return { ...DEFAULT_CONFIG, ...loaded };
    }
  } catch (err) {
    console.error('Lỗi khi đọc file config, sử dụng cấu hình mặc định:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg, filePath = CONFIG_FILE) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Lỗi khi lưu file config:', err.message);
    return false;
  }
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

function validateDelayRange(min, max) {
  const minSec = Number(min);
  const maxSec = Number(max);
  if (isNaN(minSec) || isNaN(maxSec)) return { valid: false, message: 'Thời gian delay phải là số hợp lệ' };
  if (minSec < 1) return { valid: false, message: 'Thời gian delay tối thiểu phải từ 1 giây trở lên' };
  if (maxSec < minSec) return { valid: false, message: 'Thời gian delay tối đa phải lớn hơn hoặc bằng tối thiểu' };
  return { valid: true, minSec, maxSec };
}

// Logic trích xuất tên doanh nghiệp:
// Bắt đầu ngay sau ký tự '@' và kết thúc ở dấu chấm '.' đầu tiên sau '@'
function extractCompanyName(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'Valued Partner';
  }
  const parts = email.trim().split('@');
  if (parts.length < 2 || !parts[1]) return 'Valued Partner';

  const domainPart = parts[1].toLowerCase().trim();
  const firstDot = domainPart.indexOf('.');
  const raw = firstDot !== -1 ? domainPart.substring(0, firstDot) : domainPart;

  if (!raw) return 'Valued Partner';

  // Fallback an toàn cho các nhà cung cấp webmail công cộng
  const publicWebmails = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'proton', 'mail', 'live', 'aol'];
  if (publicWebmails.includes(raw)) {
    return 'Purchasing';
  }

  // Chuẩn hóa viết hoa chữ cái đầu và giữ nguyên cấu trúc phân cách gạch nối (-) hoặc gạch dưới (_)
  const formatted = raw
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');

  return formatted || 'Valued Partner';
}

function parseTargetEmails(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const seen = new Set();
  const parsed = [];

  for (const line of lines) {
    const match = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match) {
      const email = match[0].toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        const companyName = extractCompanyName(email);
        parsed.push({
          email,
          companyName,
          status: 'pending',
          note: ''
        });
      }
    }
  }

  return parsed;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function interpolateTemplate(template, vars = {}) {
  if (!template || typeof template !== 'string') return '';
  return template
    .replace(/{{company_name}}/g, vars.company_name !== undefined ? vars.company_name : 'Valued Partner')
    .replace(/{{sender_name}}/g, vars.sender_name !== undefined ? vars.sender_name : '')
    .replace(/{{sender_title}}/g, vars.sender_title !== undefined ? vars.sender_title : '')
    .replace(/{{sender_phone}}/g, vars.sender_phone !== undefined ? vars.sender_phone : '');
}

function formatEmailHtml(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped
    .split('\n\n')
    .map(para => `<p style="margin: 0 0 14px 0; line-height: 1.6; font-size: 15px; color: #222;">${para.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function generateCsvReport(targets) {
  let csv = 'STT,Email,Tên Doanh Nghiệp,Trạng Thái,Thời Gian Gửi,Ghi Chú/Lỗi\n';
  if (!targets || !Array.isArray(targets)) return '\uFEFF' + csv;

  targets.forEach((t, idx) => {
    const row = [
      idx + 1,
      `"${(t.email || '').replace(/"/g, '""')}"`,
      `"${(t.companyName || '').replace(/"/g, '""')}"`,
      `"${(t.status || '').replace(/"/g, '""')}"`,
      `"${(t.sentAt || '').replace(/"/g, '""')}"`,
      `"${(t.note || '').replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  return '\uFEFF' + csv; // UTF-8 BOM
}

// ================= FILE UPLOAD SYSTEM (< 20MB) =================

const MAX_TOTAL_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

function getUploadedFiles(dir = UPLOADS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files.map(file => {
    const filePath = path.join(dir, file);
    try {
      const stats = fs.statSync(filePath);
      const firstUnderscore = file.indexOf('_');
      const originalName = firstUnderscore !== -1 ? file.substring(firstUnderscore + 1) : file;
      return {
        filename: file,
        originalName,
        size: stats.size,
        sizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        path: filePath
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function calculateTotalAttachmentSize(files) {
  if (!files || !Array.isArray(files)) return 0;
  return files.reduce((acc, f) => acc + (f.size || 0), 0);
}

// ================= SENDER ENGINE & STATE =================

function createTransporter(senderEmail, appPassword) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: (senderEmail || '').trim(),
      pass: (appPassword || '').replace(/\s+/g, '')
    },
    family: 4, // Buộc dùng IPv4 để loại bỏ hoàn toàn lỗi treo mạng IPv6 trên Windows/nhà mạng VN
    connectionTimeout: 15000, // Timeout kết nối 15s tránh treo vô tận
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

function loadCampaignState(filePath = CAMPAIGN_STATE_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const loaded = JSON.parse(data);
      if (loaded && Array.isArray(loaded.targets)) {
        if (loaded.status === 'running') {
          loaded.status = 'paused';
          loaded.currentDelayCountdown = 0;
        }
        return loaded;
      }
    }
  } catch (err) {
    console.error('Lỗi khi đọc file campaign_state:', err.message);
  }
  return {
    status: 'idle',
    total: 0,
    sentCount: 0,
    failedCount: 0,
    currentIndex: 0,
    targets: [],
    currentDelayCountdown: 0,
    activeLogs: []
  };
}

function saveCampaignState(filePath = CAMPAIGN_STATE_FILE) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(campaignState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Lỗi khi lưu campaign_state:', err.message);
  }
}

let campaignState = loadCampaignState();

let sseClients = [];

function broadcastState(eventType = 'update', data = null) {
  if (['status_change', 'target_update', 'complete'].includes(eventType)) {
    saveCampaignState();
  }
  const payload = JSON.stringify({
    event: eventType,
    state: {
      status: campaignState.status,
      total: campaignState.total,
      sentCount: campaignState.sentCount,
      failedCount: campaignState.failedCount,
      currentIndex: campaignState.currentIndex,
      currentDelayCountdown: campaignState.currentDelayCountdown,
      targets: campaignState.targets,
      latestLog: data
    }
  });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (e) {}
  });
}

function addLog(type, message, details = {}) {
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const logItem = { timestamp, type, message, ...details };
  campaignState.activeLogs.unshift(logItem);
  if (campaignState.activeLogs.length > 500) campaignState.activeLogs.pop();
  broadcastState('log', logItem);
}

// ================= API ENDPOINTS =================

// 0. Auth API: Verify Master Access PIN
app.post('/api/auth/verify-pin', (req, res) => {
  const pin = (req.body.pin || '').toString().trim();
  if (pin === APP_PIN) {
    return res.json({ success: true, message: 'Xác thực mã PIN thành công!' });
  }
  return res.status(401).json({ success: false, message: 'Mã PIN bảo mật không chính xác!' });
});

// 1. Config API (Protected by PIN & Password Masked)
app.get('/api/config', requirePin, (req, res) => {
  const cfg = loadConfig();
  const safeCfg = { ...cfg };
  delete safeCfg.appPassword; // Bảo mật: Không bao giờ trả mật khẩu thô ra ngoài trình duyệt
  res.json({
    ...safeCfg,
    hasAppPassword: Boolean(cfg.appPassword)
  });
});

app.post('/api/config', requirePin, (req, res) => {
  const current = loadConfig();

  if (req.body.senderEmail && !validateEmail(req.body.senderEmail)) {
    return res.status(400).json({ success: false, message: 'Email người gửi không đúng định dạng!' });
  }

  const delayCheck = validateDelayRange(
    req.body.delayMin !== undefined ? req.body.delayMin : current.delayMin,
    req.body.delayMax !== undefined ? req.body.delayMax : current.delayMax
  );
  if (!delayCheck.valid) {
    return res.status(400).json({ success: false, message: delayCheck.message });
  }

  const updated = {
    ...current,
    senderEmail: req.body.senderEmail !== undefined ? req.body.senderEmail.trim() : current.senderEmail,
    appPassword: (req.body.appPassword && req.body.appPassword.trim()) ? req.body.appPassword.trim() : current.appPassword,
    senderName: req.body.senderName !== undefined ? req.body.senderName.trim() : current.senderName,
    senderTitle: req.body.senderTitle !== undefined ? req.body.senderTitle.trim() : current.senderTitle,
    senderPhone: req.body.senderPhone !== undefined ? req.body.senderPhone.trim() : current.senderPhone,
    subjectTemplate: req.body.subjectTemplate !== undefined ? req.body.subjectTemplate : current.subjectTemplate,
    bodyTemplate: req.body.bodyTemplate !== undefined ? req.body.bodyTemplate : current.bodyTemplate,
    delayMin: delayCheck.minSec,
    delayMax: delayCheck.maxSec
  };

  const saved = saveConfig(updated);
  if (saved) {
    res.json({ success: true, message: 'Đã lưu cấu hình thành công!' });
  } else {
    res.status(500).json({ success: false, message: 'Không thể ghi file cấu hình.' });
  }
});

// Test Gmail SMTP Connection (Protected by PIN)
app.post('/api/test-connection', requirePin, async (req, res) => {
  const cfg = loadConfig();
  const email = (req.body.senderEmail || cfg.senderEmail || '').trim();
  const password = (req.body.appPassword || cfg.appPassword || '').trim();

  if (!email) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập Email người gửi!' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ success: false, message: 'Địa chỉ Email người gửi không hợp lệ!' });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập Mật khẩu ứng dụng Google (16 ký tự)!' });
  }

  try {
    const transporter = createTransporter(email, password);
    await transporter.verify();
    return res.json({ success: true, message: 'Kết nối tài khoản Gmail thành công!' });
  } catch (err) {
    let msg = 'Kết nối thất bại: ' + (err.message || 'Sai thông tin đăng nhập.');
    if (err.message && (err.message.includes('Invalid login') || err.code === 'EAUTH')) {
      msg = 'Xác thực thất bại (535 Bad Credentials): Mật khẩu ứng dụng không đúng hoặc đã bị Google vô hiệu hóa. Vui lòng tạo Mật khẩu ứng dụng mới (16 ký tự) tại myaccount.google.com/apppasswords.';
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || (err.message && err.message.toLowerCase().includes('timeout'))) {
      msg = 'Hết thời gian chờ kết nối (Timeout): Máy chủ Google không phản hồi. Vui lòng kiểm tra lại đường truyền mạng Wi-Fi hoặc tường lửa của máy tính.';
    }
    return res.status(400).json({ success: false, message: msg });
  }
});

// Send Test Email to a specific address with detailed SMTP response
app.post('/api/send-test-email', requirePin, async (req, res) => {
  const cfg = loadConfig();
  const targetEmail = (req.body.targetEmail || '').trim();
  const includeAttachments = req.body.includeAttachments !== false;

  if (!targetEmail || !validateEmail(targetEmail)) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email nhận thử nghiệm hợp lệ!' });
  }

  if (!cfg.senderEmail || !cfg.appPassword) {
    return res.status(400).json({ success: false, message: 'Chưa cấu hình Email người gửi hoặc Google App Password!' });
  }

  const companyName = extractCompanyName(targetEmail);
  const vars = {
    company_name: companyName,
    sender_name: cfg.senderName,
    sender_title: cfg.senderTitle,
    sender_phone: cfg.senderPhone
  };

  const subject = '[TEST] ' + interpolateTemplate(cfg.subjectTemplate, vars);
  const body = interpolateTemplate(cfg.bodyTemplate, vars);
  const htmlBody = formatEmailHtml(body);

  let attachments = [];
  if (includeAttachments) {
    const rawFiles = getUploadedFiles();
    attachments = rawFiles.map(att => ({
      filename: att.originalName,
      path: att.path
    }));
  }

  try {
    const transporter = createTransporter(cfg.senderEmail, cfg.appPassword);
    const info = await transporter.sendMail({
      from: `"${cfg.senderName} | Vinh Cuu Stone" <${cfg.senderEmail.trim()}>`,
      to: targetEmail,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; max-width: 650px; line-height: 1.6;">${htmlBody}</div>`,
      attachments
    });

    const isAccepted = info.accepted && info.accepted.includes(targetEmail);
    return res.json({
      success: true,
      message: `Đã gửi thử nghiệm thành công tới [${targetEmail}]!`,
      details: {
        messageId: info.messageId,
        smtpResponse: info.response,
        accepted: info.accepted,
        attachmentCount: attachments.length
      }
    });
  } catch (err) {
    console.error('Send Test Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi gửi mail từ máy chủ Google: ' + (err.message || 'Lỗi không xác định'),
      error: err.message
    });
  }
});

// 2. Attachments API
app.get('/api/attachments', requirePin, (req, res) => {
  const files = getUploadedFiles();
  const totalBytes = calculateTotalAttachmentSize(files);
  res.json({
    files,
    totalBytes,
    totalFormatted: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB',
    isOverLimit: totalBytes > MAX_TOTAL_SIZE_BYTES
  });
});

app.post('/api/attachments', requirePin, upload.array('files', 10), (req, res) => {
  const files = getUploadedFiles();
  const totalBytes = calculateTotalAttachmentSize(files);

  if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
    if (req.files) {
      req.files.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) {}
      });
    }
    return res.status(400).json({
      success: false,
      message: `Tổng dung lượng file đính kèm đã vượt quá 20 MB (${(totalBytes / (1024 * 1024)).toFixed(2)} MB). Vui lòng chọn file nhẹ hơn!`
    });
  }

  res.json({
    success: true,
    message: 'Tải file đính kèm thành công!',
    files,
    totalBytes,
    totalFormatted: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
  });
});

app.delete('/api/attachments/:filename', requirePin, (req, res) => {
  const targetName = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, targetName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: 'Đã xóa file đính kèm.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi khi xóa file: ' + err.message });
    }
  }
  res.status(404).json({ success: false, message: 'Không tìm thấy file.' });
});

// 3. Target Email Parsing API
app.post('/api/preview-targets', requirePin, (req, res) => {
  const rawText = req.body.rawText || '';
  const parsed = parseTargetEmails(rawText);
  res.json({
    total: parsed.length,
    targets: parsed
  });
});

// 4. SSE Stream & State API
app.get('/api/campaign/state', requirePin, (req, res) => {
  res.json({
    success: true,
    state: campaignState
  });
});

app.get('/api/campaign/events', requirePin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  const payload = JSON.stringify({
    event: 'init',
    state: {
      status: campaignState.status,
      total: campaignState.total,
      sentCount: campaignState.sentCount,
      failedCount: campaignState.failedCount,
      currentIndex: campaignState.currentIndex,
      currentDelayCountdown: campaignState.currentDelayCountdown,
      targets: campaignState.targets,
      activeLogs: campaignState.activeLogs
    }
  });
  res.write(`data: ${payload}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// 5. Campaign Dispatcher APIs
let campaignWorkerActive = false;

app.post('/api/campaign/start', requirePin, async (req, res) => {
  if (campaignState.status === 'running') {
    return res.status(400).json({ success: false, message: 'Chiến dịch đang chạy, không thể bắt đầu lại!' });
  }

  const { targets, delayMin, delayMax, subjectTemplate, bodyTemplate } = req.body;
  const cfg = loadConfig();

  if (!cfg.senderEmail || !cfg.appPassword) {
    return res.status(400).json({ success: false, message: 'Chưa cấu hình Email gửi hoặc Google App Password!' });
  }

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách email mục tiêu trống!' });
  }

  const attachments = getUploadedFiles();
  const totalBytes = calculateTotalAttachmentSize(attachments);
  if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
    return res.status(400).json({ success: false, message: 'Tổng dung lượng đính kèm vượt 20MB. Vui lòng giảm dung lượng trước khi gửi!' });
  }

  const delayCheck = validateDelayRange(delayMin || cfg.delayMin, delayMax || cfg.delayMax);
  if (!delayCheck.valid) {
    return res.status(400).json({ success: false, message: delayCheck.message });
  }

  campaignState = {
    status: 'running',
    total: targets.length,
    sentCount: 0,
    failedCount: 0,
    currentIndex: 0,
    targets: targets.map((t, idx) => {
      const company = t.companyName || extractCompanyName(t.email);
      const defaultVars = {
        company_name: company,
        sender_name: cfg.senderName,
        sender_title: cfg.senderTitle,
        sender_phone: cfg.senderPhone
      };
      return {
        id: t.id || `target-${idx}-${Date.now()}`,
        email: t.email,
        companyName: company,
        subject: t.subject ? t.subject.trim() : interpolateTemplate(subjectTemplate || cfg.subjectTemplate, defaultVars),
        body: t.body ? t.body : interpolateTemplate(bodyTemplate || cfg.bodyTemplate, defaultVars),
        attachmentFilenames: Array.isArray(t.attachmentFilenames) ? t.attachmentFilenames : attachments.map(a => a.filename),
        status: 'pending',
        note: 'Đang chờ gửi...',
        sentAt: null
      };
    }),
    currentDelayCountdown: 0,
    activeLogs: []
  };

  const finalDelayMin = delayCheck.minSec;
  const finalDelayMax = delayCheck.maxSec;
  const finalSubject = subjectTemplate || cfg.subjectTemplate;
  const finalBody = bodyTemplate || cfg.bodyTemplate;

  addLog('info', `Bắt đầu chiến dịch gửi tới ${targets.length} đối tác. Giãn cách an toàn: ${finalDelayMin}s - ${finalDelayMax}s.`);

  runCampaignWorker({
    cfg,
    attachments,
    delayMin: finalDelayMin,
    delayMax: finalDelayMax,
    subjectTemplate: finalSubject,
    bodyTemplate: finalBody
  });

  res.json({ success: true, message: 'Chiến dịch đã được khởi động!' });
});

app.post('/api/campaign/pause', requirePin, (req, res) => {
  if (campaignState.status === 'running') {
    campaignState.status = 'paused';
    addLog('warning', 'Chiến dịch đã được TẠM DỪNG.');
    broadcastState('status_change');
    return res.json({ success: true, message: 'Đã tạm dừng chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không trong trạng thái đang chạy.' });
});

app.post('/api/campaign/resume', requirePin, (req, res) => {
  if (campaignState.status === 'paused') {
    campaignState.status = 'running';
    addLog('info', 'Chiến dịch TIẾP TỤC gửi.');
    broadcastState('status_change');
    saveCampaignState();

    // If server restarted or worker stopped, restart background queue dispatcher
    if (!campaignWorkerActive) {
      const cfg = loadConfig();
      const attachments = getUploadedFiles();
      runCampaignWorker({
        cfg,
        attachments,
        delayMin: cfg.delayMin || 20,
        delayMax: cfg.delayMax || 45,
        subjectTemplate: cfg.subjectTemplate,
        bodyTemplate: cfg.bodyTemplate
      });
    }

    return res.json({ success: true, message: 'Đã tiếp tục chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không trong trạng thái tạm dừng.' });
});

app.post('/api/campaign/stop', requirePin, (req, res) => {
  if (campaignState.status === 'running' || campaignState.status === 'paused') {
    campaignState.status = 'stopped';
    addLog('danger', 'Chiến dịch đã bị NGẮT DỪNG HẲN.');
    broadcastState('status_change');
    return res.json({ success: true, message: 'Đã dừng chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không hoạt động.' });
});

// Update a specific pending target's custom subject, body, or attachments
app.post('/api/campaign/target/:index/update', requirePin, (req, res) => {
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || !campaignState.targets || idx >= campaignState.targets.length) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy target tại vị trí này.' });
  }

  const target = campaignState.targets[idx];
  if (target.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Không thể chỉnh sửa target này vì email đang được gửi hoặc đã gửi xong!'
    });
  }

  if (req.body.subject !== undefined) target.subject = req.body.subject.trim();
  if (req.body.body !== undefined) target.body = req.body.body;
  if (req.body.attachmentFilenames !== undefined && Array.isArray(req.body.attachmentFilenames)) {
    target.attachmentFilenames = req.body.attachmentFilenames;
  }

  broadcastState('target_update', { index: idx, target });
  res.json({ success: true, message: 'Đã cập nhật nội dung riêng cho target thành công!', target });
});

app.get('/api/campaign/export-csv', requirePin, (req, res) => {
  if (!campaignState.targets || campaignState.targets.length === 0) {
    return res.status(400).send('Không có dữ liệu chiến dịch để xuất.');
  }

  const csvContent = generateCsvReport(campaignState.targets);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="email_campaign_report_${Date.now()}.csv"`);
  res.send(csvContent);
});

// Background Worker Loop
async function runCampaignWorker({ cfg, attachments, delayMin, delayMax, subjectTemplate, bodyTemplate }) {
  if (campaignWorkerActive) return;
  campaignWorkerActive = true;

  const transporter = createTransporter(cfg.senderEmail, cfg.appPassword);
  const mailAttachments = attachments.map(att => ({
    filename: att.originalName,
    path: att.path
  }));

  try {
    while (campaignState.currentIndex < campaignState.targets.length) {
      if (campaignState.status === 'stopped') break;

      while (campaignState.status === 'paused') {
        await new Promise(r => setTimeout(r, 800));
        if (campaignState.status === 'stopped') break;
      }
      if (campaignState.status === 'stopped') break;

      const idx = campaignState.currentIndex;
      const target = campaignState.targets[idx];
      target.status = 'sending';
      target.note = 'Đang gửi...';
      broadcastState('target_update', { index: idx, target });

      const company = target.companyName;
      const personalizedSubject = target.subject;
      const personalizedBody = target.body;
      const htmlBody = formatEmailHtml(personalizedBody);

      // Determine attachments for this specific target
      const targetAttachments = (target.attachmentFilenames && Array.isArray(target.attachmentFilenames))
        ? attachments.filter(a => target.attachmentFilenames.includes(a.filename)).map(att => ({
            filename: att.originalName,
            path: att.path
          }))
        : mailAttachments;

      try {
        const info = await transporter.sendMail({
          from: `"${cfg.senderName} | Vinh Cuu Stone" <${cfg.senderEmail.trim()}>`,
          to: target.email,
          subject: personalizedSubject,
          text: personalizedBody,
          html: `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; max-width: 650px; line-height: 1.6;">${htmlBody}</div>`,
          attachments: targetAttachments
        });

        target.status = 'success';
        target.sentAt = new Date().toLocaleTimeString('vi-VN');
        target.note = `Google đã nhận (250 OK - ID: ${info.messageId ? info.messageId.slice(0, 15) : 'OK'})`;
        campaignState.sentCount++;
        addLog('success', `Đã chuyển phát thành công tới [${target.email}] -> Dear ${company} team! (Google SMTP: "${info.response || '250 OK'}")`);
      } catch (err) {
        target.status = 'failed';
        target.sentAt = new Date().toLocaleTimeString('vi-VN');
        target.note = err.message || 'Lỗi gửi mail';
        campaignState.failedCount++;
        addLog('danger', `Thất bại khi gửi tới [${target.email}]: ${err.message}`);

        if (err.message && (err.message.includes('Daily user sending limit exceeded') || err.message.includes('Spam detected'))) {
          campaignState.status = 'paused';
          addLog('danger', 'CẢNH BÁO: Gmail đã giới hạn quota hoặc phát hiện spam. Đã tạm dừng chiến dịch tự động!');
          broadcastState('status_change');
          break;
        }
      }

      campaignState.currentIndex++;
      broadcastState('target_update', { index: idx, target });

      if (campaignState.currentIndex < campaignState.targets.length && campaignState.status === 'running') {
        const delaySeconds = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        addLog('info', `Nghỉ an toàn ${delaySeconds}s trước khi gửi email kế tiếp...`);

        for (let s = delaySeconds; s > 0; s--) {
          if (campaignState.status !== 'running') break;
          campaignState.currentDelayCountdown = s;
          broadcastState('countdown', s);
          await new Promise(r => setTimeout(r, 1000));
        }
        campaignState.currentDelayCountdown = 0;
      }
    }

    if (campaignState.status === 'running') {
      campaignState.status = 'completed';
      addLog('success', `HOÀN THÀNH CHIẾN DỊCH! Đã gửi thành công: ${campaignState.sentCount}/${campaignState.total} email.`);
    }
  } finally {
    campaignWorkerActive = false;
    broadcastState('complete');
  }
}

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  VINH CUU STONE - AUTO EMAIL OUTREACH DISPATCHER   `);
    console.log(`  Local Server running at: http://localhost:${PORT}  `);
    console.log(`  Font: Google Sans | Icons: Monochrome B&W         `);
    console.log(`====================================================`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.loadConfig = loadConfig;
module.exports.saveConfig = saveConfig;
module.exports.validateEmail = validateEmail;
module.exports.validateDelayRange = validateDelayRange;
module.exports.extractCompanyName = extractCompanyName;
module.exports.parseTargetEmails = parseTargetEmails;
module.exports.escapeHtml = escapeHtml;
module.exports.interpolateTemplate = interpolateTemplate;
module.exports.formatEmailHtml = formatEmailHtml;
module.exports.generateCsvReport = generateCsvReport;
module.exports.calculateTotalAttachmentSize = calculateTotalAttachmentSize;
module.exports.getUploadedFiles = getUploadedFiles;
module.exports.loadCampaignState = loadCampaignState;
module.exports.saveCampaignState = saveCampaignState;
module.exports.campaignState = campaignState;
