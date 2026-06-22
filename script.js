// KHAI BÁO BIẾN TOÀN CỤC MỤC 1
const { pinyin } = pinyinPro;
const columns = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
let data = JSON.parse(localStorage.getItem('translationData')) || [createEmptyRow()];
let currentRowIndex = -1;
let selectedRowIndices = [];
let isDragSelecting = false;
let dragStartRowIdx = -1;
let lastHistoryTime = 0;

let undoStack = [];
let redoStack = [];
let typingUndoTimeout = null;
let isTyping = false;

// KHAI BÁO BIẾN TOÀN CỤC MỤC 2 (METADATA TRUYỆN)
let metadata = JSON.parse(localStorage.getItem('storyMetadata')) || {
    title: '',
    characters: [{ cn: '', vi: '', called: '', desc: '', pronoun3: '' }],
    pronouns: [{ a: '', b: '', ab: '', ba: '', note: '' }],
    terms: [{ orig: '', changed: '' }]
};

let activeInfoRows = {
    characters: -1,
    pronouns: -1,
    terms: -1
};

// CÁC THEME MÀU SẮC PHỐI HỢP SẴN
const themes = {
    light: { bg: '#f8fafc', text: '#334155', active: '#cbd5e1', hover: 'rgba(0,0,0,0.03)' },
    sepia: { bg: '#f5eedc', text: '#4a3622', active: '#d6c5a3', hover: '#ebdcb9' },
    sage:  { bg: '#e3ede3', text: '#1e301e', active: '#b8ccb8', hover: '#d1dfd1' },
    dreamy:{ bg: '#faf0f5', text: '#522d42', active: '#e8c1db', hover: '#f3d9ea' },
    dark:  { bg: '#1e293b', text: '#cbd5e1', active: '#334155', hover: '#24304a' },
    night: { bg: '#0d1b2a', text: '#e0e1dd', active: '#1b2d42', hover: '#12253b' },
    oled:  { bg: '#000000', text: '#e2e8f0', active: '#2d2d30', hover: '#161618' }
};

// KHỞI CHẠY HỆ THỐNG KHI TRANG SẴN SÀNG
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initTabEvents();
    initEditorEvents();
    initMetadataEvents();
    renderTable();
    renderMetadata();
});

// 1. KHỞI TẠO CẤI ĐẶT GIAO DIỆN CHUNG
function initSettings() {
    let currentFontSize = parseInt(localStorage.getItem('appFontSize')) || 16;
    document.body.style.fontSize = currentFontSize + 'px';

    const fontSelector = document.getElementById('font-family');
    const savedFont = localStorage.getItem('appFontFamily') || "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    document.body.style.fontFamily = savedFont;
    fontSelector.value = savedFont;

    fontSelector.addEventListener('change', (e) => {
        document.body.style.fontFamily = e.target.value;
        localStorage.setItem('appFontFamily', e.target.value);
    });

    document.getElementById('btn-font-up').addEventListener('click', () => {
        if (currentFontSize < 30) {
            currentFontSize += 2;
            document.body.style.fontSize = currentFontSize + 'px';
            localStorage.setItem('appFontSize', currentFontSize);
        }
    });

    document.getElementById('btn-font-down').addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            document.body.style.fontSize = currentFontSize + 'px';
            localStorage.setItem('appFontSize', currentFontSize);
        }
    });

    const themeSelector = document.getElementById('theme-select');
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    applyTheme(savedTheme);

    themeSelector.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });
}

function applyTheme(themeKey) {
    const selected = themes[themeKey] || themes.light;
    document.documentElement.style.setProperty('--bg-color', selected.bg);
    document.documentElement.style.setProperty('--text-color', selected.text);
    document.documentElement.style.setProperty('--row-active', selected.active);
    document.documentElement.style.setProperty('--row-hover', selected.hover);
    document.documentElement.style.setProperty('--selection-bg', selected.active);
    
    if (['dark', 'night', 'oled'].includes(themeKey)) {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
    }
    
    document.getElementById('theme-select').value = themeKey;
    localStorage.setItem('appTheme', themeKey);
}

