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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Default configuration
const DEFAULT_CONFIG = {
  senderEmail: '',
  appPassword: '',
  senderName: 'Calista',
  senderTitle: 'Sales Manager | Vinh Cuu Stone',
  senderPhone: '+84 816 075 599',
  subjectTemplate: 'Vietnam Basalt & Granite – Direct Quarry & Factory Supplier',
  bodyTemplate: `Dear {{company_name}} team,\n\nI’m Calista, Sales Manager at Vinh Cuu Stone. We have our own quarry and factory in Vietnam, supplying natural basalt (bluestone) and granite directly.\n\nOur main products:\n- Bluestone saw cut pavers and tiles: 600x1200, 600x900, 400x600, 300x600, in 20/30/50 mm, with 5 finishes\n- Cobbles, tumbled pavers, crazy paving and stepping stones\n- Kerbs, pool coping and wall cladding\n- Granite (yellow and gray) and pebbles\n\nI’ve attached our 2026 catalogue and photos. Are you currently looking for a supplier? If so, please send me the destination port, the products you need and the max cargo weight, and I’ll prepare a quotation right away.\n\nWe look forward to a long-term cooperation with you.\n\nWhatsApp: +84 816 075 599\n\nBest regards,\nCalista\nSales Manager | Vinh Cuu Stone`,
  delayMin: 20,
  delayMax: 45
};

// ================= CORE HELPER FUNCTIONS =================

function loadConfig(filePath = CONFIG_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
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
    service: 'gmail',
    auth: {
      user: (senderEmail || '').trim(),
      pass: (appPassword || '').replace(/\s+/g, '')
    }
  });
}

let campaignState = {
  status: 'idle',
  total: 0,
  sentCount: 0,
  failedCount: 0,
  currentIndex: 0,
  targets: [],
  currentDelayCountdown: 0,
  activeLogs: []
};

let sseClients = [];

function broadcastState(eventType = 'update', data = null) {
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

// 1. Config API
app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({
    ...cfg,
    hasAppPassword: Boolean(cfg.appPassword)
  });
});

app.post('/api/config', (req, res) => {
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
    appPassword: req.body.appPassword !== undefined && req.body.appPassword !== '' ? req.body.appPassword.trim() : current.appPassword,
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

// Test Gmail SMTP Connection
app.post('/api/test-connection', async (req, res) => {
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
    if (err.message && err.message.includes('Invalid login')) {
      msg = 'Đăng nhập không thành công. Hãy chắc chắn bạn dùng "Mật khẩu ứng dụng" Google 16 ký tự, không phải mật khẩu tài khoản chính.';
    }
    return res.status(400).json({ success: false, message: msg });
  }
});

// Send Test Email to a specific address with detailed SMTP response
app.post('/api/send-test-email', async (req, res) => {
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
app.get('/api/attachments', (req, res) => {
  const files = getUploadedFiles();
  const totalBytes = calculateTotalAttachmentSize(files);
  res.json({
    files,
    totalBytes,
    totalFormatted: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB',
    isOverLimit: totalBytes > MAX_TOTAL_SIZE_BYTES
  });
});

app.post('/api/attachments', upload.array('files', 10), (req, res) => {
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

app.delete('/api/attachments/:filename', (req, res) => {
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
app.post('/api/preview-targets', (req, res) => {
  const rawText = req.body.rawText || '';
  const parsed = parseTargetEmails(rawText);
  res.json({
    total: parsed.length,
    targets: parsed
  });
});

// 4. SSE Stream
app.get('/api/campaign/events', (req, res) => {
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

app.post('/api/campaign/start', async (req, res) => {
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
    targets: targets.map(t => ({
      email: t.email,
      companyName: t.companyName || extractCompanyName(t.email),
      status: 'pending',
      note: 'Đang chờ gửi...',
      sentAt: null
    })),
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

app.post('/api/campaign/pause', (req, res) => {
  if (campaignState.status === 'running') {
    campaignState.status = 'paused';
    addLog('warning', 'Chiến dịch đã được TẠM DỪNG.');
    broadcastState('status_change');
    return res.json({ success: true, message: 'Đã tạm dừng chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không trong trạng thái đang chạy.' });
});

app.post('/api/campaign/resume', (req, res) => {
  if (campaignState.status === 'paused') {
    campaignState.status = 'running';
    addLog('info', 'Chiến dịch TIẾP TỤC gửi.');
    broadcastState('status_change');
    return res.json({ success: true, message: 'Đã tiếp tục chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không trong trạng thái tạm dừng.' });
});

app.post('/api/campaign/stop', (req, res) => {
  if (campaignState.status === 'running' || campaignState.status === 'paused') {
    campaignState.status = 'stopped';
    addLog('danger', 'Chiến dịch đã bị NGẮT DỪNG HẲN.');
    broadcastState('status_change');
    return res.json({ success: true, message: 'Đã dừng chiến dịch.' });
  }
  res.status(400).json({ success: false, message: 'Chiến dịch không hoạt động.' });
});

app.get('/api/campaign/export-csv', (req, res) => {
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
      broadcastState('target_update', target);

      const company = target.companyName;
      const vars = {
        company_name: company,
        sender_name: cfg.senderName,
        sender_title: cfg.senderTitle,
        sender_phone: cfg.senderPhone
      };

      const personalizedSubject = interpolateTemplate(subjectTemplate, vars);
      const personalizedBody = interpolateTemplate(bodyTemplate, vars);
      const htmlBody = formatEmailHtml(personalizedBody);

      try {
        const info = await transporter.sendMail({
          from: `"${cfg.senderName} | Vinh Cuu Stone" <${cfg.senderEmail.trim()}>`,
          to: target.email,
          subject: personalizedSubject,
          text: personalizedBody,
          html: `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; max-width: 650px; line-height: 1.6;">${htmlBody}</div>`,
          attachments: mailAttachments
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
      broadcastState('target_update', target);

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
module.exports.campaignState = campaignState;
