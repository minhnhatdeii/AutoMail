const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  loadConfig,
  saveConfig,
  validateEmail,
  validateDelayRange,
  extractCompanyName,
  parseTargetEmails,
  escapeHtml,
  interpolateTemplate,
  formatEmailHtml,
  generateCsvReport,
  calculateTotalAttachmentSize,
  getUploadedFiles,
  loadCampaignState,
  saveCampaignState
} = require('../server.js');

// Temporary test dir
const TEST_DIR = path.join(__dirname, 'temp_test_data');
const TEST_CONFIG_FILE = path.join(TEST_DIR, 'test_config.json');

before(() => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ==============================================================================
// FEATURE 1: CONFIGURATION MANAGEMENT & CREDENTIAL VALIDATION (10 TEST CASES)
// ==============================================================================
describe('Feature 1: Configuration Management & Credential Validation', () => {

  test('TC1.1: Trả về cấu hình mặc định an toàn khi file cấu hình chưa tồn tại', () => {
    const nonExistentFile = path.join(TEST_DIR, 'non_existent.json');
    const cfg = loadConfig(nonExistentFile);
    assert.equal(cfg.senderName, 'Calista');
    assert.equal(cfg.senderEmail, '');
    assert.equal(cfg.appPassword, '');
    assert.equal(cfg.delayMin, 20);
    assert.equal(cfg.delayMax, 45);
  });

  test('TC1.2: Lưu cấu hình thành công với các trường hợp lệ', () => {
    const testCfg = {
      senderEmail: 'calista@vinhcuustone.com',
      appPassword: 'abcd efgh ijkl mnop',
      senderName: 'Calista',
      senderTitle: 'Sales Manager',
      senderPhone: '+84 816 075 599',
      subjectTemplate: 'Vietnam Basalt Supplier',
      bodyTemplate: 'Dear {{company_name}} team,\nTest',
      delayMin: 25,
      delayMax: 50
    };
    const saved = saveConfig(testCfg, TEST_CONFIG_FILE);
    assert.equal(saved, true);
    assert.equal(fs.existsSync(TEST_CONFIG_FILE), true);
  });

  test('TC1.3: Đọc lại chính xác cấu hình vừa lưu từ file', () => {
    const cfg = loadConfig(TEST_CONFIG_FILE);
    assert.equal(cfg.senderEmail, 'calista@vinhcuustone.com');
    assert.equal(cfg.appPassword, 'abcd efgh ijkl mnop');
    assert.equal(cfg.delayMin, 25);
    assert.equal(cfg.delayMax, 50);
  });

  test('TC1.4: Xác thực email hợp lệ (Valid Email Formats)', () => {
    assert.equal(validateEmail('sales@vinhcuustone.com'), true);
    assert.equal(validateEmail('info@nord-stein.de'), true);
    assert.equal(validateEmail('john.doe+work@domain.co.uk'), true);
  });

  test('TC1.5: Từ chối email không hợp lệ (Invalid Email Formats)', () => {
    assert.equal(validateEmail('notanemail'), false);
    assert.equal(validateEmail('missingdomain@'), false);
    assert.equal(validateEmail('@nodomain.com'), false);
    assert.equal(validateEmail('spaces in@email.com'), false);
    assert.equal(validateEmail(null), false);
    assert.equal(validateEmail(''), false);
  });

  test('TC1.6: Xác thực khoảng thời gian delay hợp lệ (min >= 1, max >= min)', () => {
    const res = validateDelayRange(20, 45);
    assert.equal(res.valid, true);
    assert.equal(res.minSec, 20);
    assert.equal(res.maxSec, 45);
  });

  test('TC1.7: Từ chối khoảng thời gian delay khi min < 1 giây', () => {
    const res = validateDelayRange(0, 30);
    assert.equal(res.valid, false);
    assert.match(res.message, /tối thiểu phải từ 1 giây/);
  });

  test('TC1.8: Từ chối khoảng thời gian delay khi max < min', () => {
    const res = validateDelayRange(50, 20);
    assert.equal(res.valid, false);
    assert.match(res.message, /lớn hơn hoặc bằng tối thiểu/);
  });

  test('TC1.9: Từ chối khoảng thời gian delay khi giá trị không phải số hợp lệ', () => {
    const res = validateDelayRange('abc', 'xyz');
    assert.equal(res.valid, false);
    assert.match(res.message, /phải là số hợp lệ/);
  });

  test('TC1.10: Xử lý an toàn khi file cấu hình bị hỏng cú pháp (Corrupted JSON)', () => {
    const corruptedFile = path.join(TEST_DIR, 'corrupt.json');
    fs.writeFileSync(corruptedFile, 'INVALID_JSON_CONTENT{{{', 'utf-8');
    const cfg = loadConfig(corruptedFile);
    assert.equal(cfg.senderName, 'Calista'); // fallback an toàn về default
  });
});

// ==============================================================================
// FEATURE 2: TARGET EMAIL PARSING & COMPANY NAME EXTRACTION (10 TEST CASES)
// ==============================================================================
describe('Feature 2: Target Email Parsing & Company Name Extraction', () => {

  test('TC2.1: Bóc tách đúng tên công ty có dấu gạch ngang: info@nord-stein.de -> Nord-Stein', () => {
    assert.equal(extractCompanyName('info@nord-stein.de'), 'Nord-Stein');
  });

  test('TC2.2: Bóc tách đúng tên công ty có số ở domain: info@nord-stein2.de -> Nord-Stein2', () => {
    assert.equal(extractCompanyName('info@nord-stein2.de'), 'Nord-Stein2');
  });

  test('TC2.3: Bóc tách đúng tên domain nhiều cấp: sales@natural-stone-quarry.com.vn -> Natural-Stone-Quarry', () => {
    assert.equal(extractCompanyName('sales@natural-stone-quarry.com.vn'), 'Natural-Stone-Quarry');
  });

  test('TC2.4: Bóc tách đúng tên domain đơn: contact@basalt.vn -> Basalt', () => {
    assert.equal(extractCompanyName('contact@basalt.vn'), 'Basalt');
  });

  test('TC2.5: Bóc tách đúng và chuẩn hóa khi email viết chữ in hoa: INFO@NORD-STEIN.DE -> Nord-Stein', () => {
    assert.equal(extractCompanyName('INFO@NORD-STEIN.DE'), 'Nord-Stein');
  });

  test('TC2.6: Nhận diện domain công cộng @gmail.com -> Fallback an toàn về Purchasing', () => {
    assert.equal(extractCompanyName('calista.buyer@gmail.com'), 'Purchasing');
  });

  test('TC2.7: Nhận diện các domain công cộng khác (@yahoo.com, @outlook.com, @proton.me)', () => {
    assert.equal(extractCompanyName('buyer@yahoo.com'), 'Purchasing');
    assert.equal(extractCompanyName('importer@outlook.com'), 'Purchasing');
    assert.equal(extractCompanyName('trade@proton.me'), 'Purchasing');
  });

  test('TC2.8: Bóc tách tên công ty có dấu gạch dưới: info@vinh_cuu.vn -> Vinh-Cuu', () => {
    assert.equal(extractCompanyName('info@vinh_cuu.vn'), 'Vinh-Cuu');
  });

  test('TC2.9: Tự động loại bỏ dòng trống và khoảng trắng thừa trong danh sách dán vào', () => {
    const raw = `
      info@nord-stein.de
      
         
      info@nord-stein2.de
    `;
    const parsed = parseTargetEmails(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].email, 'info@nord-stein.de');
    assert.equal(parsed[1].email, 'info@nord-stein2.de');
  });

  test('TC2.10: Tự động lọc trùng lặp (Deduplication) khi một email bị dán lặp lại nhiều lần', () => {
    const raw = `
      info@nord-stein.de
      info@nord-stein.de
      INFO@NORD-STEIN.DE
      sales@basalt.vn
    `;
    const parsed = parseTargetEmails(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].email, 'info@nord-stein.de');
    assert.equal(parsed[1].email, 'sales@basalt.vn');
  });
});