// 2. LOGIC TAB CHUYỂN MỤC ĐIỀU HÀNH
function initTabEvents() {
    document.getElementById('tab-edit').addEventListener('click', () => switchTab('edit-tool'));
    document.getElementById('tab-story').addEventListener('click', () => switchTab('story-info'));
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section-content').forEach(section => section.classList.remove('active'));
    
    if (tabId === 'edit-tool') {
        document.getElementById('tab-edit').classList.add('active');
        document.getElementById('edit-tool-section').classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'block';
    } else {
        document.getElementById('tab-story').classList.add('active');
        document.getElementById('story-info-section').classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'none';
        renderMetadata();
    }
}

// 3. LOGIC HÀM XỬ LÝ MỤC 1: BIÊN DỊCH VÀ EDIT
function createEmptyRow() {
    return { raw: '', pinyin: '', meaning: '', translation: '', qt: '', edit: '' };
}

let saveTimeout;
function debounceSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        localStorage.setItem('translationData', JSON.stringify(data));
        const now = Date.now();
        if (now - lastHistoryTime > 15000) { 
            addHistoryEntry();
            lastHistoryTime = now;
        }
    }, 500);
}

function showToast(message, bgColor = '#10b981') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.style.backgroundColor = bgColor;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        columns.forEach((col, colIdx) => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerHTML = row[col] || ''; 
            tr.appendChild(td);
        });
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

function appendRowToDOM(rowObj, index) {
    const tbody = document.getElementById('table-body');
    const tr = document.createElement('tr');
    columns.forEach(col => {
        const td = document.createElement('td');
        td.contentEditable = true;
        td.innerHTML = rowObj[col] || ''; 
        tr.appendChild(td);
    });
    tbody.appendChild(tr);
}

// HOÀN TÁC UNDO / REDO
function saveUndoState() {
    const currentStateStr = JSON.stringify(data);
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === currentStateStr) {
        return; 
    }
    undoStack.push(currentStateStr);
    if (undoStack.length > 50) undoStack.shift(); 
    redoStack = []; 
    updateUndoRedoButtons();
}

function handleTypingInput() {
    if (!isTyping) {
        saveUndoState();
        isTyping = true;
    }
    clearTimeout(typingUndoTimeout);
    typingUndoTimeout = setTimeout(() => {
        saveUndoState();
        isTyping = false;
    }, 1000);
}

function undo() {
    if (undoStack.length === 0) return;
    if (isTyping) {
        clearTimeout(typingUndoTimeout);
        saveUndoState();
        isTyping = false;
    }
    const currentStateStr = JSON.stringify(data);
    let prevStateStr = undoStack.pop();
    if (prevStateStr === currentStateStr && undoStack.length > 0) {
        redoStack.push(prevStateStr);
        prevStateStr = undoStack.pop();
    }
    redoStack.push(currentStateStr);
    data = JSON.parse(prevStateStr);
    renderTable();
    debounceSave();
    updateUndoRedoButtons();
    showToast('↩️ Đã hoàn tác (Undo)', 'var(--btn-info)');
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(data));
    const nextState = JSON.parse(redoStack.pop());
    data = nextState;
    renderTable();
    debounceSave();
    updateUndoRedoButtons();
    showToast('🔁 Đã làm lại (Redo)', 'var(--btn-info)');
}

function updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

// QUÉT CHỌN HÀNG LOẠT HÀNG TRÊN TAB 1
function getSelectedRows() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
    const trs = Array.from(document.getElementById('table-body').children);
    const selectedTrs = [];
    trs.forEach(tr => {
        if (selection.containsNode(tr, true)) {
            selectedTrs.push(tr);
        }
    });
    return selectedTrs;
}

