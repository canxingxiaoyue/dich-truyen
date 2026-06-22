// =========================================================================
// KHAI BÁO BIẾN TOÀN CỤC VÀ TRẠNG THÁI HOẠT ĐỘNG
// =========================================================================
const { pinyin } = pinyinPro;
const columns = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
let activeTab = 'edit-tool'; 

// Đưa các biến điều khiển Modal lên phạm vi toàn cục để tránh lỗi ReferenceError
let modalReplace;
let modalHistory;

// Dữ liệu và trạng thái Mục 1 (Biên dịch)
let data = JSON.parse(localStorage.getItem('translationData')) || [createEmptyRow()];
let currentRowIndex = -1;
let selectedRowIndices = [];
let isDragSelecting = false;
let dragStartRowIdx = -1;
let lastHistoryTime = 0;

let editorUndoStack = [];
let editorRedoStack = [];
let editorTypingUndoTimeout = null;
let editorIsTyping = false;

// Dữ liệu và trạng thái Mục 2 (Thông tin truyện)
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

let metaUndoStack = [];
let metaRedoStack = [];
let metaTypingUndoTimeout = null;
let metaIsTyping = false;
let lastMetaHistoryTime = 0;

// Bộ màu sắc phối sẵn
const themes = {
    light: { bg: '#f8fafc', text: '#334155', active: '#cbd5e1', hover: 'rgba(0,0,0,0.03)' },
    sepia: { bg: '#f5eedc', text: '#4a3622', active: '#d6c5a3', hover: '#ebdcb9' },
    sage:  { bg: '#e3ede3', text: '#1e301e', active: '#b8ccb8', hover: '#d1dfd1' },
    dreamy:{ bg: '#faf0f5', text: '#522d42', active: '#e8c1db', hover: '#f3d9ea' },
    dark:  { bg: '#1e293b', text: '#cbd5e1', active: '#334155', hover: '#24304a' },
    night: { bg: '#0d1b2a', text: '#e0e1dd', active: '#1b2d42', hover: '#12253b' },
    oled:  { bg: '#000000', text: '#e2e8f0', active: '#2d2d30', hover: '#161618' }
};

// KHỞI CHẠY KHU VỰC ĐIỀU HÀNH KHI TẢI TRANG XONG
document.addEventListener('DOMContentLoaded', () => {
    // Gán chính xác các phần tử HTML vào biến toàn cục ngay khi trang tải xong
    modalReplace = document.getElementById('modal-replace');
    modalHistory = document.getElementById('modal-history');

    initSettings();
    initTabEvents();
    initEditorEvents();
    initMetadataEvents();
    renderTable();
    renderMetadata();
    updateUndoRedoButtonsState();
});

// THIẾT LẬP CÁC TÙY CHỌN GIAO DIỆN CHUNG (FONT, THEME)
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

    themeSelector.addEventListener('change', (e) => applyTheme(e.target.value));
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

// LOGIC KHỞI TẠO TAB
function initTabEvents() {
    document.getElementById('tab-edit').addEventListener('click', () => switchTab('edit-tool'));
    document.getElementById('tab-story').addEventListener('click', () => switchTab('story-info'));
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section-content').forEach(section => section.classList.remove('active'));
    
    if (tabId === 'edit-tool') {
        activeTab = 'edit-tool';
        document.getElementById('tab-edit').classList.add('active');
        document.getElementById('edit-tool-section').classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'block';
    } else {
        activeTab = 'story-info';
        document.getElementById('tab-story').classList.add('active');
        document.getElementById('story-info-section').classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'none';
        renderMetadata();
    }
    updateUndoRedoButtonsState();
}

function showToast(message, bgColor = '#10b981') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.style.backgroundColor = bgColor;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// KHỞI CHẠY TÌNH TRẠNG PHÍM ĐIỀU HƯỚNG UNDO / REDO TRÊN GIAO DIỆN
function updateUndoRedoButtonsState() {
    const editorUndoBtn = document.getElementById('btn-undo');
    const editorRedoBtn = document.getElementById('btn-redo');
    if (editorUndoBtn && editorRedoBtn) {
        editorUndoBtn.disabled = editorUndoStack.length === 0;
        editorRedoBtn.disabled = editorRedoStack.length === 0;
    }

    const metaUndoBtn = document.getElementById('btn-meta-undo');
    const metaRedoBtn = document.getElementById('btn-meta-redo');
    if (metaUndoBtn && metaRedoBtn) {
        metaUndoBtn.disabled = metaUndoStack.length === 0;
        metaRedoBtn.disabled = metaRedoStack.length === 0;
    }
}