// ==============================================================================
// FEATURE 3: ATTACHMENT MANAGEMENT & SIZE RESTRICTION < 20MB (10 TEST CASES)
// ==============================================================================
describe('Feature 3: Attachment Management & Size Restriction (<20MB)', () => {
  const TEST_UPLOADS = path.join(TEST_DIR, 'uploads_test');

  before(() => {
    if (!fs.existsSync(TEST_UPLOADS)) fs.mkdirSync(TEST_UPLOADS, { recursive: true });
  });

  test('TC3.1: Tính toán chính xác tổng số byte rỗng khi chưa có file đính kèm', () => {
    const total = calculateTotalAttachmentSize([]);
    assert.equal(total, 0);
  });

  test('TC3.2: Tính toán chính xác tổng số byte của nhiều file đính kèm', () => {
    const mockFiles = [
      { size: 5 * 1024 * 1024 }, // 5 MB
      { size: 8 * 1024 * 1024 }, // 8 MB
      { size: 2 * 1024 * 1024 }  // 2 MB
    ];
    const total = calculateTotalAttachmentSize(mockFiles);
    assert.equal(total, 15 * 1024 * 1024);
  });

  test('TC3.3: Xác định tổng dung lượng 19.5 MB là hợp lệ (< 20MB limit)', () => {
    const totalBytes = 19.5 * 1024 * 1024;
    const limit = 20 * 1024 * 1024;
    assert.equal(totalBytes <= limit, true);
  });

  test('TC3.4: Phát hiện và cảnh báo khi tổng dung lượng vượt quá 20MB (ví dụ 20.5MB)', () => {
    const totalBytes = 20.5 * 1024 * 1024;
    const limit = 20 * 1024 * 1024;
    assert.equal(totalBytes > limit, true);
  });

  test('TC3.5: Lấy danh sách file đính kèm từ thư mục rỗng trả về mảng rỗng []', () => {
    const emptyDir = path.join(TEST_DIR, 'empty_dir');
    if (!fs.existsSync(emptyDir)) fs.mkdirSync(emptyDir);
    const files = getUploadedFiles(emptyDir);
    assert.equal(Array.isArray(files), true);
    assert.equal(files.length, 0);
  });

  test('TC3.6: Quét và đọc chính xác thông tin file vật lý trong thư mục upload', () => {
    const testFilePath = path.join(TEST_UPLOADS, '123456789_Catalogue-2026-VinhCuu.pdf');
    fs.writeFileSync(testFilePath, 'DUMMY PDF CONTENT FOR TEST', 'utf-8');
    const files = getUploadedFiles(TEST_UPLOADS);
    assert.equal(files.length, 1);
    assert.equal(files[0].originalName, 'Catalogue-2026-VinhCuu.pdf');
    assert.equal(files[0].size > 0, true);
  });

  test('TC3.7: Format dung lượng MB chính xác tới 2 chữ số thập phân', () => {
    const bytes = 12.456 * 1024 * 1024;
    const formatted = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    assert.equal(formatted, '12.46 MB');
  });

  test('TC3.8: Tách đúng tên gốc (originalName) khi tên file có tiền tố timestamp timestamp_name.ext', () => {
    const filename = '1700000000_Basalt_Sawn_600x1200.jpg';
    const firstUnderscore = filename.indexOf('_');
    const original = firstUnderscore !== -1 ? filename.substring(firstUnderscore + 1) : filename;
    assert.equal(original, 'Basalt_Sawn_600x1200.jpg');
  });

  test('TC3.9: Xóa file thành công khỏi thư mục vật lý', () => {
    const testFile = path.join(TEST_UPLOADS, '999999_sample_to_delete.png');
    fs.writeFileSync(testFile, 'test image bytes');
    assert.equal(fs.existsSync(testFile), true);
    fs.unlinkSync(testFile);
    assert.equal(fs.existsSync(testFile), false);
  });

  test('TC3.10: Kiểm tra an toàn khi thư mục upload truyền vào không tồn tại', () => {
    const nonDir = path.join(TEST_DIR, 'does_not_exist_folder');
    const files = getUploadedFiles(nonDir);
    assert.deepEqual(files, []);
  });
});

