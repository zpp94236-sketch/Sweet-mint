/* =========================================================
 * 书房：待办清单（todo list）
 * 独立于 app.js 的房间页渲染；通过 renderStudyHome() 接入
 * ========================================================= */
(function () {
    'use strict';

    function ensureTodos() {
        if (typeof state === 'undefined') return;
        if (!Array.isArray(state.todos)) state.todos = [];
        if (typeof state.todosDoneCollapsed !== 'boolean') state.todosDoneCollapsed = true;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function subProgress(t) {
        var subs = t.subtasks || [];
        if (!subs.length) return '';
        return subs.filter(function (s) { return s.done; }).length + '/' + subs.length;
    }

    function todoItemHtml(t) {
        var subs = t.subtasks || [];
        var count = subProgress(t);
        var subHtml = '';
        if (subs.length) {
            subHtml = '<div class="todo-subtasks" style="' + (t.expanded ? '' : 'display:none') + '">' +
                subs.map(function (s) {
                    return '<label class="todo-subtask"><input type="checkbox" ' + (s.done ? 'checked' : '') +
                        ' onchange="studyToggleSubtask(\'' + t.id + '\',\'' + s.id + '\')"><span' + (s.done ? ' class="done"' : '') + '>' + esc(s.title) + '</span></label>';
                }).join('') + '</div>';
        }
        return '<div class="todo-item' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
            '<div class="todo-item-row" onclick="studyToggleExpand(\'' + t.id + '\')">' +
            '<label class="todo-check" onclick="event.stopPropagation()"><input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="studyToggleTodo(\'' + t.id + '\')"></label>' +
            '<span class="todo-item-title">' + esc(t.title) + '</span>' +
            (count ? '<span class="todo-item-count">' + count + '</span>' : '') +
            (subs.length ? '<span class="todo-expand-arrow' + (t.expanded ? ' open' : '') + '">▾</span>' : '') +
            '</div>' + subHtml + '</div>';
    }

    function renderStudyHome() {
        ensureTodos();
        var active = state.todos.filter(function (t) { return !t.done; });
        var done = state.todos.filter(function (t) { return t.done; });
        var gridItems = [
            { icon: '💻', name: '工作台', desc: 'AI协作' },
            { icon: '✏️', name: '自习室', desc: '番茄钟+白噪音' },
            { icon: '🖋️', name: '创作室', desc: '创作空间' },
            { icon: '📖', name: '阅读室', desc: '共读' }
        ];
        var gridHtml = (typeof renderPlaceholderGrid === 'function') ? renderPlaceholderGrid(gridItems) : '';
        var doneCollapsed = state.todosDoneCollapsed !== false;
        var doneHtml = '';
        if (done.length) {
            doneHtml = '<div class="todo-done">' +
                '<div class="todo-done-head" onclick="studyToggleDoneSection()"><span>已完成 <b>' + done.length + '</b></span><span class="todo-done-arrow' + (doneCollapsed ? '' : ' open') + '">▾</span></div>' +
                '<div class="todo-done-body" style="' + (doneCollapsed ? 'display:none' : '') + '">' + done.map(todoItemHtml).join('') + '</div>' +
                '</div>';
        }
        return '<div class="study-home">' +
            '<section class="todo-panel">' +
            '<div class="todo-panel-head">' +
            '<span class="todo-panel-title">待办</span>' +
            '<div class="todo-settings-wrap">' +
            '<button class="todo-settings-btn" onclick="studyToggleSettingsMenu(event)">⚙️</button>' +
            '<div class="todo-settings-menu" id="todoSettingsMenu" style="display:none">' +
            '<button onclick="studyExpandAll()">展开全部</button>' +
            '<button onclick="studyCollapseAll()">收起全部</button>' +
            '<button class="danger" onclick="studyClearDone()">清空已完成</button>' +
            '</div></div></div>' +
            '<div class="todo-list">' + (active.length ? active.map(todoItemHtml).join('') : '<div class="todo-empty">还没有待办事项，点右下角 + 新建</div>') + '</div>' +
            doneHtml +
            '</section>' +
            gridHtml +
            '<button class="todo-fab" onclick="studyAddTodo()">+</button>' +
            '</div>';
    }

    function rerender() {
        if (typeof saveState === 'function') saveState();
        var c = document.getElementById('bedroomContent');
        if (c && typeof bedroomStack !== 'undefined' && bedroomStack[bedroomStack.length - 1] === 'studyHome') {
            c.innerHTML = renderStudyHome();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    function studyAddTodo() {
        var title = (window.prompt('新建待办项标题', '') || '').trim();
        if (!title) return;
        var subsRaw = (window.prompt('子任务（用逗号分隔，可留空）', '') || '').trim();
        var subs = [];
        if (subsRaw) {
            subs = subsRaw.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
                return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: s, done: false };
            });
        }
        state.todos.push({ id: 't' + Date.now().toString(36), title: title, done: false, expanded: !!subs.length, subtasks: subs, createdAt: new Date().toISOString() });
        rerender();
    }

    function studyToggleTodo(id) {
        var t = state.todos.find(function (x) { return x.id === id; });
        if (!t) return;
        t.done = !t.done;
        rerender();
    }
    function studyToggleExpand(id) {
        var t = state.todos.find(function (x) { return x.id === id; });
        if (!t) return;
        t.expanded = !t.expanded;
        rerender();
    }
    function studyToggleSubtask(tid, sid) {
        var t = state.todos.find(function (x) { return x.id === tid; });
        if (!t) return;
        var s = (t.subtasks || []).find(function (x) { return x.id === sid; });
        if (!s) return;
        s.done = !s.done;
        rerender();
    }
    function studyToggleDoneSection() {
        state.todosDoneCollapsed = state.todosDoneCollapsed === false ? true : false;
        rerender();
    }
    function studyExpandAll() { state.todos.forEach(function (t) { t.expanded = true; }); rerender(); }
    function studyCollapseAll() { state.todos.forEach(function (t) { t.expanded = false; }); rerender(); }
    function studyClearDone() {
        if (!state.todos.some(function (t) { return t.done; })) return;
        if (window.confirm('清除所有已完成的待办项？')) {
            state.todos = state.todos.filter(function (t) { return !t.done; });
            rerender();
        }
    }
    function studyToggleSettingsMenu(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var m = document.getElementById('todoSettingsMenu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
    }

    window.renderStudyHome = renderStudyHome;
    window.studyAddTodo = studyAddTodo;
    window.studyToggleTodo = studyToggleTodo;
    window.studyToggleExpand = studyToggleExpand;
    window.studyToggleSubtask = studyToggleSubtask;
    window.studyToggleDoneSection = studyToggleDoneSection;
    window.studyExpandAll = studyExpandAll;
    window.studyCollapseAll = studyCollapseAll;
    window.studyClearDone = studyClearDone;
    window.studyToggleSettingsMenu = studyToggleSettingsMenu;

    function init() {
        ensureTodos();
        document.addEventListener('click', function () {
            var m = document.getElementById('todoSettingsMenu');
            if (m) m.style.display = 'none';
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