// =========================================================================
// PHẦN LOGIC MỤC 1 (BIÊN DỊCH & EDIT TRUYỆN)
// =========================================================================
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
            addEditorHistoryEntry();
            lastHistoryTime = now;
        }
    }, 500);
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
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

// BỘ HOÀN TÁC CỦA MỤC 1 (BIÊN DỊCH)
function saveEditorUndoState() {
    const currentStateStr = JSON.stringify(data);
    if (editorUndoStack.length > 0 && editorUndoStack[editorUndoStack.length - 1] === currentStateStr) {
        return; 
    }
    editorUndoStack.push(currentStateStr);
    if (editorUndoStack.length > 50) editorUndoStack.shift(); 
    editorRedoStack = []; 
    updateUndoRedoButtonsState();
}

function handleEditorTypingInput() {
    if (!editorIsTyping) {
        saveEditorUndoState();
        editorIsTyping = true;
    }
    clearTimeout(editorTypingUndoTimeout);
    editorTypingUndoTimeout = setTimeout(() => {
        saveEditorUndoState();
        editorIsTyping = false;
    }, 1000);
}

function editorUndo() {
    if (editorUndoStack.length === 0) return;
    if (editorIsTyping) {
        clearTimeout(editorTypingUndoTimeout);
        saveEditorUndoState();
        editorIsTyping = false;
    }
    const currentStateStr = JSON.stringify(data);
    let prevStateStr = editorUndoStack.pop();
    if (prevStateStr === currentStateStr && editorUndoStack.length > 0) {
        editorRedoStack.push(prevStateStr);
        prevStateStr = editorUndoStack.pop();
    }
    editorRedoStack.push(currentStateStr);
    data = JSON.parse(prevStateStr);
    renderTable();
    debounceSave();
    updateUndoRedoButtonsState();
    showToast('↩️ Đã hoàn tác dịch thuật', 'var(--btn-info)');
}

function editorRedo() {
    if (editorRedoStack.length === 0) return;
    editorUndoStack.push(JSON.stringify(data));
    const nextState = JSON.parse(editorRedoStack.pop());
    data = nextState;
    renderTable();
    debounceSave();
    updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại dịch thuật', 'var(--btn-info)');
}

// BỘ LỊCH SỬ CỦA MỤC 1 (DỊCH THUẬT)
function addEditorHistoryEntry() {
    let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    const currentDataCopy = JSON.parse(JSON.stringify(data));
    if (history.length > 0) {
        if (JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) return; 
    }
    history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
    if (history.length > 15) history.shift();
    localStorage.setItem('translationHistory', JSON.stringify(history));
}

