// ================================================================
// RETRO PINK EMAIL OUTREACH - FRONTEND APP CONTROLLER
// Typography: Google Sans | Icons: Monochrome B&W Only
// Security: Master Access PIN 66882004 & App Password Masking
// ================================================================

let userPin = localStorage.getItem('vinhcuu_app_pin') || sessionStorage.getItem('vinhcuu_app_pin') || '';
let currentTargets = [];
let availableAttachments = [];
let campaignActive = false;
let eventSource = null;

// Secure API Fetch Wrapper
async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    options.headers.set('x-app-pin', userPin);
  } else {
    options.headers['x-app-pin'] = userPin;
  }

  const res = await fetch(url, options);
  if (res.status === 401 && !url.includes('/api/auth/verify-pin')) {
    lockAppUI();
    showToast('Yêu cầu mã PIN bảo mật! Vui lòng nhập mã PIN trên màn hình để mở khóa.', 'error');
  }
  return res;
}

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs & Smooth Horizontal Mouse Wheel Scroll
  const tabNav = document.querySelector('.tab-navigation');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  if (tabNav) {
    tabNav.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();
        tabNav.scrollLeft += (e.deltaY !== 0 ? e.deltaY : e.deltaX);
      }
    }, { passive: false });
  }

  initEventListeners();
  checkPinAuthOnLoad();
});

// Security: Check PIN auth on startup
async function checkPinAuthOnLoad() {
  if (userPin) {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: userPin })
      });
      const data = await res.json();
      if (data.success) {
        unlockAppUI();
        return;
      }
    } catch (e) {
      // In case server is reachable locally and pin matches, proceed gracefully
      if (userPin === '66882004') {
        unlockAppUI();
        return;
      }
    }
  }
  lockAppUI();
}

async function submitPinUnlock() {
  const pinInput = document.getElementById('inputPinCode');
  const errorMsg = document.getElementById('pinErrorMsg');
  const btn = document.getElementById('btnSubmitPin');
  const pin = (pinInput.value || '').trim();

  if (!pin) {
    pinInput.focus();
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Đang xác thực...';
  errorMsg.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const result = await res.json();

    if (result.success) {
      userPin = pin;
      localStorage.setItem('vinhcuu_app_pin', userPin);
      sessionStorage.setItem('vinhcuu_app_pin', userPin);
      unlockAppUI();
      showToast('Xác thực mã PIN bảo mật thành công!', 'success');
    } else {
      errorMsg.innerText = result.message || 'Mã PIN bảo mật không chính xác!';
      errorMsg.style.display = 'block';
      pinInput.value = '';
      pinInput.focus();
    }
  } catch (err) {
    errorMsg.innerText = 'Lỗi kết nối máy chủ khi kiểm tra mã PIN!';
    errorMsg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'MỞ KHÓA BẢNG ĐIỀU KHIỂN (ENTER)';
  }
}

async function unlockAppUI() {
  const overlay = document.getElementById('pinLockOverlay');
  if (overlay) overlay.style.display = 'none';
  // Load app data & sync running campaign state
  await loadConfig();
  await loadAttachments();
  await syncCampaignStateFromServer();
  initSSE();
}

function lockAppUI() {
  userPin = '';
  localStorage.removeItem('vinhcuu_app_pin');
  sessionStorage.removeItem('vinhcuu_app_pin');
  const overlay = document.getElementById('pinLockOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    const pinInput = document.getElementById('inputPinCode');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 50);
    }
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

async function syncCampaignStateFromServer() {
  try {
    const res = await apiFetch('/api/campaign/state');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.state) {
      handleServerEvent({ event: 'init', state: data.state });
    }
  } catch (err) {
    console.warn('Chưa thể đồng bộ trạng thái chiến dịch từ máy chủ:', err);
  }
}

