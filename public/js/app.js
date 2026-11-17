// ================================================================
// RETRO PINK EMAIL OUTREACH - FRONTEND APP CONTROLLER
// Typography: Google Sans | Icons: Monochrome B&W Only
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
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
    });
  });

  // Init App
  loadConfig();
  loadAttachments();
  initSSE();
  initEventListeners();
});

// Global state
let currentTargets = [];
let campaignActive = false;

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
    const res = await fetch('/api/config');
    const data = await res.json();
    document.getElementById('senderEmail').value = data.senderEmail || '';
    if (data.hasAppPassword) {
      document.getElementById('appPassword').placeholder = '●●●●●●●●●●●●●●●● (Đã lưu mật khẩu)';
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
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã lưu cấu hình thành công!', 'success');
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
    const res = await fetch('/api/test-connection', {
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
    const res = await fetch('/api/send-test-email', {
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
    const res = await fetch('/api/attachments');
    const data = await res.json();
    renderAttachments(data);
  } catch (err) {
    console.error('Lỗi khi tải file đính kèm:', err);
  }
}

function renderAttachments(data) {
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
    const res = await fetch('/api/attachments', {
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
    const res = await fetch(`/api/attachments/${encodeURIComponent(filename)}`, {
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

// ================= 3. TARGET EMAILS & PREVIEW =================
async function previewTargets() {
  const rawText = document.getElementById('targetEmailInput').value;
  if (!rawText.trim()) {
    showToast('Vui lòng dán danh sách email vào ô nhập!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/preview-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText })
    });
    const data = await res.json();
    currentTargets = data.targets;
    renderTargetTable(currentTargets);
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
  const eventSource = new EventSource('/api/campaign/events');

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

  // Update target table statuses
  if (state.targets && state.targets.length > 0) {
    state.targets.forEach((t, idx) => {
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
    });
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
    const res = await fetch('/api/campaign/start', {
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
    const res = await fetch('/api/campaign/pause', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi tạm dừng', 'error');
  }
}

async function resumeCampaign() {
  try {
    const res = await fetch('/api/campaign/resume', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi tiếp tục', 'error');
  }
}

async function stopCampaign() {
  if (!confirm('Bạn có chắc chắn muốn DỪNG HẲN chiến dịch này? Những email chưa gửi sẽ bị hủy.')) return;
  try {
    const res = await fetch('/api/campaign/stop', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, result.success ? 'info' : 'error');
  } catch (err) {
    showToast('Lỗi khi dừng chiến dịch', 'error');
  }
}

function exportCsvReport() {
  window.location.href = '/api/campaign/export-csv';
}

// ================= EVENT LISTENERS =================
function initEventListeners() {
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnTestConnection').addEventListener('click', testConnection);
  document.getElementById('btnSendTestEmail').addEventListener('click', sendTestEmail);
  document.getElementById('btnSaveTemplate').addEventListener('click', saveConfig);

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

  document.getElementById('btnCloseModal').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