// KHỞI TẠO CÁC SỰ KIỆN TAB 1
function initEditorEvents() {
    const tbody = document.getElementById('table-body');

    document.getElementById('table-container').addEventListener('mouseup', () => {
        setTimeout(() => { 
            const selectedRows = getSelectedRows();
            if (selectedRows.length > 1) { 
                tbody.querySelectorAll('.active-row').forEach(tr => tr.classList.remove('active-row'));
                selectedRowIndices = selectedRows.map(tr => Array.from(tbody.children).indexOf(tr));
                selectedRowIndices.forEach(idx => {
                    if (tbody.children[idx]) tbody.children[idx].classList.add('active-row');
                });
            }
        }, 10);
    });

    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;
        
        const clipboardText = (e.originalEvent || e).clipboardData.getData('text/plain');
        if (!clipboardText) return;

        let lines = clipboardText.split(/\r\n|\r|\n|\u2028|\u2029/);
        lines = lines.map(line => line.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').trim()).filter(line => line !== '');

        if (lines.length <= 1 && !clipboardText.includes('\t')) return;

        e.preventDefault(); 
        saveUndoState();
        addHistoryEntry(); 

        const tr = targetCell.closest('tr');
        let startRowIndex = Array.from(tbody.children).indexOf(tr);
        const colIndex = Array.from(tr.children).indexOf(targetCell);

        for (let i = 0; i < lines.length; i++) {
            const textLine = lines[i];
            const rowIndex = startRowIndex + i;
            const cells = textLine.split('\t');

            if (rowIndex >= data.length) {
                const newRow = createEmptyRow();
                data.push(newRow);
                appendRowToDOM(newRow, rowIndex);
            }

            let rawUpdated = false;
            let pinyinUpdated = false;

            for (let j = 0; j < cells.length; j++) {
                const targetColIdx = colIndex + j;
                if (targetColIdx >= 6) break; 
                const cellValue = cells[j];
                data[rowIndex][columns[targetColIdx]] = cellValue;
                tbody.children[rowIndex].children[targetColIdx].innerText = cellValue;
                if (targetColIdx === 0) rawUpdated = true;
                if (targetColIdx === 1 && cellValue.trim() !== '') pinyinUpdated = true;
            }

            if (rawUpdated && !pinyinUpdated) {
                const rawVal = data[rowIndex]['raw'];
                const pinyinText = pinyin(rawVal);
                data[rowIndex]['pinyin'] = pinyinText;
                tbody.children[rowIndex].children[1].innerText = pinyinText;
            }
        }
        debounceSave();
    });

    tbody.addEventListener('input', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;
        const tr = targetCell.closest('tr');
        const rowIndex = Array.from(tbody.children).indexOf(tr);
        const colIndex = Array.from(tr.children).indexOf(targetCell);

        handleTypingInput();
        data[rowIndex][columns[colIndex]] = targetCell.innerHTML;

        if (colIndex === 0) {
            const plainText = targetCell.textContent;
            data[rowIndex]['pinyin'] = pinyin(plainText);
            tr.children[1].innerText = data[rowIndex]['pinyin'];
        }
        debounceSave();
    });

    tbody.addEventListener('focusin', (e) => {
        if (isTyping) {
            clearTimeout(typingUndoTimeout);
            saveUndoState();
            isTyping = false;
        }
        if (isDragSelecting) return; 
        const tr = e.target.closest('tr');
        if (tr) {
            tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
            tr.classList.add('active-row');
            currentRowIndex = Array.from(tbody.children).indexOf(tr);
            selectedRowIndices = [currentRowIndex]; 
        }
    });

    tbody.addEventListener('mousedown', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        if (e.ctrlKey && e.shiftKey) {
            e.preventDefault(); 
            document.body.classList.add('selecting-rows'); 
            isDragSelecting = true;
            dragStartRowIdx = Array.from(tbody.children).indexOf(tr);
            tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
            tr.classList.add('active-row');
            selectedRowIndices = [dragStartRowIdx];
            currentRowIndex = dragStartRowIdx;
        }
    });

    tbody.addEventListener('mouseover', (e) => {
        if (!isDragSelecting) return;
        const tr = e.target.closest('tr');
        if (!tr) return;
        const currentIdx = Array.from(tbody.children).indexOf(tr);
        if (currentIdx === -1) return;

        tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
        const min = Math.min(dragStartRowIdx, currentIdx);
        const max = Math.max(dragStartRowIdx, currentIdx);
        selectedRowIndices = [];
        for (let i = min; i <= max; i++) {
            if (tbody.children[i]) {
                tbody.children[i].classList.add('active-row');
                selectedRowIndices.push(i);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragSelecting) {
            isDragSelecting = false;
            dragStartRowIdx = -1;
            document.body.classList.remove('selecting-rows'); 
        }
    });

    // CÁC NÚT ĐIỀU KHIỂN CHUNG
    document.getElementById('btn-add').addEventListener('click', () => {
        saveUndoState();
        const newRow = createEmptyRow();
        data.push(newRow);
        appendRowToDOM(newRow, data.length - 1);
        debounceSave();
        const container = document.getElementById('table-container');
        container.scrollTop = container.scrollHeight;
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
        if (selectedRowIndices.length > 0) {
            const count = selectedRowIndices.length;
            if (confirm(`Bạn có chắc chắn muốn xóa ${count} hàng được chọn không?`)) {
                saveUndoState();
                addHistoryEntry(); 
                const sortedIndices = [...selectedRowIndices].sort((a, b) => b - a);
                sortedIndices.forEach(idx => {
                    if (tbody.children[idx]) {
                        tbody.children[idx].remove();
                        data.splice(idx, 1);
                    }
                });
                if (data.length === 0) {
                    const newRow = createEmptyRow();
                    data.push(newRow);
                    appendRowToDOM(newRow, 0);
                }
                currentRowIndex = -1;
                selectedRowIndices = [];
                debounceSave();
                showToast(`🗑️ Đã xóa thành công ${count} hàng!`, 'var(--btn-danger)');
            }
        } else {
            alert("Vui lòng chọn hàng cần xóa!");
        }
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm("Xóa TOÀN BỘ dữ liệu?")) {
            saveUndoState();
            addHistoryEntry();
            data = [createEmptyRow()];
            currentRowIndex = -1;
            selectedRowIndices = [];
            renderTable();
            localStorage.setItem('translationData', JSON.stringify(data));
            showToast('🔄 Đã làm mới toàn bộ bảng!', 'var(--btn-warning)');
        }
    });

    document.getElementById('btn-copy').addEventListener('click', () => {
        const hasContent = data.some(row => row.edit && row.edit.trim() !== "");
        if (!hasContent) {
            showToast('⚠️ Cột Bản edit trống!', 'var(--btn-warning)');
            return;
        }
        const tempDiv = document.createElement('div');
        const textToCopy = data.map(row => {
            tempDiv.innerHTML = row.edit || '';
            return tempDiv.innerText.trim();
        }).join('\r\n\r\n'); 
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('✅ Đã sao chép chương edit!', 'var(--btn-success)');
        });
    });

    document.getElementById('btn-export').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "chuong_truyen_" + new Date().getTime() + ".json");
        dlAnchor.click();
    });

    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const importedData = JSON.parse(evt.target.result);
                if (Array.isArray(importedData)) {
                    saveUndoState();
                    addHistoryEntry();
                    data = importedData.map(row => {
                        if (typeof row.qt === 'undefined') row.qt = '';
                        return row;
                    });
                    renderTable();
                    debounceSave();
                    showToast('📂 Mở file thành công!', 'var(--btn-success)');
                }
            } catch (err) { alert("Lỗi đọc file: " + err); }
        };
        reader.readAsText(file);
        fileInput.value = ''; 
    });

    // CÁC ĐỊNH DẠNG WORD RIBBON
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-bold').addEventListener('click', () => execFormat('bold'));
    document.getElementById('btn-italic').addEventListener('click', () => execFormat('italic'));
    document.getElementById('btn-underline').addEventListener('click', () => execFormat('underline'));
    document.getElementById('ribbon-forecolor').addEventListener('input', (e) => execFormat('foreColor', e.target.value));
    document.getElementById('ribbon-hilitecolor').addEventListener('input', (e) => execFormat('hiliteColor', e.target.value));
    document.getElementById('btn-align-left').addEventListener('click', () => execFormat('justifyLeft'));
    document.getElementById('btn-align-center').addEventListener('click', () => execFormat('justifyCenter'));
    document.getElementById('btn-align-right').addEventListener('click', () => execFormat('justifyRight'));
    document.getElementById('btn-clear-format').addEventListener('click', () => execFormat('removeFormat'));

    document.getElementById('ribbon-case').addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        saveUndoState();
        if (val === 'sentence') {
            applySelectionTransform(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        } else if (val === 'lowercase') {
            applySelectionTransform(s => s.toLowerCase());
        } else if (val === 'uppercase') {
            applySelectionTransform(s => s.toUpperCase());
        } else if (val === 'capitalize') {
            applySelectionTransform(s => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '));
        } else if (val === 'toggle') {
            applySelectionTransform(s => s.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''));
        } else if (val === 'half') {
            applySelectionTransform(toHalfWidth);
        } else if (val === 'full') {
            applySelectionTransform(toFullWidth);
        }
        e.target.value = ""; 
    });

    // DI CHUYỂN PHÍM TẮT TOÀN CỤC
    document.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.closest('#story-info-section')) return;
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault(); undo();
            } else if (key === 'y') {
                e.preventDefault(); redo();
            } else if (key === 'b') {
                e.preventDefault(); execFormat('bold');
            } else if (key === 'i') {
                e.preventDefault(); execFormat('italic');
            } else if (key === 'u') {
                e.preventDefault(); execFormat('underline');
            }
        }
    });

    // DIỀU KHIỂN MODAL TÌM KIẾM
    const modalReplace = document.getElementById('modal-replace');
    document.getElementById('btn-replace-show').addEventListener('click', () => {
        modalReplace.classList.add('show');
        document.getElementById('find-text').focus();
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modalReplace.classList.remove('show');
        renderTable(); 
    });
    document.getElementById('btn-highlight-all').addEventListener('click', runHighlightAll);
    document.getElementById('btn-clear-highlight').addEventListener('click', () => {
        renderTable(); 
        showToast(`🧹 Đã xóa nhãn tô sáng!`, 'var(--btn-secondary)');
    });
    document.getElementById('btn-replace-next').addEventListener('click', runReplaceNext);
    document.getElementById('btn-replace-all').addEventListener('click', runReplaceAll);

    // ĐIỀU KHIỂN MODAL LỊCH SỬ
    const modalHistory = document.getElementById('modal-history');
    document.getElementById('btn-history-show').addEventListener('click', () => {
        renderHistoryList();
        modalHistory.classList.add('show');
    });
    document.getElementById('btn-close-history').addEventListener('click', () => modalHistory.classList.remove('show'));

    window.addEventListener('click', (e) => {
        if (e.target === modalReplace) {
            modalReplace.classList.remove('show');
            renderTable();
        }
        if (e.target === modalHistory) modalHistory.classList.remove('show');
    });
}