// Toast Helper (Monochrome indicator)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `retro-toast ${type}`;
  toast.innerHTML = `<span style="font-weight:900;">[i]</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ================= 1. CONFIGURATION =================
async function loadConfig() {
  try {
    const res = await apiFetch('/api/config');
    const data = await res.json();
    document.getElementById('senderEmail').value = data.senderEmail || '';
    if (data.hasAppPassword) {
      document.getElementById('appPassword').value = '';
      document.getElementById('appPassword').placeholder = '●●●●●●●●●●●●●●●● (Mật khẩu được lưu bảo mật)';
    } else {
      document.getElementById('appPassword').placeholder = 'ví dụ: abcd efgh ijkl mnop';
    }
    document.getElementById('senderName').value = data.senderName || 'Calista';
    document.getElementById('senderTitle').value = data.senderTitle || 'Sales Manager | Vinh Cuu Stone';
    document.getElementById('senderPhone').value = data.senderPhone || '+84 816 075 599';
    document.getElementById('subjectTemplate').value = data.subjectTemplate || '';
    document.getElementById('bodyTemplate').value = data.bodyTemplate || '';
    document.getElementById('delayMin').value = data.delayMin || 20;
    document.getElementById('delayMax').value = data.delayMax || 45;
  } catch (err) {
    console.error('Lỗi khi tải cấu hình:', err);
  }
}

async function saveConfig() {
  const payload = {
    senderEmail: document.getElementById('senderEmail').value.trim(),
    appPassword: document.getElementById('appPassword').value.trim(),
    senderName: document.getElementById('senderName').value.trim(),
    senderTitle: document.getElementById('senderTitle').value.trim(),
    senderPhone: document.getElementById('senderPhone').value.trim(),
    subjectTemplate: document.getElementById('subjectTemplate').value,
    bodyTemplate: document.getElementById('bodyTemplate').value,
    delayMin: document.getElementById('delayMin').value,
    delayMax: document.getElementById('delayMax').value
  };

  try {
    const res = await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã lưu cấu hình an toàn thành công!', 'success');
      loadConfig(); // Reload to refresh placeholder
    } else {
      showToast(result.message || 'Lỗi khi lưu cấu hình', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi lưu cấu hình', 'error');
  }
}

async function testConnection() {
  const btn = document.getElementById('btnTestConnection');
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Đang kiểm tra...';
  btn.disabled = true;

  const senderEmail = document.getElementById('senderEmail').value.trim();
  const appPassword = document.getElementById('appPassword').value.trim();

  try {
    const res = await apiFetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderEmail, appPassword })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Kết nối Gmail SMTP thành công!', 'success');
      document.getElementById('connectionStatusBadge').innerHTML = 'Đã kết nối Gmail';
      document.getElementById('connectionStatusBadge').className = 'retro-badge green';
    } else {
      showToast(result.message, 'error');
      document.getElementById('connectionStatusBadge').innerHTML = 'Chưa kết nối';
      document.getElementById('connectionStatusBadge').className = 'retro-badge pink';
    }
  } catch (err) {
    showToast('Không thể kết nối đến máy chủ local!', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function sendTestEmail() {
  const targetEmail = document.getElementById('testRecipientEmail').value.trim();
  const includeAttachments = document.getElementById('testIncludeAttachments').checked;
  const resultBox = document.getElementById('testResultBox');
  const resultTitle = document.getElementById('testResultTitle');
  const resultDetails = document.getElementById('testResultDetails');
  const btn = document.getElementById('btnSendTestEmail');

  if (!targetEmail) {
    showToast('Vui lòng nhập địa chỉ email nhận thư thử nghiệm!', 'error');
    document.getElementById('testRecipientEmail').focus();
    return;
  }

  const originalText = btn.innerHTML;
  btn.innerHTML = 'Đang gửi qua Google SMTP...';
  btn.disabled = true;
  resultBox.style.display = 'none';

  try {
    const res = await apiFetch('/api/send-test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmail, includeAttachments })
    });
    const result = await res.json();

    resultBox.style.display = 'block';
    if (result.success) {
      resultBox.style.borderColor = '#00c853';
      resultBox.style.background = '#e8f5e9';
      resultTitle.style.color = '#00701a';
      resultTitle.innerText = 'ĐÃ GỬI THÀNH CÔNG TỚI MÁY CHỦ GOOGLE!';
      resultDetails.innerHTML = `
        <div><strong>Người nhận:</strong> ${escapeHtml(targetEmail)}</div>
        <div><strong>Google SMTP Phản hồi:</strong> <code>${escapeHtml(result.details.smtpResponse || '250 2.0.0 OK')}</code></div>
        <div><strong>Message ID:</strong> <code>${escapeHtml(result.details.messageId || '')}</code></div>
        <div><strong>Số file đính kèm:</strong> ${result.details.attachmentCount} files</div>
        <div style="margin-top: 6px; font-weight:600; color:#2e7d32;">
          Email đã được chuyển phát thành công! Bạn có thể mở ngay mục <u>"Thư đã gửi" (Sent)</u> trong Gmail để xem hoặc kiểm tra hộp thư đến của người nhận.
        </div>
      `;
      showToast(`Gửi thư thử nghiệm tới [${targetEmail}] thành công!`, 'success');
    } else {
      resultBox.style.borderColor = '#d50000';
      resultBox.style.background = '#ffebee';
      resultTitle.style.color = '#c62828';
      resultTitle.innerText = 'GỬI THẤT BẠI TỪ MÁY CHỦ GOOGLE:';
      resultDetails.innerHTML = `<div>${escapeHtml(result.message)}</div>`;
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi đường truyền khi gửi thử nghiệm', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ================= 2. FILE ATTACHMENTS =================
async function loadAttachments() {
  try {
    const res = await apiFetch('/api/attachments');
    const data = await res.json();
    renderAttachments(data);
  } catch (err) {
    console.error('Lỗi khi tải file đính kèm:', err);
  }
}

function renderAttachments(data) {
  availableAttachments = data.files || [];
  const listEl = document.getElementById('attachmentList');
  const fillEl = document.getElementById('meterBarFill');
  const sizeTextEl = document.getElementById('meterSizeText');
  const statusBadgeEl = document.getElementById('meterStatusBadge');

  listEl.innerHTML = '';
  const percent = Math.min(100, (data.totalBytes / (20 * 1024 * 1024)) * 100);
  fillEl.style.width = percent + '%';
  sizeTextEl.innerText = `${data.totalFormatted} / 20.00 MB`;

  if (data.isOverLimit) {
    fillEl.classList.add('danger');
    statusBadgeEl.innerHTML = 'Quá giới hạn 20MB!';
    statusBadgeEl.className = 'retro-badge pink';
  } else {
    fillEl.classList.remove('danger');
    statusBadgeEl.innerHTML = 'Dung lượng an toàn';
    statusBadgeEl.className = 'retro-badge green';
  }

  if (data.files.length === 0) {
    listEl.innerHTML = '<div style="font-size:0.88rem; color:#666; padding:6px 0;">Chưa có file đính kèm nào được tải lên.</div>';
    return;
  }

  data.files.forEach(f => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.innerHTML = `
      <div class="attachment-info">
        <svg class="bw-icon" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
        </svg>
        <div>
          <strong>${escapeHtml(f.originalName)}</strong>
          <span style="color:#666; font-size:0.85rem; margin-left:8px;">(${f.sizeFormatted})</span>
        </div>
      </div>
      <button class="retro-btn danger" style="padding:4px 10px; font-size:0.8rem;" onclick="deleteAttachment('${f.filename}')">Xóa</button>
    `;
    listEl.appendChild(item);
  });
}

async function uploadFiles(files) {
  if (!files || files.length === 0) return;
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  try {
    showToast('Đang tải file lên máy chủ...', 'info');
    const res = await apiFetch('/api/attachments', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã tải file lên thành công!', 'success');
      loadAttachments();
    } else {
      showToast(result.message || 'Lỗi tải file', 'error');
    }
  } catch (err) {
    showToast('Lỗi đường truyền khi tải file', 'error');
  }
}

async function deleteAttachment(filename) {
  if (!confirm('Bạn có chắc chắn muốn xóa file đính kèm này?')) return;
  try {
    const res = await apiFetch(`/api/attachments/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã xóa file đính kèm', 'info');
      loadAttachments();
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi xóa file', 'error');
  }
}