// KHỞI TẠO CÁC SỰ KIỆN MỤC 1
function initEditorEvents() {
    const tbody = document.getElementById('table-body');

    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;
        
        const clipboardText = (e.originalEvent || e).clipboardData.getData('text/plain');
        if (!clipboardText) return;

        let lines = clipboardText.split(/\r\n|\r|\n|\u2028|\u2029/);
        lines = lines.map(line => line.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').trim()).filter(line => line !== '');

        if (lines.length <= 1 && !clipboardText.includes('\t')) return;

        e.preventDefault(); 
        saveEditorUndoState();
        addEditorHistoryEntry(); 

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

        handleEditorTypingInput();
        data[rowIndex][columns[colIndex]] = targetCell.innerHTML;

        if (colIndex === 0) {
            const plainText = targetCell.textContent;
            data[rowIndex]['pinyin'] = pinyin(plainText);
            tr.children[1].innerText = data[rowIndex]['pinyin'];
        }
        debounceSave();
    });

    tbody.addEventListener('focusin', (e) => {
        if (editorIsTyping) {
            clearTimeout(editorTypingUndoTimeout);
            saveEditorUndoState();
            editorIsTyping = false;
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

    document.getElementById('btn-add').addEventListener('click', () => {
        saveEditorUndoState();
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
                saveEditorUndoState();
                addEditorHistoryEntry(); 
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
            saveEditorUndoState();
            addEditorHistoryEntry();
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
                    saveEditorUndoState();
                    addEditorHistoryEntry();
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

    // LỊCH SỬ DỊCH
    document.getElementById('btn-history-show').addEventListener('click', () => {
        renderHistoryList('editor');
        modalHistory.classList.add('show');
    });

    // HOÀN TÁC TOÀN CỤC CHUNG QUA PHÍM BẤM ĐỊNH DẠNG
    document.getElementById('btn-undo').addEventListener('click', editorUndo);
    document.getElementById('btn-redo').addEventListener('click', editorRedo);
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
        saveEditorUndoState();
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

    // BẮT PHÍM TẮT TOÀN CỤC (Ctrl+Z / Ctrl+Y) TỰ ĐỘNG PHÂN BIỆT TAB HOẠT ĐỘNG
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorUndo();
                } else {
                    metaUndo();
                }
            } else if (key === 'y') {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorRedo();
                } else {
                    metaRedo();
                }
            } else if (key === 'b' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('bold');
            } else if (key === 'i' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('italic');
            } else if (key === 'u' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('underline');
            }
        }
    });

    // ĐIỀU KHIỂN ĐÓNG MODAL TÌM KIẾM
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modalReplace.classList.remove('show');
        renderTable(); 
    });

    // ĐIỀU KHIỂN ĐÓNG MODAL LỊCH SỬ
    document.getElementById('btn-close-history').addEventListener('click', () => {
        modalHistory.classList.remove('show');
    });

    // DIỀU KHIỂN CÁC NÚT TÌM KIẾM
    document.getElementById('btn-replace-show').addEventListener('click', () => {
        modalReplace.classList.add('show');
        document.getElementById('find-text').focus();
    });
    document.getElementById('btn-highlight-all').addEventListener('click', runHighlightAll);
    document.getElementById('btn-clear-highlight').addEventListener('click', () => {
        renderTable(); 
        showToast(`🧹 Đã xóa nhãn tô sáng!`, 'var(--btn-secondary)');
    });
    document.getElementById('btn-replace-next').addEventListener('click', runReplaceNext);
    document.getElementById('btn-replace-all').addEventListener('click', runReplaceAll);
}

function execFormat(command, value = null) {
    saveEditorUndoState();
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


// =========================================================================
// PHẦN LOGIC MỤC 2 (LƯU THÔNG TIN TRUYỆN PHONG CÁCH EXCEL)
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

// BỘ HOÀN TÁC CỦA MỤC 2 (THÔNG TIN TRUYỆN)
function saveMetaUndoState() {
    const currentStateStr = JSON.stringify(metadata);
    if (metaUndoStack.length > 0 && metaUndoStack[metaUndoStack.length - 1] === currentStateStr) {
        return;
    }
    metaUndoStack.push(currentStateStr);
    if (metaUndoStack.length > 50) metaUndoStack.shift();
    metaRedoStack = [];
    updateUndoRedoButtonsState();
}

function handleMetaTypingInput() {
    if (!metaIsTyping) {
        saveMetaUndoState();
        metaIsTyping = true;
    }
    clearTimeout(metaTypingUndoTimeout);
    metaTypingUndoTimeout = setTimeout(() => {
        saveMetaUndoState();
        metaIsTyping = false;
    }, 1000);
}

function metaUndo() {
    if (metaUndoStack.length === 0) return;
    if (metaIsTyping) {
        clearTimeout(metaTypingUndoTimeout);
        saveMetaUndoState();
        metaIsTyping = false;
    }
    const currentStateStr = JSON.stringify(metadata);
    let prevStateStr = metaUndoStack.pop();
    if (prevStateStr === currentStateStr && metaUndoStack.length > 0) {
        metaRedoStack.push(prevStateStr);
        prevStateStr = metaUndoStack.pop();
    }
    metaRedoStack.push(currentStateStr);
    metadata = JSON.parse(prevStateStr);
    renderMetadata();
    saveMetadata();
    updateUndoRedoButtonsState();
    showToast('↩️ Đã hoàn tác thông tin (Undo)', 'var(--btn-info)');
}

function metaRedo() {
    if (metaRedoStack.length === 0) return;
    metaUndoStack.push(JSON.stringify(metadata));
    const nextState = JSON.parse(metaRedoStack.pop());
    metadata = nextState;
    renderMetadata();
    saveMetadata();
    updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại thông tin (Redo)', 'var(--btn-info)');
}

// BỘ LỊCH SỬ CỦA MỤC 2 (THÔNG TIN TRUYỆN)
function addMetaHistoryEntry() {
    let history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
    const currentMetaCopy = JSON.parse(JSON.stringify(metadata));
    if (history.length > 0) {
        if (JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentMetaCopy)) return;
    }
    history.push({ 
        timestamp: Date.now(), 
        rowCount: metadata.characters.length + metadata.pronouns.length + metadata.terms.length, 
        data: currentMetaCopy 
    });
    if (history.length > 15) history.shift();
    localStorage.setItem('metadataHistory', JSON.stringify(history));
}