function execFormat(command, value = null) {
    saveUndoState();
    document.execCommand(command, false, value);
    const activeCell = document.activeElement;
    if (activeCell && activeCell.closest('td')) {
        const event = new Event('input', { bubbles: true });
        activeCell.dispatchEvent(event);
    }
}

function applySelectionTransform(transformFn) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    const transformedText = transformFn(selectedText);
    range.deleteContents();
    range.insertNode(document.createTextNode(transformedText));
    const activeCell = document.activeElement;
    if (activeCell && activeCell.closest('td')) {
        activeCell.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function toHalfWidth(str) {
    return str.replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' '); 
}

function toFullWidth(str) {
    return str.replace(/[\u0021-\u007E]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0)).replace(/ /g, '\u3000');
}

// 4. HỆ THỐNG LỊCH SỬ SỬA ĐỔI LỚN
function addHistoryEntry() {
    let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    const currentDataCopy = JSON.parse(JSON.stringify(data));
    if (history.length > 0) {
        if (JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) return; 
    }
    history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
    if (history.length > 15) history.shift();
    localStorage.setItem('translationHistory', JSON.stringify(history));
}

function renderHistoryList() {
    const historyListDiv = document.getElementById('history-list');
    const history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    if (history.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align:center; color:gray; padding: 20px 0;">Chưa có lịch sử.</p>';
        return;
    }
    historyListDiv.innerHTML = '';
    for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleTimeString('vi-VN') + ' - ' + date.toLocaleDateString('vi-VN');
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const info = document.createElement('div');
        info.innerHTML = `<strong>${timeStr}</strong> <span style="font-size:0.8rem; color:gray;">(${entry.rowCount} hàng)</span>`;
        
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn-add';
        restoreBtn.innerText = 'Khôi phục';
        restoreBtn.style.padding = '4px 8px';
        restoreBtn.onclick = () => {
            if (confirm(`Khôi phục lại phiên bản lúc ${timeStr}?`)) {
                addHistoryEntry();
                data = JSON.parse(JSON.stringify(entry.data));
                renderTable();
                localStorage.setItem('translationData', JSON.stringify(data));
                showToast('🕒 Khôi phục dữ liệu thành công!', 'var(--btn-success)');
                document.getElementById('modal-history').classList.remove('show');
            }
        };
        item.appendChild(info);
        item.appendChild(restoreBtn); 
        historyListDiv.appendChild(item);
    }
}