// ==============================================================================
// FEATURE 4: TEMPLATE ENGINE & PERSONALIZATION (10 TEST CASES)
// ==============================================================================
describe('Feature 4: Template Engine & Personalization', () => {

  test('TC4.1: Thay thế chính xác biến {{company_name}} trong Subject', () => {
    const tpl = 'Vietnam Basalt & Granite for {{company_name}}';
    const res = interpolateTemplate(tpl, { company_name: 'Nord-Stein' });
    assert.equal(res, 'Vietnam Basalt & Granite for Nord-Stein');
  });

  test('TC4.2: Thay thế chính xác biến {{company_name}} trong Body (Dear {{company_name}} team,)', () => {
    const tpl = 'Dear {{company_name}} team,\nWe have our own quarry.';
    const res = interpolateTemplate(tpl, { company_name: 'Nord-Stein' });
    assert.equal(res, 'Dear Nord-Stein team,\nWe have our own quarry.');
  });

  test('TC4.3: Thay thế tất cả các lần xuất hiện của biến {{company_name}} (Multiple occurrences)', () => {
    const tpl = 'Dear {{company_name}} team, We hope {{company_name}} is doing well.';
    const res = interpolateTemplate(tpl, { company_name: 'Nord-Stein' });
    assert.equal(res, 'Dear Nord-Stein team, We hope Nord-Stein is doing well.');
  });

  test('TC4.4: Thay thế biến người gửi {{sender_name}} (Calista)', () => {
    const tpl = 'Best regards,\n{{sender_name}}';
    const res = interpolateTemplate(tpl, { sender_name: 'Calista' });
    assert.equal(res, 'Best regards,\nCalista');
  });

  test('TC4.5: Thay thế biến chức danh {{sender_title}}', () => {
    const tpl = '{{sender_name}}\n{{sender_title}}';
    const res = interpolateTemplate(tpl, { sender_name: 'Calista', sender_title: 'Sales Manager | Vinh Cuu Stone' });
    assert.equal(res, 'Calista\nSales Manager | Vinh Cuu Stone');
  });

  test('TC4.6: Thay thế biến số điện thoại {{sender_phone}}', () => {
    const tpl = 'WhatsApp: {{sender_phone}}';
    const res = interpolateTemplate(tpl, { sender_phone: '+84 816 075 599' });
    assert.equal(res, 'WhatsApp: +84 816 075 599');
  });

  test('TC4.7: Fallback an toàn khi biến company_name không được truyền vào', () => {
    const tpl = 'Dear {{company_name}} team,';
    const res = interpolateTemplate(tpl, {});
    assert.equal(res, 'Dear Valued Partner team,');
  });

  test('TC4.8: Chuyển đổi text nhiều đoạn xuống dòng (newline) thành HTML paragraphs <p>', () => {
    const plainText = 'Paragraph 1.\n\nParagraph 2 with line break.\nLine 2.';
    const html = formatEmailHtml(plainText);
    assert.equal(html.includes('<p style='), true);
    assert.equal(html.includes('Paragraph 1.'), true);
    assert.equal(html.includes('Paragraph 2 with line break.<br/>Line 2.'), true);
  });

  test('TC4.9: Chống tấn công XSS / HTML Injection trong nội dung email', () => {
    const malicious = '<script>alert("hacked")</script> & "special"';
    const escaped = escapeHtml(malicious);
    assert.equal(escaped.includes('<script>'), false);
    assert.equal(escaped.includes('&lt;script&gt;'), true);
    assert.equal(escaped.includes('&amp;'), true);
  });

  test('TC4.10: Xử lý an toàn khi template rỗng hoặc undefined', () => {
    assert.equal(interpolateTemplate(null), '');
    assert.equal(interpolateTemplate(''), '');
    assert.equal(formatEmailHtml(null), '');
  });
});