function interpolateClientTemplate(template, vars = {}) {
  if (!template) return '';
  return template
    .replace(/{{company_name}}/g, vars.company_name !== undefined ? vars.company_name : 'Valued Partner')
    .replace(/{{sender_name}}/g, vars.sender_name !== undefined ? vars.sender_name : '')
    .replace(/{{sender_title}}/g, vars.sender_title !== undefined ? vars.sender_title : '')
    .replace(/{{sender_phone}}/g, vars.sender_phone !== undefined ? vars.sender_phone : '');
}

// ================= 3. TARGET EMAILS & PREVIEW =================
async function previewTargets() {
  const rawText = document.getElementById('targetEmailInput').value;
  if (!rawText.trim()) {
    showToast('Vui lòng dán danh sách email vào ô nhập!', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/preview-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText })
    });
    const data = await res.json();

    const subjectTpl = document.getElementById('subjectTemplate').value;
    const bodyTpl = document.getElementById('bodyTemplate').value;
    const senderName = document.getElementById('senderName').value;
    const senderTitle = document.getElementById('senderTitle').value;
    const senderPhone = document.getElementById('senderPhone').value;

    currentTargets = data.targets.map((t, idx) => {
      const company = t.companyName || 'Valued Partner';
      const defaultVars = {
        company_name: company,
        sender_name: senderName,
        sender_title: senderTitle,
        sender_phone: senderPhone
      };
      return {
        id: `target-${idx}-${Date.now()}`,
        email: t.email,
        companyName: company,
        subject: interpolateClientTemplate(subjectTpl, defaultVars),
        body: interpolateClientTemplate(bodyTpl, defaultVars),
        attachmentFilenames: availableAttachments.map(f => f.filename),
        status: 'pending',
        note: 'Đang chờ gửi...',
        isCollapsed: false
      };
    });

    renderTargetTable(currentTargets);
    renderTargetCards(currentTargets);

    document.getElementById('targetCountBadge').innerText = `${data.total} Đối tác hợp lệ`;
    showToast(`Đã bóc tách thành công ${data.total} email mục tiêu!`, 'success');
  } catch (err) {
    showToast('Lỗi khi phân tích danh sách email', 'error');
  }
}