let metaSaveTimeout;
function debounceMetaSave() {
    clearTimeout(metaSaveTimeout);
    metaSaveTimeout = setTimeout(() => {
        saveMetadata();
        const now = Date.now();
        if (now - lastMetaHistoryTime > 15000) {
            addMetaHistoryEntry();
            lastMetaHistoryTime = now;
        }
    }, 500);
}

function selectInfoRow(tr, section) {
    tr.parentNode.querySelectorAll('tr').forEach(r => r.classList.remove('active-info-row'));
    tr.classList.add('active-info-row');
    activeInfoRows[section] = parseInt(tr.dataset.index);
}

// KHỞI TẠO SỰ KIỆN TAB 2
function initMetadataEvents() {
    document.getElementById('story-title-input').addEventListener('input', (e) => {
        handleMetaTypingInput();
        metadata.title = e.target.value;
        debounceMetaSave();
    });

    document.getElementById('btn-add-char').addEventListener('click', () => {
        saveMetaUndoState();
        addCharacterRow();
    });
    document.getElementById('btn-delete-char').addEventListener('click', deleteCharacterRow);
    
    document.getElementById('btn-add-pro').addEventListener('click', () => {
        saveMetaUndoState();
        addPronounRow();
    });
    document.getElementById('btn-delete-pro').addEventListener('click', deletePronounRow);
    
    document.getElementById('btn-add-term').addEventListener('click', () => {
        saveMetaUndoState();
        addTermRow();
    });
    document.getElementById('btn-delete-term').addEventListener('click', deleteTermRow);

    document.getElementById('btn-export-meta').addEventListener('click', exportMetadata);
    
    const metaFileIn = document.getElementById('metadata-file-input');
    document.getElementById('btn-import-meta').addEventListener('click', () => metaFileIn.click());
    metaFileIn.addEventListener('change', handleMetadataImport);

    // Sự kiện Undo/Redo/Lịch sử nút bấm Mục 2
    document.getElementById('btn-meta-undo').addEventListener('click', metaUndo);
    document.getElementById('btn-meta-redo').addEventListener('click', metaRedo);
    document.getElementById('btn-history-meta-show').addEventListener('click', () => {
        renderHistoryList('meta');
        modalHistory.classList.add('show');
    });
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
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'characters'));
            tr.appendChild(td);
        });
        tbodyChar.appendChild(tr);
    });
}

function addCharacterRow() {
    metadata.characters.push({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
    debounceMetaSave();
    renderCharacters();
}

function deleteCharacterRow() {
    const idx = activeInfoRows.characters;
    if (idx >= 0 && idx < metadata.characters.length) {
        if (confirm("Bạn có chắc chắn muốn xóa dòng nhân vật đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.characters.splice(idx, 1);
            if (metadata.characters.length === 0) {
                metadata.characters.push({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
            }
            activeInfoRows.characters = -1;
            debounceMetaSave();
            renderCharacters();
            showToast('🗑️ Đã xóa dòng nhân vật!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Nhân vật để xóa!');
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
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'pronouns'));
            tr.appendChild(td);
        });
        tbodyPro.appendChild(tr);
    });
}

function addPronounRow() {
    metadata.pronouns.push({ a: '', b: '', ab: '', ba: '', note: '' });
    debounceMetaSave();
    renderPronouns();
}

function deletePronounRow() {
    const idx = activeInfoRows.pronouns;
    if (idx >= 0 && idx < metadata.pronouns.length) {
        if (confirm("Bạn có chắc chắn muốn xóa dòng xưng hô đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.pronouns.splice(idx, 1);
            if (metadata.pronouns.length === 0) {
                metadata.pronouns.push({ a: '', b: '', ab: '', ba: '', note: '' });
            }
            activeInfoRows.pronouns = -1;
            debounceMetaSave();
            renderPronouns();
            showToast('🗑️ Đã xóa dòng xưng hô!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Xưng hô để xóa!');
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
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'terms'));
            tr.appendChild(td);
        });
        tbodyTerm.appendChild(tr);
    });
}