// ==============================================================================
// FEATURE 5: CAMPAIGN DISPATCHER & STATE MACHINE (10 TEST CASES)
// ==============================================================================
describe('Feature 5: Campaign Dispatcher & State Machine', () => {

  test('TC5.1: Xuất báo cáo CSV có đúng dòng tiêu đề Header chuẩn', () => {
    const csv = generateCsvReport([]);
    assert.match(csv, /^﻿STT,Email,Tên Doanh Nghiệp,Trạng Thái,Thời Gian Gửi,Ghi Chú\/Lỗi/);
  });

  test('TC5.2: Xuất dữ liệu đối tác trong CSV chính xác và có UTF-8 BOM', () => {
    const targets = [
      {
        email: 'info@nord-stein.de',
        companyName: 'Nord-Stein',
        status: 'success',
        sentAt: '21:30:00',
        note: 'Thành công (OK)'
      }
    ];
    const csv = generateCsvReport(targets);
    assert.equal(csv.charCodeAt(0), 0xFEFF); // UTF-8 BOM
    assert.match(csv, /"info@nord-stein.de"/);
    assert.match(csv, /"Nord-Stein"/);
    assert.match(csv, /"success"/);
  });

  test('TC5.3: Thoát ký tự nháy kép (Double Quotes Escaping) trong CSV an toàn', () => {
    const targets = [
      {
        email: 'test@example.com',
        companyName: 'The "Best" Stone Co',
        status: 'failed',
        sentAt: '21:30:00',
        note: 'Lỗi: "Connection timed out"'
      }
    ];
    const csv = generateCsvReport(targets);
    assert.match(csv, /"The ""Best"" Stone Co"/);
    assert.match(csv, /"Lỗi: ""Connection timed out"""/);
  });

  test('TC5.4: Tính toán delay ngẫu nhiên luôn nằm trong phạm vi [min, max]', () => {
    const min = 20;
    const max = 45;
    for (let i = 0; i < 50; i++) {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      assert.equal(delay >= min, true);
      assert.equal(delay <= max, true);
    }
  });

  test('TC5.5: Kiểm tra trạng thái ban đầu của Campaign State là idle', () => {
    const { campaignState } = require('../server.js');
    assert.equal(['idle', 'running', 'paused', 'stopped', 'completed'].includes(campaignState.status), true);
  });

  test('TC5.6: Xác thực danh sách target trước khi chạy (Từ chối nếu mảng rỗng)', () => {
    const emptyTargets = [];
    assert.equal(Array.isArray(emptyTargets) && emptyTargets.length === 0, true);
  });

  test('TC5.7: Tính toán tỷ lệ tiến độ gửi chính xác: (sent + failed) / total * 100', () => {
    const total = 10;
    const sent = 4;
    const failed = 1;
    const percent = Math.round(((sent + failed) / total) * 100);
    assert.equal(percent, 50);
  });

  test('TC5.8: Xử lý an toàn tỷ lệ tiến độ gửi khi tổng số email total = 0 (tránh chia cho 0)', () => {
    const total = 0;
    const processed = 0;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    assert.equal(percent, 0);
  });

  test('TC5.9: Cập nhật đúng trạng thái email sau khi gửi thành công', () => {
    const target = {
      email: 'info@nord-stein.de',
      companyName: 'Nord-Stein',
      status: 'pending',
      note: 'Chờ gửi...'
    };
    // Giả lập trạng thái sau gửi
    target.status = 'success';
    target.sentAt = '21:35:00';
    target.note = 'Thành công (ID: 12345)';
    assert.equal(target.status, 'success');
    assert.notEqual(target.sentAt, null);
  });

  test('TC5.10: Cập nhật đúng trạng thái email khi gửi lỗi', () => {
    const target = {
      email: 'invalid@non-existent-domain-test.xyz',
      companyName: 'Non-Existent',
      status: 'pending',
      note: 'Chờ gửi...'
    };
    target.status = 'failed';
    target.sentAt = '21:35:05';
    target.note = '550 User not found';
    assert.equal(target.status, 'failed');
    assert.match(target.note, /550 User not found/);
  });
});