// 5. TÌM KIẾM VÀ THAY THẾ (CÁC PHƯƠNG THỨC XỬ LÝ CHÍNH)
function buildFindRegex(findText, useRegex, matchCase, wholeWord, ignorePunc, ignoreSpace) {
    if (!findText) return null;
    let pattern = findText;
    if (!useRegex) {
        pattern = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        if (ignorePunc) pattern = pattern.split('').map(c => c + '[\\p{P}]*').join('');
        if (ignoreSpace) pattern = pattern.split('').map(c => c + '[\\s]*').join('');
    }
    if (wholeWord) pattern = `(?<!\\p{L})${pattern}(?!\\p{L})`;
    let flags = 'g';
    if (!matchCase) flags += 'i';
    flags += 'u'; 
    try { return new RegExp(pattern, flags); } catch (e) { alert("Lỗi Regex: " + e.message); return null; }
}

function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original === original.toLowerCase()) return replacement.toLowerCase();
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
}

function findAndReplaceInElement(element, regex, replaceFn) {
    const textNodes = [];
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (walk.nextNode()) textNodes.push(walk.currentNode);
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const oldText = node.nodeValue;
        const newText = oldText.replace(regex, replaceFn);
        if (newText !== oldText) node.nodeValue = newText;
    }
}

function replaceInHTMLString(htmlString, regex, replaceFn) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    findAndReplaceInElement(div, regex, replaceFn);
    return div.innerHTML;
}