function renderTargetTable(targets) {
  const tbody = document.getElementById('targetTableBody');
  tbody.innerHTML = '';

  if (targets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#777;">Chưa có dữ liệu email mục tiêu</td></tr>';
    return;
  }

  targets.forEach((t, index) => {
    const tr = document.createElement('tr');
    tr.id = `target-row-${index}`;
    tr.innerHTML = `
      <td style="font-weight:bold;">#${index + 1}</td>
      <td><strong>${escapeHtml(t.email)}</strong></td>
      <td>
        <span class="retro-badge yellow" style="padding:2px 8px; font-size:0.82rem;">
          ${escapeHtml(t.companyName)}
        </span>
        <div style="font-size:0.78rem; color:#666; margin-top:2px;">(Dear ${escapeHtml(t.companyName)} team,)</div>
      </td>
      <td>
        <span id="target-status-${index}" class="badge-status badge-pending">Chờ gửi</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= RENDER INTERACTIVE TARGET CARDS =================
function renderTargetCards(targets) {
  const container = document.getElementById('targetCardsContainer');
  if (!container) return;

  if (!targets || targets.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 20px; color: #777; font-size: 0.9rem; border: 2px dashed #ffb3c6; border-radius: 8px; background: #fff;">
        Chưa có danh sách đối tác. Vui lòng sang <strong>Tab 3: Target & Bóc Tách Tên</strong> để dán danh sách email và bấm "Bóc Tách & Xem Trước".
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  targets.forEach((t, idx) => {
    const isDisabled = (t.status !== 'pending');
    const cardEl = document.createElement('div');
    cardEl.id = `target-card-${idx}`;
    cardEl.className = `target-card status-${t.status} ${isDisabled ? 'is-disabled' : ''}`;

    const statusBadgeText = getStatusBadgeText(t.status);
    const chipsHtml = renderTargetAttachmentChips(idx, t.attachmentFilenames, isDisabled);

    cardEl.innerHTML = `
      <div class="target-card-header" onclick="toggleCardCollapse(${idx})">
        <div class="target-card-info">
          <span class="target-card-index">#${idx + 1}</span>
          <span class="target-card-email">${escapeHtml(t.email)}</span>
          <span class="target-card-company">(Dear ${escapeHtml(t.companyName)} team,)</span>
        </div>
        <div class="target-card-actions" onclick="event.stopPropagation()">
          <span id="card-badge-${idx}" class="badge-status badge-${t.status}">${statusBadgeText}</span>
          <button type="button" class="retro-btn secondary" style="padding: 3px 8px; font-size: 0.75rem;" onclick="toggleCardCollapse(${idx})">
            <span id="card-toggle-text-${idx}">${t.isCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
          </button>
        </div>
      </div>

      <div id="card-body-${idx}" class="target-card-body ${t.isCollapsed ? 'collapsed' : ''}">
        <div class="card-field">
          <label>
            <span>Tiêu đề Email (Subject):</span>
            ${isDisabled ? '<span style="color:#d50000; font-size:0.75rem; font-weight:600;">[Đã khóa - Đang gửi hoặc đã gửi xong]</span>' : '<span style="color:#666; font-size:0.75rem;">(Có thể gõ chỉnh sửa riêng)</span>'}
          </label>
          <input type="text" class="card-input" id="card-input-subject-${idx}" value="${escapeHtml(t.subject)}" ${isDisabled ? 'disabled' : ''} oninput="updateTargetSubject(${idx}, this.value)">
        </div>

        <div class="card-field">
          <label>
            <span>Nội dung Thư Chào Hàng (Body):</span>
            ${isDisabled ? '<span style="color:#d50000; font-size:0.75rem; font-weight:600;">[Đã khóa]</span>' : '<span style="color:#666; font-size:0.75rem;">(Có thể gõ thêm lời nhắn riêng cho khách này)</span>'}
          </label>
          <textarea class="card-textarea" id="card-input-body-${idx}" ${isDisabled ? 'disabled' : ''} oninput="updateTargetBody(${idx}, this.value)">${escapeHtml(t.body)}</textarea>
        </div>

        <div class="card-field">
          <label>
            <span>File đính kèm riêng cho đối tác này:</span>
            ${!isDisabled ? '<span style="color:#666; font-size:0.75rem;">(Bấm [✕] để gỡ bớt file riêng cho khách này)</span>' : ''}
          </label>
          <div id="card-attachments-${idx}" class="card-attachments-container">
            ${chipsHtml}
          </div>
        </div>

        <div id="card-note-${idx}" class="card-note-box ${t.status}" style="${t.note && t.status !== 'pending' ? 'display:block;' : 'display:none;'}">
          <strong>Trạng thái:</strong> <span id="card-note-text-${idx}">${escapeHtml(t.note || '')}</span>
        </div>
      </div>
    `;

    container.appendChild(cardEl);
  });
}

function getStatusBadgeText(status) {
  if (status === 'success') return 'Đã gửi thành công';
  if (status === 'failed') return 'Gửi lỗi';
  if (status === 'sending') return 'Đang gửi...';
  return 'Chờ gửi';
}

function renderTargetAttachmentChips(idx, filenames, isDisabled) {
  if (!filenames || filenames.length === 0) {
    return '<span style="font-size:0.8rem; color:#888;">(Không có file đính kèm nào cho đối tác này)</span>';
  }

  const chips = [];
  filenames.forEach(fn => {
    const fileObj = availableAttachments.find(a => a.filename === fn) || { originalName: fn, sizeFormatted: '' };
    chips.push(`
      <span class="card-attachment-chip">
        <svg class="bw-icon" style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
        </svg>
        <span>${escapeHtml(fileObj.originalName)}</span>
        ${fileObj.sizeFormatted ? `<span style="color:#666; font-size:0.72rem;">(${fileObj.sizeFormatted})</span>` : ''}
        ${!isDisabled ? `<button type="button" class="btn-remove-chip" title="Gỡ file này khỏi email gửi cho khách này" onclick="removeAttachmentFromTarget(${idx}, '${escapeHtml(fn)}')">✕</button>` : ''}
      </span>
    `);
  });

  return chips.join('');
}

function updateTargetSubject(idx, value) {
  if (currentTargets[idx] && currentTargets[idx].status === 'pending') {
    currentTargets[idx].subject = value;
    syncTargetUpdateToServer(idx);
  }
}

function updateTargetBody(idx, value) {
  if (currentTargets[idx] && currentTargets[idx].status === 'pending') {
    currentTargets[idx].body = value;
    syncTargetUpdateToServer(idx);
  }
}

function removeAttachmentFromTarget(idx, filename) {
  if (!currentTargets[idx] || currentTargets[idx].status !== 'pending') return;
  currentTargets[idx].attachmentFilenames = currentTargets[idx].attachmentFilenames.filter(f => f !== filename);
  const container = document.getElementById(`card-attachments-${idx}`);
  if (container) {
    container.innerHTML = renderTargetAttachmentChips(idx, currentTargets[idx].attachmentFilenames, false);
  }
  syncTargetUpdateToServer(idx);
  showToast(`Đã gỡ file khỏi email gửi cho [${currentTargets[idx].email}]`, 'info');
}

let syncTimeouts = {};
function syncTargetUpdateToServer(idx) {
  if (!currentTargets[idx]) return;
  if (syncTimeouts[idx]) clearTimeout(syncTimeouts[idx]);
  syncTimeouts[idx] = setTimeout(async () => {
    try {
      await apiFetch(`/api/campaign/target/${idx}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: currentTargets[idx].subject,
          body: currentTargets[idx].body,
          attachmentFilenames: currentTargets[idx].attachmentFilenames
        })
      });
    } catch (e) {
      // Bỏ qua nếu chiến dịch chưa khởi động trên server
    }
  }, 400);
}

