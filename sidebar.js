/* =========================================================
 * 侧边栏增强：搜索对话 + 文件夹分组 + 设置页个人信息入口
 * 不修改 app.js 现有函数内部实现，仅新增/接管渲染与交互。
 * ========================================================= */
(function () {
    'use strict';

    // ---------- 数据 ----------
    function ensureChatExtras() {
        if (typeof state === 'undefined') return;
        if (!Array.isArray(state.folders)) state.folders = [];
        (state.chats || []).forEach(function (c) {
            if (c.folderId === undefined) c.folderId = null;
        });
    }

    function chatLastTime(chat) {
        const lastMsg = chat.messages && chat.messages[chat.messages.length - 1];
        return (lastMsg && lastMsg.timestamp) || chat.createdAt || '';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function highlightTitle(title, q) {
        const t = String(title == null ? '' : title);
        if (!q) return escapeHtml(t);
        const idx = t.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return escapeHtml(t);
        return escapeHtml(t.slice(0, idx)) +
            '<span class="chat-search-hit">' + escapeHtml(t.slice(idx, idx + q.length)) + '</span>' +
            escapeHtml(t.slice(idx + q.length));
    }

    function getSearchQuery() {
        const input = document.getElementById('chatSearchInput');
        return input ? input.value : '';
    }

    // ---------- 对话列表渲染 ----------
    function chatItemHtml(chat, query) {
        const lastTime = chatLastTime(chat);
        const modelName = chat.model || (state.settings && state.settings.model) || '未指定模型';
        return '<div class="chat-item' + (chat.id === state.currentChatId ? ' active' : '') + '" data-id="' + chat.id + '">' +
            '<div class="chat-item-body"><div class="chat-item-row1">' + (chat.pinned ? '<span class="chat-item-pin">📌</span>' : '') + '<span class="chat-item-title">' + highlightTitle(chat.title, query) + '</span>' +
            '<span class="chat-item-time">' + formatTime(lastTime) + '</span></div>' +
            '<span class="chat-item-subtitle">' + escapeHtml(modelName) + '</span></div>' +
            '<button class="chat-item-delete" data-id="' + chat.id + '" title="删除">🗑</button></div>';
    }

    function renderChatList() {
        const container = document.getElementById('chatList');
        if (!container) return;
        ensureChatExtras();
        const query = getSearchQuery().trim();
        let html = '';

        if (query) {
            const q = query.toLowerCase();
            const hits = state.chats.filter(function (c) {
                return String(c.title || '').toLowerCase().indexOf(q) !== -1;
            });
            html = hits.length
                ? hits.map(function (c) { return chatItemHtml(c, query); }).join('')
                : '<div class="chat-empty">没有找到相关对话</div>';
        } else {
            const folders = state.folders.slice();
            const byFolder = {};
            const unfiled = [];
            state.chats.forEach(function (c) {
                if (c.folderId && folders.some(function (f) { return f.id === c.folderId; })) {
                    if (!byFolder[c.folderId]) byFolder[c.folderId] = [];
                    byFolder[c.folderId].push(c);
                } else {
                    unfiled.push(c);
                }
            });
            folders.forEach(function (f) {
                const items = (byFolder[f.id] || []).sort(function (a, b) {
                    return String(chatLastTime(b)).localeCompare(String(chatLastTime(a)));
                });
                const collapsed = !!f.collapsed;
                html += '<div class="chat-folder' + (collapsed ? ' collapsed' : '') + '" data-folder="' + f.id + '">' +
                    '<div class="chat-folder-head" data-folder-id="' + f.id + '">' +
                    '<i data-lucide="' + (collapsed ? 'folder' : 'folder-open') + '" class="chat-folder-icon"></i>' +
                    '<span class="chat-folder-name">' + escapeHtml(f.name) + '</span>' +
                    '<span class="chat-folder-count">' + items.length + '</span>' +
                    '<button class="chat-folder-edit" data-folder-id="' + f.id + '" title="重命名文件夹">✏️</button>' +
'<button class="chat-folder-del" data-folder-id="' + f.id + '" title="删除文件夹">🗑</button>' +
                    '<i data-lucide="chevron-down" class="chat-folder-chevron"></i>' +
                    '</div>' +
                    '<div class="chat-folder-body">' + items.map(function (c) { return chatItemHtml(c, ''); }).join('') + '</div>' +
                    '</div>';
            });
            if (unfiled.length) {
                html += '<div class="chat-unfiled">' + unfiled.map(function (c) { return chatItemHtml(c, ''); }).join('') + '</div>';
            } else if (!folders.length && !state.chats.length) {
                html = '<div class="chat-empty">还没有对话，点上方新建对话吧</div>';
            }
        }

        container.innerHTML = html;
        bindChatListEvents(container);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ---------- 列表交互 ----------
    function bindChatListEvents(container) {
        container.querySelectorAll('.chat-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (window.__chatLongPressSuppress) { window.__chatLongPressSuppress = false; e.stopPropagation(); return; }
                const del = e.target.closest('.chat-item-delete');
                if (del) { e.stopPropagation(); deleteChat(del.dataset.id); return; }
                switchChat(el.dataset.id);
            });

            let timer = null;
            let startX = 0, startY = 0;
            el.addEventListener('touchstart', function (e) {
                window.__chatLongPressSuppress = false;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    window.__chatLongPressSuppress = true;
                    showMoveMenu(el, { clientX: startX, clientY: startY });
                }, 600);
            }, { passive: true });
            el.addEventListener('touchmove', function (e) {
                if (!timer) return;
                if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) {
                    clearTimeout(timer); timer = null;
                }
            }, { passive: true });
            el.addEventListener('touchend', function () { if (timer) { clearTimeout(timer); timer = null; } });
            el.addEventListener('touchcancel', function () { if (timer) { clearTimeout(timer); timer = null; } });
            el.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                window.__chatLongPressSuppress = true;
                showMoveMenu(el, { clientX: e.clientX, clientY: e.clientY });
            });
        });

        container.querySelectorAll('.chat-folder-head').forEach(function (head) {
            head.addEventListener('click', function (e) {
                if (e.target.closest('.chat-folder-del') || e.target.closest('.chat-folder-edit')) return;
                const f = state.folders.find(function (x) { return x.id === head.dataset.folderId; });
                if (f) { f.collapsed = !f.collapsed; saveState(); renderChatList(); }
            });
            head.addEventListener('dragover', function (e) { e.preventDefault(); head.classList.add('drop-target'); });
            head.addEventListener('dragleave', function () { head.classList.remove('drop-target'); });
            head.addEventListener('drop', function (e) {
                e.preventDefault();
                head.classList.remove('drop-target');
                const cid = e.dataTransfer.getData('text/plain');
                if (cid) moveChatToFolder(cid, head.dataset.folderId);
            });
            const edit = head.querySelector('.chat-folder-edit');
            if (edit) edit.addEventListener('click', function (e) {
                e.stopPropagation();
                const f = state.folders.find(function (x) { return x.id === edit.dataset.folderId; });
                if (!f) return;
                const name = (window.prompt('重命名文件夹', f.name) || '').trim();
                if (!name) return;
                f.name = name;
                saveState(); renderChatList();
            });

            const del = head.querySelector('.chat-folder-del');
            if (del) del.addEventListener('click', function (e) {
                e.stopPropagation();
                const f = state.folders.find(function (x) { return x.id === del.dataset.folderId; });
                if (!f) return;
                if (confirm('删除文件夹「' + f.name + '」？文件夹内的对话会移到未分组。')) {
                    state.chats.forEach(function (c) { if (c.folderId === f.id) c.folderId = null; });
                    state.folders = state.folders.filter(function (x) { return x.id !== f.id; });
                    saveState(); renderChatList();
                }
            });
        });
    }

    function moveChatToFolder(chatId, folderId) {
        const c = state.chats.find(function (x) { return x.id === chatId; });
        if (!c) return;
        c.folderId = folderId || null;
        saveState();
        renderChatList();
    }

    // ---------- 移动菜单（长按 / 右键） ----------
    function showMoveMenu(chatEl, pos) {
        hideMoveMenu();
        const chat = state.chats.find(function (c) { return c.id === chatEl.dataset.id; });
        if (!chat) return;
        ensureChatExtras();
        const menu = document.createElement('div');
        menu.className = 'chat-move-menu';
        menu.id = 'chatMoveMenu';
        let html = '<div class="chat-move-menu-title">' + escapeHtml(String(chat.title || '').slice(0, 12)) + '</div>';
        html += '<button class="chat-move-item" data-act="rename"><i data-lucide="pencil"></i>重命名</button>';
        html += '<button class="chat-move-item" data-act="pin"><i data-lucide="arrow-up-from-line"></i>' + (chat.pinned ? '取消置顶' : '置顶') + '</button>';
        html += '<button class="chat-move-item chat-move-item-danger" data-act="delete"><i data-lucide="trash-2"></i>删除</button>';
        html += '<button class="chat-move-item" data-act="move"><i data-lucide="folder-input"></i>移动</button>';
        html += '<div class="chat-move-folders" id="chatMoveFolders">' +
            '<div class="chat-move-subtitle">移动到</div>' +
            '<button class="chat-move-item' + (!chat.folderId ? ' active' : '') + '" data-folder="">未分组</button>';
        state.folders.forEach(function (f) {
            html += '<button class="chat-move-item' + (chat.folderId === f.id ? ' active' : '') + '" data-folder="' + f.id + '"><i data-lucide="folder"></i>' + escapeHtml(f.name) + '</button>';
        });
        html += '</div>';
        menu.innerHTML = html;

        const renameBtn = menu.querySelector('[data-act="rename"]');
        if (renameBtn) renameBtn.addEventListener('click', function () {
            const t = (window.prompt('重命名对话', chat.title || '') || '').trim();
            if (t) { chat.title = t; saveState(); renderChatList(); }
            hideMoveMenu();
        });

        const pinBtn = menu.querySelector('[data-act="pin"]');
        if (pinBtn) pinBtn.addEventListener('click', function () {
            chat.pinned = !chat.pinned;
            saveState(); renderChatList();
            hideMoveMenu();
        });

        const delBtn = menu.querySelector('[data-act="delete"]');
        if (delBtn) delBtn.addEventListener('click', function () {
            deleteChat(chat.id);
            hideMoveMenu();
        });

        const moveBtn = menu.querySelector('[data-act="move"]');
        if (moveBtn) moveBtn.addEventListener('click', function () {
            const folders = menu.querySelector('#chatMoveFolders');
            if (folders) { folders.classList.toggle('open'); positionMoveMenu(menu, pos); }
        });

        menu.querySelectorAll('.chat-move-item').forEach(function (it) {
            if (!it.hasAttribute('data-folder')) return;
            it.addEventListener('click', function () {
                moveChatToFolder(chat.id, it.dataset.folder || null);
                hideMoveMenu();
            });
        });
        document.body.appendChild(menu);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        positionMoveMenu(menu, pos);
    }

    function positionMoveMenu(menu, pos) {
        const r = menu.getBoundingClientRect();
        const x = Math.max(8, Math.min(pos.clientX, window.innerWidth - r.width - 8));
        const y = Math.max(8, Math.min(pos.clientY, window.innerHeight - r.height - 8));
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    }

    function hideMoveMenu() {
        const m = document.getElementById('chatMoveMenu');
        if (m) m.remove();
    }



    // ---------- 初始化 ----------
    // ---------- 房间 tab 栏：显示/隐藏/高亮 ----------
    var ROOM_TAB_HOME = { studyHome: 'roomTabStudy', kitchenHome: 'roomTabKitchen', bedroomHome: 'roomTabBedroom', gardenHome: 'roomTabGarden' };
    function syncRoomTab() {
        var bar = document.getElementById('roomTabBar');
        var overlay = document.getElementById('bedroomOverlay');
        var home = document.getElementById('homePage');
        if (!bar || !overlay || !home) return;
        var homeActive = home.classList.contains('active');
        var overlayActive = overlay.classList.contains('active');
        var view = (typeof bedroomStack !== 'undefined' && bedroomStack.length) ? bedroomStack[bedroomStack.length - 1] : null;
        var starred = (typeof bedroomView !== 'undefined' && bedroomView === 'starred');
        var isRoomHome = overlayActive && !starred && !!ROOM_TAB_HOME[view];
        var show = (homeActive && !overlayActive) || isRoomHome;
        bar.classList.toggle('show', show);
        overlay.classList.toggle('has-tabbar', isRoomHome);
        if (show) {
            var radioId = (homeActive && !overlayActive) ? 'roomTabLiving' : ROOM_TAB_HOME[view];
            var radio = document.getElementById(radioId);
            if (radio && !radio.checked) radio.checked = true;
        }
    }
    window.showHomeFromTab = function () {
        var ov = document.getElementById('bedroomOverlay');
        if (ov) ov.classList.remove('active');
        if (typeof showPage === 'function') showPage('home');
    };
    (function installTabSync() {
        var origRenderBedroom = window.renderBedroom;
        window.renderBedroom = function () {
            if (typeof origRenderBedroom === 'function') origRenderBedroom();
            syncRoomTab();
        };
        var origOpenRoom = window.openRoom;
        window.openRoom = function (v) {
            if (typeof origOpenRoom === 'function') origOpenRoom(v);
            syncRoomTab();
        };
        var origShowPage = window.showPage;
        window.showPage = function (page) {
            if (typeof origShowPage === 'function') origShowPage(page);
            syncRoomTab();
        };
        var origBedroomBack = window.bedroomBack;
        window.bedroomBack = function () {
            if (typeof origBedroomBack === 'function') origBedroomBack();
            syncRoomTab();
        };
    })();

    function init() {
        if (typeof state === 'undefined') return;
        ensureChatExtras();

        const searchInput = document.getElementById('chatSearchInput');
        const clearBtn = document.getElementById('chatSearchClear');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                if (clearBtn) clearBtn.style.display = searchInput.value ? 'flex' : 'none';
                renderChatList();
            });
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    if (clearBtn) clearBtn.style.display = 'none';
                    renderChatList();
                }
            });
        }
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            clearBtn.style.display = 'none';
            renderChatList();
        });

        const newFolderBtn = document.getElementById('newFolderBtn');
        if (newFolderBtn) newFolderBtn.addEventListener('click', function () {
            const name = (window.prompt('文件夹名称', '新文件夹') || '').trim();
            if (!name) return;
            state.folders.push({
                id: 'f_' + Date.now().toString(36),
                name: name,
                collapsed: false,
                createdAt: new Date().toISOString()
            });
            saveState();
            renderChatList();
        });

        document.addEventListener('pointerdown', function (e) {
            const m = document.getElementById('chatMoveMenu');
            if (m && !m.contains(e.target)) hideMoveMenu();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hideMoveMenu();
        });

        // 用新的渲染器接管对话列表（所有现有调用点都会走这里）
        window.renderChatList = renderChatList;
        renderChatList();
        syncRoomTab();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