function highlightInHTMLString(htmlString, regex) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    const textNodes = [];
    const walk = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (walk.nextNode()) textNodes.push(walk.currentNode);
    
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const text = node.nodeValue;
        if (regex.test(text)) {
            const tempSpan = document.createElement('span');
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            tempSpan.innerHTML = escaped.replace(regex, (match) => {
                return `<span class="search-highlight" style="background-color: #fde047; color: #000000; font-weight: bold; border-radius:2px;">${match}</span>`;
            });
            const parent = node.parentNode;
            while (tempSpan.firstChild) {
                parent.insertBefore(tempSpan.firstChild, node);
            }
            parent.removeChild(node);
        }
    }
    return div.innerHTML;
}

function runHighlightAll() {
    const findText = document.getElementById('find-text').value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex').checked,
        document.getElementById('opt-match-case').checked,
        document.getElementById('opt-whole-word').checked,
        document.getElementById('opt-ignore-punc').checked,
        document.getElementById('opt-ignore-space').checked
    );
    if (!regex) return;
    renderTable(); 
    
    const targetIndices = document.getElementById('opt-search-selection').checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
        
    let highlightedCount = 0;
    const colTarget = document.getElementById('replace-column').value;
    
    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? columns : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const highlightedHTML = highlightInHTMLString(originalHTML, regex);
            if (highlightedHTML !== originalHTML) {
                const cellElement = document.getElementById('table-body').children[rowIndex]?.children[columns.indexOf(col)];
                if (cellElement) {
                    cellElement.innerHTML = highlightedHTML;
                    highlightedCount++;
                }
            }
        });
    });
    if (highlightedCount > 0) {
        showToast(`🖌️ Đã tô sáng các kết quả tìm thấy!`, 'var(--btn-info)');
    } else {
        showToast(`❌ Không tìm thấy kết quả phù hợp!`, 'var(--btn-danger)');
    }
}