function toggleCardCollapse(idx) {
  if (!currentTargets[idx]) return;
  currentTargets[idx].isCollapsed = !currentTargets[idx].isCollapsed;
  const bodyEl = document.getElementById(`card-body-${idx}`);
  const toggleText = document.getElementById(`card-toggle-text-${idx}`);
  if (bodyEl) {
    if (currentTargets[idx].isCollapsed) {
      bodyEl.classList.add('collapsed');
      if (toggleText) toggleText.innerText = 'Mở rộng';
    } else {
      bodyEl.classList.remove('collapsed');
      if (toggleText) toggleText.innerText = 'Thu gọn';
    }
  }
}

function expandAllCards() {
  currentTargets.forEach((t, idx) => {
    t.isCollapsed = false;
    const bodyEl = document.getElementById(`card-body-${idx}`);
    const toggleText = document.getElementById(`card-toggle-text-${idx}`);
    if (bodyEl) bodyEl.classList.remove('collapsed');
    if (toggleText) toggleText.innerText = 'Thu gọn';
  });
}

function collapseAllCards() {
  currentTargets.forEach((t, idx) => {
    t.isCollapsed = true;
    const bodyEl = document.getElementById(`card-body-${idx}`);
    const toggleText = document.getElementById(`card-toggle-text-${idx}`);
    if (bodyEl) bodyEl.classList.add('collapsed');
    if (toggleText) toggleText.innerText = 'Mở rộng';
  });
}