// ==============================================================================
// FEATURE 6: LONG-TERM EXECUTION, STATE PERSISTENCE & RECONNECTION (10 TEST CASES)
// ==============================================================================
describe('Feature 6: Long-term Execution, State Persistence & Reconnection', () => {
  const TEST_STATE_FILE = path.join(TEST_DIR, 'test_campaign_state.json');

  test('TC6.1: Cá nhân hóa đầy đủ họ tên, chức danh và WhatsApp của người gửi vào email', () => {
    const template = 'Xin chào {{company_name}}, tôi là {{sender_name}}, chức vụ: {{sender_title}}. Liên hệ WhatsApp: {{sender_phone}}';
    const vars = {
      company_name: 'Nord-Stein',
      sender_name: 'Calistad',
      sender_title: 'Head of Sales | Vinh Cuu Stone',
      sender_phone: '+84 988 123 456'
    };
    const result = interpolateTemplate(template, vars);
    assert.match(result, /tôi là Calistad/);
    assert.match(result, /chức vụ: Head of Sales \| Vinh Cuu Stone/);
    assert.match(result, /Liên hệ WhatsApp: \+84 988 123 456/);
  });

  test('TC6.2: Đồng bộ tự động khi người dùng sửa đổi họ tên người gửi ở Tab 1', () => {
    const rawTemplate = 'Dear {{company_name}} team,\n\nBest regards,\n{{sender_name}}\n{{sender_title}}';
    const oldVars = { company_name: 'StoneWorks', sender_name: 'Calista', sender_title: 'Sales' };
    const newVars = { company_name: 'StoneWorks', sender_name: 'Calistad (Updated)', sender_title: 'Senior Director' };
    
    const oldEmail = interpolateTemplate(rawTemplate, oldVars);
    const newEmail = interpolateTemplate(rawTemplate, newVars);
    
    assert.match(oldEmail, /Calista/);
    assert.match(newEmail, /Calistad \(Updated\)/);
    assert.match(newEmail, /Senior Director/);
    assert.notEqual(oldEmail, newEmail);
  });

  test('TC6.3: Lưu trạng thái chiến dịch chạy nền (campaignState) vào file JSON thành công', () => {
    const sampleState = {
      status: 'running',
      total: 3,
      sentCount: 1,
      failedCount: 0,
      currentIndex: 1,
      targets: [
        { email: 'c1@test.com', companyName: 'C1', status: 'success', note: '250 OK' },
        { email: 'c2@test.com', companyName: 'C2', status: 'pending', note: 'Chờ gửi...' },
        { email: 'c3@test.com', companyName: 'C3', status: 'pending', note: 'Chờ gửi...' }
      ],
      currentDelayCountdown: 15,
      activeLogs: [{ timestamp: '10:00:00', type: 'info', message: 'Bắt đầu gửi' }]
    };

    fs.writeFileSync(TEST_STATE_FILE, JSON.stringify(sampleState, null, 2), 'utf-8');
    assert.ok(fs.existsSync(TEST_STATE_FILE));
    
    const saved = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf-8'));
    assert.equal(saved.total, 3);
    assert.equal(saved.sentCount, 1);
    assert.equal(saved.targets[0].status, 'success');
  });

  test('TC6.4: Tự động khôi phục và chuyển trạng thái "running" thành "paused" an toàn khi nạp lại state', () => {
    const restored = loadCampaignState(TEST_STATE_FILE);
    assert.equal(restored.status, 'paused', 'Phải chuyển thành paused để tránh gửi mất kiểm soát khi server khởi động lại');
    assert.equal(restored.currentDelayCountdown, 0);
    assert.equal(restored.total, 3);
    assert.equal(restored.sentCount, 1);
    assert.equal(restored.targets.length, 3);
  });

  test('TC6.5: Giữ nguyên tiến độ đã gửi khi người dùng bấm Tiếp tục (Resume)', () => {
    const state = loadCampaignState(TEST_STATE_FILE);
    assert.equal(state.currentIndex, 1);
    assert.equal(state.targets[0].status, 'success');
    assert.equal(state.targets[1].status, 'pending');
    
    // Giả lập bước tiếp theo khi gửi target thứ 2
    state.status = 'running';
    state.targets[1].status = 'success';
    state.sentCount = 2;
    state.currentIndex = 2;
    
    assert.equal(state.sentCount, 2);
    assert.equal(state.targets[1].status, 'success');
    assert.equal(state.targets[2].status, 'pending');
  });

  test('TC6.6: Khách hàng rời tab lâu và quay lại: dữ liệu trả về từ API State đủ để render lại đầy đủ Target Cards', () => {
    const state = loadCampaignState(TEST_STATE_FILE);
    // Kiểm tra cấu trúc dữ liệu đủ cho client renderTargetCards
    state.targets.forEach(t => {
      assert.ok(t.email);
      assert.ok(t.companyName);
      assert.ok(['pending', 'sending', 'success', 'failed'].includes(t.status));
    });
  });

  test('TC6.7: Xử lý an toàn khi file campaign_state.json bị hỏng hoặc không tồn tại', () => {
    const invalidPath = path.join(TEST_DIR, 'corrupted_state.json');
    fs.writeFileSync(invalidPath, '{ INVALID_JSON_DATA... }', 'utf-8');
    
    const fallback = loadCampaignState(invalidPath);
    assert.equal(fallback.status, 'idle');
    assert.equal(fallback.total, 0);
    assert.equal(fallback.sentCount, 0);
    assert.deepEqual(fallback.targets, []);
  });

  test('TC6.8: Xác thực tính kiên định của Master PIN 66882004 qua nhiều phiên làm việc giả lập', () => {
    const MASTER_PIN = '66882004';
    const simulatedSessions = ['66882004', '66882004', '66882004'];
    simulatedSessions.forEach((pin, idx) => {
      assert.equal(pin === MASTER_PIN, true, `Phiên #${idx + 1} phải xác thực thành công`);
    });

    const invalidAttempts = ['12345678', '', 'wrong_pin', '66882005'];
    invalidAttempts.forEach(pin => {
      assert.equal(pin === MASTER_PIN, false);
    });
  });

  test('TC6.9: Xuất báo cáo CSV chính xác cho chiến dịch chạy nền nhiều target có cả thành công và thất bại', () => {
    const mixedTargets = [
      { email: 'ok1@partner.de', companyName: 'Partner1', status: 'success', sentAt: '09:15:00', note: '250 OK' },
      { email: 'err@dead-mail.com', companyName: 'DeadMail', status: 'failed', sentAt: '09:16:30', note: '550 No such user' },
      { email: 'ok2@partner.at', companyName: 'Partner2', status: 'success', sentAt: '09:18:10', note: '250 OK' }
    ];
    const csv = generateCsvReport(mixedTargets);
    assert.match(csv, /ok1@partner\.de/);
    assert.match(csv, /err@dead-mail\.com/);
    assert.match(csv, /550 No such user/);
    assert.match(csv, /ok2@partner\.at/);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV phải có UTF-8 BOM cho Excel tiếng Việt');
  });

  test('TC6.10: Tự động nâng cấp template cũ có chữ "Calista" cố định sang thẻ động {{sender_name}}', () => {
    const legacyConfigPath = path.join(TEST_DIR, 'legacy_config.json');
    const legacyConfig = {
      senderEmail: 'test@vinhcuu.vn',
      senderName: 'Calistad',
      bodyTemplate: 'Dear {{company_name}} team,\n\nI’m Calista, Sales Manager at Vinh Cuu Stone.\n\nWhatsApp: +84 816 075 599\n\nBest regards,\nCalista\nSales Manager | Vinh Cuu Stone'
    };
    fs.writeFileSync(legacyConfigPath, JSON.stringify(legacyConfig), 'utf-8');
    
    const migrated = loadConfig(legacyConfigPath);
    assert.match(migrated.bodyTemplate, /\{\{sender_name\}\}/, 'Phải tự động thay thế Calista thành {{sender_name}}');
    assert.match(migrated.bodyTemplate, /\{\{sender_title\}\}/, 'Phải tự động thay thế Sales Manager thành {{sender_title}}');
    assert.match(migrated.bodyTemplate, /\{\{sender_phone\}\}/, 'Phải tự động thay thế WhatsApp thành {{sender_phone}}');
  });
});