function runReplaceNext() {
    const findText = document.getElementById('find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex').checked,
        document.getElementById('opt-match-case').checked,
        document.getElementById('opt-whole-word').checked,
        document.getElementById('opt-ignore-punc').checked,
        document.getElementById('opt-ignore-space').checked
    );
    if (!regex) return;
    
    const targetIndices = document.getElementById('opt-search-selection').checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
        
    let replaced = false;
    const casePreserve = document.getElementById('opt-case-preserve').checked;
    const replaceFn = (match) => {
        replaced = true;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };
    
    const colTarget = document.getElementById('replace-column').value;
    
    for (let rowIndex of targetIndices) {
        const cols = colTarget === 'all' ? columns : [colTarget];
        for (let col of cols) {
            const originalHTML = data[rowIndex][col] || '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalHTML;
            if (regex.test(tempDiv.textContent)) {
                let limit = 1;
                const limitedReplaceFn = (match) => {
                    if (limit > 0) { limit--; return replaceFn(match); }
                    return match;
                };
                const newHTML = replaceInHTMLString(originalHTML, regex, limitedReplaceFn);
                if (replaced) {
                    saveUndoState();
                    addHistoryEntry();
                    data[rowIndex][col] = newHTML;
                    const cellElement = document.getElementById('table-body').children[rowIndex]?.children[columns.indexOf(col)];
                    if (cellElement) cellElement.innerHTML = newHTML;
                    debounceSave();
                    showToast(`✔️ Đã thay thế thành công 1 vị trí!`, 'var(--btn-success)');
                    return; 
                }
            }
        }
    }
    showToast(`❌ Không tìm thấy kết quả nào khác!`, 'var(--btn-danger)');
}

function runReplaceAll() {
    const findText = document.getElementById('find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex').checked,
        document.getElementById('opt-match-case').checked,
        document.getElementById('opt-whole-word').checked,
        document.getElementById('opt-ignore-punc').checked,
        document.getElementById('opt-ignore-space').checked
    );
    if (!regex) return;
    
    saveUndoState();
    addHistoryEntry();
    
    let replacedCount = 0;
    const casePreserve = document.getElementById('opt-case-preserve').checked;
    const replaceFn = (match) => {
        replacedCount++;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };
    
    const targetIndices = document.getElementById('opt-search-selection').checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
    const colTarget = document.getElementById('replace-column').value;
    
    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? columns : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const newHTML = replaceInHTMLString(originalHTML, regex, replaceFn);
            if (newHTML !== originalHTML) {
                data[rowIndex][col] = newHTML;
            }
        });
    });
    
    if (replacedCount > 0) {
        renderTable();
        debounceSave();
        showToast(`✔️ Đã thay thế toàn bộ ${replacedCount} vị trí!`, 'var(--btn-success)');
    } else {
        showToast(`❌ Không tìm thấy kết quả nào để thay thế!`, 'var(--btn-danger)');
    }
    document.getElementById('modal-replace').classList.remove('show');
}


// =========================================================================
// 6. LOGIC XỬ LÝ MỤC 2: QUẢN LÝ THÔNG TIN TRUYỆN PHONG CÁCH EXCEL
// =========================================================================

function saveMetadata() {
    localStorage.setItem('storyMetadata', JSON.stringify(metadata));
}

function renderMetadata() {
    document.getElementById('story-title-input').value = metadata.title || '';
    renderCharacters();
    renderPronouns();
    renderTerms();
}

function selectInfoRow(tr, section) {
    tr.parentNode.querySelectorAll('tr').forEach(r => r.classList.remove('active-info-row'));
    tr.classList.add('active-info-row');
    activeInfoRows[section] = parseInt(tr.dataset.index);
}

// KHỞI TẠO SỰ KIỆN TAB 2
function initMetadataEvents() {
    document.getElementById('story-title-input').addEventListener('input', (e) => {
        metadata.title = e.target.value;
        saveMetadata();
    });

    document.getElementById('btn-add-char').addEventListener('click', addCharacterRow);
    document.getElementById('btn-delete-char').addEventListener('click', deleteCharacterRow);
    
    document.getElementById('btn-add-pro').addEventListener('click', addPronounRow);
    document.getElementById('btn-delete-pro').addEventListener('click', deletePronounRow);
    
    document.getElementById('btn-add-term').addEventListener('click', addTermRow);
    document.getElementById('btn-delete-term').addEventListener('click', deleteTermRow);

    document.getElementById('btn-export-meta').addEventListener('click', exportMetadata);
    
    const metaFileIn = document.getElementById('metadata-file-input');
    document.getElementById('btn-import-meta').addEventListener('click', () => metaFileIn.click());
    metaFileIn.addEventListener('change', handleMetadataImport);
}