function updateCardStatusDOM(idx, target) {
  const cardEl = document.getElementById(`target-card-${idx}`);
  const badgeEl = document.getElementById(`card-badge-${idx}`);
  const subjectInput = document.getElementById(`card-input-subject-${idx}`);
  const bodyTextarea = document.getElementById(`card-input-body-${idx}`);
  const noteBox = document.getElementById(`card-note-${idx}`);
  const noteText = document.getElementById(`card-note-text-${idx}`);

  if (!cardEl) return;

  const isDisabled = (target.status !== 'pending');
  cardEl.className = `target-card status-${target.status} ${isDisabled ? 'is-disabled' : ''}`;

  if (badgeEl) {
    badgeEl.className = `badge-status badge-${target.status}`;
    badgeEl.innerText = getStatusBadgeText(target.status);
  }

  if (isDisabled) {
    if (subjectInput) subjectInput.disabled = true;
    if (bodyTextarea) bodyTextarea.disabled = true;
    // Hide all remove attachment buttons
    cardEl.querySelectorAll('.btn-remove-chip').forEach(btn => btn.style.display = 'none');
  }

  if (noteBox && noteText) {
    noteText.innerText = target.note || '';
    noteBox.className = `card-note-box ${target.status}`;
    noteBox.style.display = (target.note && target.status !== 'pending') ? 'block' : 'none';
  }
}

function updateLivePreviewSample() {
  if (currentTargets.length === 0) {
    showToast('Vui lòng bóc tách danh sách email trước để xem thử!', 'error');
    return;
  }
  const sample = currentTargets[0];
  const subject = document.getElementById('subjectTemplate').value
    .replace(/{{company_name}}/g, sample.companyName);
  const body = document.getElementById('bodyTemplate').value
    .replace(/{{company_name}}/g, sample.companyName)
    .replace(/{{sender_name}}/g, document.getElementById('senderName').value)
    .replace(/{{sender_title}}/g, document.getElementById('senderTitle').value)
    .replace(/{{sender_phone}}/g, document.getElementById('senderPhone').value);

  document.getElementById('previewSubjectText').innerText = subject;
  document.getElementById('previewBodyText').innerText = body;
  document.getElementById('previewModal').style.display = 'flex';
}

// ================= 4. CAMPAIGN EXECUTION & SSE =================
function initSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  eventSource = new EventSource(`/api/campaign/events?pin=${encodeURIComponent(userPin)}`);

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleServerEvent(payload);
    } catch (e) {
      console.error('Lỗi parse SSE:', e);
    }
  };

  eventSource.onerror = () => {
    console.warn('Mất kết nối SSE stream, tự động kết nối lại...');
  };
}