function addTermRow() {
    metadata.terms.push({ orig: '', changed: '' });
    debounceMetaSave();
    renderTerms();
}

function deleteTermRow() {
    const idx = activeInfoRows.terms;
    if (idx >= 0 && idx < metadata.terms.length) {
        if (confirm("Bạn có chắc chắn muốn xóa từ ngữ đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.terms.splice(idx, 1);
            if (metadata.terms.length === 0) {
                metadata.terms.push({ orig: '', changed: '' });
            }
            activeInfoRows.terms = -1;
            debounceMetaSave();
            renderTerms();
            showToast('🗑️ Đã xóa dòng từ ngữ!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Thống nhất từ ngữ để xóa!');
    }
}

// XUẤT NHẬP CẤU HÌNH THÔNG TIN TRUYỆN
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
                saveMetaUndoState();
                addMetaHistoryEntry();
                metadata = {
                    title: imported.title || '',
                    characters: imported.characters || [],
                    pronouns: imported.pronouns || [],
                    terms: imported.terms || []
                };
                debounceMetaSave();
                renderMetadata();
                showToast('📂 Nhập thông tin truyện thành công!', 'var(--btn-success)');
            } else {
                alert("Định dạng file không khớp!");
            }
        } catch (err) { alert("Lỗi đọc cấu hình: " + err); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}


// =========================================================================
// 7. HỆ THỐNG PHÂN PHỐI LỊCH SỬ CHUNG DÙNG CHUNG GIAO DIỆN MODAL
// =========================================================================
function renderHistoryList(type) {
    const historyListDiv = document.getElementById('history-list');
    const modalTitle = document.querySelector('#modal-history h3');
    const modalDesc = document.querySelector('#modal-history .modal-desc');
    
    let history = [];
    if (type === 'editor') {
        modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Dịch thuật)';
        modalDesc.innerHTML = 'Bản sao lưu tự động lưu định kỳ mỗi 15 giây khi có thay đổi. Lưu tối đa 15 bản ghi dịch.';
        history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    } else {
        modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Thông tin truyện)';
        modalDesc.innerHTML = 'Bản sao lưu tự động thông tin nhân vật, xưng hô, từ ngữ. Lưu tối đa 15 bản ghi thông tin.';
        history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
    }

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
        info.innerHTML = `<strong>${timeStr}</strong> <span style="font-size:0.8rem; color:gray;">(${entry.rowCount} dòng dữ liệu)</span>`;
        
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn-add';
        restoreBtn.innerText = 'Khôi phục';
        restoreBtn.style.padding = '4px 8px';
        restoreBtn.onclick = () => {
            if (confirm(`Khôi phục lại phiên bản lúc ${timeStr}?`)) {
                if (type === 'editor') {
                    addEditorHistoryEntry();
                    data = JSON.parse(JSON.stringify(entry.data));
                    renderTable();
                    localStorage.setItem('translationData', JSON.stringify(data));
                    showToast('🕒 Khôi phục bản dịch thành công!', 'var(--btn-success)');
                } else {
                    addMetaHistoryEntry();
                    metadata = JSON.parse(JSON.stringify(entry.data));
                    renderMetadata();
                    saveMetadata();
                    showToast('🕒 Khôi phục thông tin truyện thành công!', 'var(--btn-success)');
                }
                modalHistory.classList.remove('show');
            }
        };
        item.appendChild(info);
        item.appendChild(restoreBtn); 
        historyListDiv.appendChild(item);
    }
}


// =========================================================================
// 8. LOGIC PHỤ: TÌM KIẾM VÀ THAY THẾ (GIỮ NGUYÊN HOẠT ĐỘNG CHUẨN XÁC)
// =========================================================================
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
        showToast(`🖌 ... Đã tô sáng các kết quả tìm thấy!`, 'var(--btn-info)');
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
                    saveEditorUndoState();
                    addEditorHistoryEntry();
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
    
    saveEditorUndoState();
    addEditorHistoryEntry();
    
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
    modalReplace.classList.remove('show');
}

// KHỞI CHẠY LẮNG NGHE SỰ KIỆN ĐÓNG KHI CLICK NGOÀI VÙNG CHỈ ĐỊNH (Sử dụng biến toàn cục an toàn)
window.addEventListener('click', (e) => {
    if (e.target === modalReplace) {
        modalReplace.classList.remove('show');
        renderTable();
    }
    if (e.target === modalHistory) {
        modalHistory.classList.remove('show');
    }
});