// BẢNG 1: NHÂN VẬT
function renderCharacters() {
    const tbodyChar = document.getElementById('body-characters');
    tbodyChar.innerHTML = '';
    metadata.characters.forEach((char, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['cn', 'vi', 'called', 'desc', 'pronoun3'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerText = char[field] || '';
            td.addEventListener('input', (e) => {
                metadata.characters[index][field] = e.target.innerText;
                saveMetadata();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'characters'));
            tr.appendChild(td);
        });
        tbodyChar.appendChild(tr);
    });
}

function addCharacterRow() {
    metadata.characters.push({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
    saveMetadata();
    renderCharacters();
}

function deleteCharacterRow() {
    const idx = activeInfoRows.characters;
    if (idx >= 0 && idx < metadata.characters.length) {
        metadata.characters.splice(idx, 1);
        if (metadata.characters.length === 0) {
            metadata.characters.push({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
        }
        activeInfoRows.characters = -1;
        saveMetadata();
        renderCharacters();
    } else {
        alert('Vui lòng chọn một dòng trong bảng Nhân vật để xóa!');
    }
}

// BẢNG 2: XƯNG HÔ
function renderPronouns() {
    const tbodyPro = document.getElementById('body-pronouns');
    tbodyPro.innerHTML = '';
    metadata.pronouns.forEach((pro, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['a', 'b', 'ab', 'ba', 'note'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerText = pro[field] || '';
            td.addEventListener('input', (e) => {
                metadata.pronouns[index][field] = e.target.innerText;
                saveMetadata();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'pronouns'));
            tr.appendChild(td);
        });
        tbodyPro.appendChild(tr);
    });
}

function addPronounRow() {
    metadata.pronouns.push({ a: '', b: '', ab: '', ba: '', note: '' });
    saveMetadata();
    renderPronouns();
}

function deletePronounRow() {
    const idx = activeInfoRows.pronouns;
    if (idx >= 0 && idx < metadata.pronouns.length) {
        metadata.pronouns.splice(idx, 1);
        if (metadata.pronouns.length === 0) {
            metadata.pronouns.push({ a: '', b: '', ab: '', ba: '', note: '' });
        }
        activeInfoRows.pronouns = -1;
        saveMetadata();
        renderPronouns();
    } else {
        alert('Vui lòng chọn một dòng trong bảng Xưng hô để xóa!');
    }
}

// BẢNG 3: TỪ NGỮ THỐNG NHẤT
function renderTerms() {
    const tbodyTerm = document.getElementById('body-terms');
    tbodyTerm.innerHTML = '';
    metadata.terms.forEach((term, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['orig', 'changed'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerText = term[field] || '';
            td.addEventListener('input', (e) => {
                metadata.terms[index][field] = e.target.innerText;
                saveMetadata();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'terms'));
            tr.appendChild(td);
        });
        tbodyTerm.appendChild(tr);
    });
}

function addTermRow() {
    metadata.terms.push({ orig: '', changed: '' });
    saveMetadata();
    renderTerms();
}

function deleteTermRow() {
    const idx = activeInfoRows.terms;
    if (idx >= 0 && idx < metadata.terms.length) {
        metadata.terms.splice(idx, 1);
        if (metadata.terms.length === 0) {
            metadata.terms.push({ orig: '', changed: '' });
        }
        activeInfoRows.terms = -1;
        saveMetadata();
        renderTerms();
    } else {
        alert('Vui lòng chọn một dòng trong bảng Thống nhất từ ngữ để xóa!');
    }
}

// XUẤT NHẬP FILE METADATA (.JSON)
function exportMetadata() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "thong_tin_truyen_" + (metadata.title ? metadata.title.replace(/\s+/g, '_') : "export") + ".json");
    dlAnchor.click();
    showToast('💾 Đã xuất file thông tin truyện!', 'var(--btn-success)');
}

function handleMetadataImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported && (imported.characters || imported.pronouns || imported.terms)) {
                metadata = {
                    title: imported.title || '',
                    characters: imported.characters || [],
                    pronouns: imported.pronouns || [],
                    terms: imported.terms || []
                };
                saveMetadata();
                renderMetadata();
                showToast('📂 Nhập thông tin truyện thành công!', 'var(--btn-success)');
            } else {
                alert("Định dạng file không khớp cấu trúc lưu trữ!");
            }
        } catch (err) { alert("Lỗi đọc cấu hình: " + err); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}