function handleServerEvent(payload) {
  const { event, state } = payload;
  if (!state) return;

  const total = state.total || 0;
  const sent = state.sentCount || 0;
  const failed = state.failedCount || 0;
  const processed = sent + failed;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  document.getElementById('progressBarFill').style.width = percent + '%';
  document.getElementById('progressText').innerText = `${processed}/${total} Email (${percent}%)`;
  document.getElementById('statSent').innerText = sent;
  document.getElementById('statFailed').innerText = failed;
  document.getElementById('statTotal').innerText = total;

  // Countdown box
  const countdownBox = document.getElementById('countdownBox');
  if (state.currentDelayCountdown > 0) {
    countdownBox.style.display = 'inline-flex';
    document.getElementById('countdownNumber').innerText = `${state.currentDelayCountdown}s`;
  } else {
    countdownBox.style.display = 'none';
  }

  // Update Buttons State
  const btnStart = document.getElementById('btnStartCampaign');
  const btnPause = document.getElementById('btnPauseCampaign');
  const btnResume = document.getElementById('btnResumeCampaign');
  const btnStop = document.getElementById('btnStopCampaign');
  const campaignBadge = document.getElementById('campaignStatusBadge');

  if (state.status === 'running') {
    campaignBadge.innerText = 'ĐANG GỬI...';
    campaignBadge.className = 'retro-badge yellow';
    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-flex';
    btnResume.style.display = 'none';
    btnStop.style.display = 'inline-flex';
  } else if (state.status === 'paused') {
    campaignBadge.innerText = 'ĐÃ TẠM DỪNG';
    campaignBadge.className = 'retro-badge pink';
    btnStart.style.display = 'none';
    btnPause.style.display = 'none';
    btnResume.style.display = 'inline-flex';
    btnStop.style.display = 'inline-flex';
  } else if (state.status === 'completed') {
    campaignBadge.innerText = 'HOÀN THÀNH';
    campaignBadge.className = 'retro-badge green';
    btnStart.style.display = 'inline-flex';
    btnPause.style.display = 'none';
    btnResume.style.display = 'none';
    btnStop.style.display = 'none';
  } else {
    campaignBadge.innerText = state.status === 'stopped' ? 'ĐÃ DỪNG' : 'SẴN SÀNG';
    campaignBadge.className = 'retro-badge';
    btnStart.style.display = 'inline-flex';
    btnPause.style.display = 'none';
    btnResume.style.display = 'none';
    btnStop.style.display = 'none';
  }

  // Restore & sync target table and target cards if client was reloaded or returned after idle
  if (state.targets && state.targets.length > 0) {
    if (currentTargets.length === 0 || currentTargets.length !== state.targets.length) {
      currentTargets = state.targets.map((t, idx) => ({
        id: t.id || `target-${idx}-${Date.now()}`,
        email: t.email,
        companyName: t.companyName,
        subject: t.subject || '',
        body: t.body || '',
        attachmentFilenames: t.attachmentFilenames || [],
        status: t.status || 'pending',
        note: t.note || '',
        sentAt: t.sentAt || null,
        isCollapsed: false
      }));
      renderTargetTable(currentTargets);
      renderTargetCards(currentTargets);
      const targetCountBadge = document.getElementById('targetCountBadge');
      if (targetCountBadge) {
        targetCountBadge.innerText = `${state.targets.length} Đối tác trong chiến dịch`;
      }
    }

    state.targets.forEach((t, idx) => {
      // 1. Update Table Row
      const badge = document.getElementById(`target-status-${idx}`);
      if (badge) {
        if (t.status === 'success') {
          badge.className = 'badge-status badge-success';
          badge.innerText = 'Đã gửi OK';
        } else if (t.status === 'failed') {
          badge.className = 'badge-status badge-failed';
          badge.innerText = 'Lỗi';
        } else if (t.status === 'sending') {
          badge.className = 'badge-status badge-sending';
          badge.innerText = 'Đang gửi...';
        }
      }

      // 2. Update Interactive Card DOM
      if (currentTargets[idx]) {
        currentTargets[idx].status = t.status;
        currentTargets[idx].note = t.note;
        currentTargets[idx].sentAt = t.sentAt;
      }
      updateCardStatusDOM(idx, t);
    });
  }

  // Handle single target update event
  if (event === 'target_update' && payload.data) {
    const { index, target } = payload.data;
    if (index !== undefined && target) {
      if (currentTargets[index]) {
        currentTargets[index].status = target.status;
        currentTargets[index].note = target.note;
        currentTargets[index].sentAt = target.sentAt;
      }
      updateCardStatusDOM(index, target);
    }
  }

  // Logs
  if (event === 'log' && state.latestLog) {
    appendLog(state.latestLog);
  } else if (event === 'init' && state.activeLogs) {
    const term = document.getElementById('terminalLogs');
    term.innerHTML = '';
    state.activeLogs.slice().reverse().forEach(log => appendLog(log));
  }
}

function appendLog(log) {
  const term = document.getElementById('terminalLogs');
  const line = document.createElement('div');
  line.className = `log-line ${log.type || 'info'}`;
  line.innerHTML = `<span class="timestamp">[${log.timestamp || ''}]</span> ${escapeHtml(log.message)}`;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

async function startCampaign() {
  if (currentTargets.length === 0) {
    showToast('Vui lòng dán danh sách email và bấm "Bóc Tách & Xem Trước" trước khi gửi!', 'error');
    document.querySelector('[data-tab="tab-targets"]').click();
    return;
  }

  const delayMin = document.getElementById('delayMin').value;
  const delayMax = document.getElementById('delayMax').value;
  const subjectTemplate = document.getElementById('subjectTemplate').value;
  const bodyTemplate = document.getElementById('bodyTemplate').value;

  try {
    const res = await apiFetch('/api/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: currentTargets,
        delayMin,
        delayMax,
        subjectTemplate,
        bodyTemplate
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Bắt đầu chiến dịch gửi email!', 'success');
      document.querySelector('[data-tab="tab-monitor"]').click();
    } else {
      showToast(result.message || 'Lỗi khi bắt đầu chiến dịch', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi khởi động chiến dịch', 'error');
  }
}

async function pauseCampaign() {
  try {
    const res = await apiFetch('/api/campaign/pause', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi tạm dừng', 'error');
  }
}

async function resumeCampaign() {
  try {
    const res = await apiFetch('/api/campaign/resume', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi tiếp tục', 'error');
  }
}

async function stopCampaign() {
  if (!confirm('Bạn có chắc chắn muốn DỪNG HẲN chiến dịch này? Những email chưa gửi sẽ bị hủy.')) return;
  try {
    const res = await apiFetch('/api/campaign/stop', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi dừng chiến dịch', 'error');
  }
}

async function exportCsvReport() {
  try {
    const res = await apiFetch(`/api/campaign/export-csv?pin=${encodeURIComponent(userPin)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showToast(errData.message || 'Lỗi khi xuất file báo cáo CSV', 'error');
      return;
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `VinhCuu_Stone_Outreach_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
    showToast('Đã xuất và tải xuống báo cáo CSV thành công!', 'success');
  } catch (err) {
    showToast('Không thể tải file CSV. Vui lòng thử lại!', 'error');
  }
}

function insertTagIntoBody(tag) {
  const textarea = document.getElementById('bodyTemplate');
  if (!textarea) return;
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  textarea.focus();
  showToast(`Đã chèn thẻ ${tag} vào mẫu thư`, 'info');
}

function syncSenderInfoToTemplate() {
  const name = document.getElementById('senderName').value.trim() || 'Calista';
  const title = document.getElementById('senderTitle').value.trim() || 'Sales Manager | Vinh Cuu Stone';
  const phone = document.getElementById('senderPhone').value.trim() || '+84 816 075 599';
  const textarea = document.getElementById('bodyTemplate');
  if (!textarea) return;

  let content = textarea.value;
  if (!content.includes('{{sender_name}}') && !content.includes('{{sender_title}}') && !content.includes('{{sender_phone}}')) {
    content = content
      .replace(/I’m\s+([A-Za-z0-9_.\s]+?)(?:,\s*([^.\n]+?))?\.\s*We have our own quarry/i, `I’m {{sender_name}}, {{sender_title}}. We have our own quarry`)
      .replace(/WhatsApp:\s*[^\n]+/i, `WhatsApp: {{sender_phone}}`)
      .replace(/Best regards,[\s\S]*$/i, `Best regards,\n{{sender_name}}\n{{sender_title}}`);
    textarea.value = content;
  }
  showToast(`Đã cập nhật các thẻ {{sender_name}}, {{sender_title}}, {{sender_phone}} vào mẫu thư!`, 'success');
}

window.insertTagIntoBody = insertTagIntoBody;
window.syncSenderInfoToTemplate = syncSenderInfoToTemplate;

// ================= EVENT LISTENERS =================
function initEventListeners() {
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnTestConnection').addEventListener('click', testConnection);
  document.getElementById('btnSendTestEmail').addEventListener('click', sendTestEmail);
  document.getElementById('btnSaveTemplate').addEventListener('click', saveConfig);

  const btnSync = document.getElementById('btnSyncSenderToTemplate');
  if (btnSync) {
    btnSync.addEventListener('click', syncSenderInfoToTemplate);
  }

  const btnLock = document.getElementById('btnLockApp');
  if (btnLock) {
    btnLock.addEventListener('click', lockAppUI);
  }

  const fileInput = document.getElementById('fileUploadInput');
  const dropzone = document.getElementById('uploadDropzone');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => uploadFiles(e.target.files));

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  });

  document.getElementById('btnPreviewTargets').addEventListener('click', previewTargets);
  document.getElementById('btnViewSampleEmail').addEventListener('click', updateLivePreviewSample);

  document.getElementById('btnStartCampaign').addEventListener('click', startCampaign);
  document.getElementById('btnPauseCampaign').addEventListener('click', pauseCampaign);
  document.getElementById('btnResumeCampaign').addEventListener('click', resumeCampaign);
  document.getElementById('btnStopCampaign').addEventListener('click', stopCampaign);
  document.getElementById('btnExportCsv').addEventListener('click', exportCsvReport);

  const btnExpandAll = document.getElementById('btnExpandAllCards');
  if (btnExpandAll) btnExpandAll.addEventListener('click', expandAllCards);
  const btnCollapseAll = document.getElementById('btnCollapseAllCards');
  if (btnCollapseAll) btnCollapseAll.addEventListener('click', collapseAllCards);

  document.getElementById('btnCloseModal').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
