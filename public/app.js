const state = { notes: [], todos: [], selected: null, detailTab: 'view' };
const $ = (id) => document.getElementById(id);
const themeKey = 'zk-theme';
let toastSeq = 0;

function getPreferredTheme() {
  const saved = localStorage.getItem(themeKey);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  const toggle = $('themeToggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(themeKey, next);
  applyTheme(next);
}

function showToast(message, kind = 'success') {
  const region = $('toastRegion');
  if (!region) return;
  const id = `toast_${++toastSeq}`;
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.dataset.toastId = id;
  toast.innerHTML = `
    <div>${escapeHtml(message)}</div>
    <button type="button" aria-label="Dismiss notification">×</button>
  `;
  const remove = () => {
    toast.remove();
  };
  toast.querySelector('button')?.addEventListener('click', remove);
  region.appendChild(toast);
  window.setTimeout(remove, 3000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

function renderLists() {
  $('notesList').innerHTML = state.notes.map((note) => `
    <div class="item ${state.selected?.kind === 'note' && state.selected.id === note.id ? 'active' : ''}" data-kind="note" data-id="${note.id}">
      <strong>${escapeHtml(note.title)}</strong>
      <div class="meta">${note.updated_at.slice(0, 10)} · ${escapeHtml((note.body || '').slice(0, 140))}</div>
    </div>
  `).join('');
  $('todosList').innerHTML = state.todos.map((todo) => `
    <div class="item ${state.selected?.kind === 'todo' && state.selected.id === todo.id ? 'active' : ''}" data-kind="todo" data-id="${todo.id}">
      <strong>${escapeHtml(todo.title)}</strong>
      <div class="meta">${todo.status} · priority ${todo.priority}</div>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const closeList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };

  const closeCode = () => {
    if (!inCode) return;
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
    inCode = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      if (inCode) closeCode();
      else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      out.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${renderInlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    closeList();
    if (!line) {
      out.push('<div style="height:0.35rem"></div>');
    } else {
      out.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  closeCode();
  return out.join('');
}

function renderMetaList(label, values) {
  const content = values?.length ? values.map(renderInlineMarkdown).join(', ') : 'None';
  return `<div class="meta-item"><strong>${escapeHtml(label)}</strong> ${content}</div>`;
}

function renderChecklistPreview(items = []) {
  if (!items.length) return '<p class="empty">No checklist items.</p>';
  return `<div class="checklist">${items.map((item) => `
    <div class="check-item">
      <span>${item.checked ? '☑' : '☐'} ${renderInlineMarkdown(item.text)}</span>
    </div>
  `).join('')}</div>`;
}

function setDetailTab(tab) {
  state.detailTab = tab;
  $('viewTabBtn').classList.toggle('active', tab === 'view');
  $('editTabBtn').classList.toggle('active', tab === 'edit');
  renderDetail();
}

async function loadLists() {
  const [notes, todos] = await Promise.all([api('/api/notes'), api('/api/todos')]);
  state.notes = notes.notes;
  state.todos = todos.todos;
  renderLists();
}

async function openNote(id) {
  const { note } = await api(`/api/notes/${encodeURIComponent(id)}`);
  state.selected = { kind: 'note', id, item: note };
  state.detailTab = 'view';
  renderLists();
  renderDetail();
}

async function openTodo(id) {
  const { todo } = await api(`/api/todos/${encodeURIComponent(id)}`);
  state.selected = { kind: 'todo', id, item: todo };
  state.detailTab = 'view';
  renderLists();
  renderDetail();
}

function renderDetail() {
  const detailTitle = $('detailTitle');
  const detailBody = $('detailBody');
  const selected = state.selected;
  $('saveBtn').disabled = !selected || state.detailTab !== 'edit';
  $('deleteBtn').disabled = !selected;
  $('viewTabBtn').disabled = !selected;
  $('editTabBtn').disabled = !selected;
  if (!selected) {
    detailTitle.textContent = 'Select a note or todo';
    detailBody.innerHTML = '<p class="empty">Pick an item from the left to edit it.</p>';
    return;
  }
  if (selected.kind === 'note') {
    const note = selected.item;
    detailTitle.textContent = note.title;
    if (state.detailTab === 'edit') {
      detailBody.innerHTML = `
        <div class="editor" data-kind="note">
          <input name="title" value="${escapeAttribute(note.title)}">
          <textarea name="body">${escapeHtml(note.body || '')}</textarea>
          <div>
            <strong>Tags</strong>
            <div class="meta">${(note.tags || []).map(escapeHtml).join(', ') || 'None'}</div>
          </div>
          <div>
            <strong>Checklist</strong>
            <div class="checklist">${(note.checklistItems || []).map(item => `
              <div class="check-item">
                <label><input type="checkbox" data-item="${item.id}" ${item.checked ? 'checked' : ''}> <span>${escapeHtml(item.text)}</span></label>
                <button data-delete-item="${item.id}" class="danger">Delete</button>
              </div>
            `).join('')}</div>
            <div class="inline-actions" style="margin-top:12px">
              <input id="newChecklistText" placeholder="New checklist item">
              <button id="addChecklistBtn">Add item</button>
            </div>
          </div>
        </div>`;
      return;
    }
    detailBody.innerHTML = `
      <div class="view">
        <div class="card prose">
          ${renderMarkdown(note.body || '(no body)')}
        </div>
        <div class="card meta-grid">
          ${renderMetaList('Tags', note.tags)}
          ${renderMetaList('Links', (note.links || []).map((link) => link.title))}
          ${renderMetaList('Backlinks', (note.backlinks || []).map((link) => link.title))}
          ${renderMetaList('Todos', (note.todos || []).map((todo) => todo.title))}
        </div>
        <div class="card">
          <strong>Checklist</strong>
          ${renderChecklistPreview(note.checklistItems)}
        </div>
      </div>`;
    return;
  }
  const todo = selected.item;
  detailTitle.textContent = todo.title;
  if (state.detailTab === 'edit') {
    detailBody.innerHTML = `
      <div class="editor" data-kind="todo">
        <input name="title" value="${escapeAttribute(todo.title)}">
        <textarea name="description">${escapeHtml(todo.description || '')}</textarea>
        <div class="row">
          <select name="status">
            ${['pending','in_progress','completed'].map(status => `<option value="${status}" ${status === todo.status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
          <input name="priority" type="number" value="${todo.priority}">
        </div>
        <input name="dueDate" type="date" value="${todo.due_date ? todo.due_date.slice(0, 10) : ''}">
        <div>
          <strong>Linked notes</strong>
          <div class="meta">${(todo.notes || []).map((n) => escapeHtml(n.title)).join(', ') || 'None'}</div>
        </div>
      </div>`;
    return;
  }
  detailBody.innerHTML = `
    <div class="view">
      <div class="card prose">
        ${renderMarkdown(todo.description || '(no description)')}
      </div>
      <div class="card meta-grid">
        <div class="meta-item"><strong>Status</strong> ${escapeHtml(todo.status)}</div>
        <div class="meta-item"><strong>Priority</strong> ${escapeHtml(String(todo.priority))}</div>
        <div class="meta-item"><strong>Due</strong> ${todo.due_date ? escapeHtml(todo.due_date.slice(0, 10)) : 'None'}</div>
        <div class="meta-item"><strong>Completed</strong> ${todo.completed_at ? escapeHtml(todo.completed_at.slice(0, 10)) : 'No'}</div>
        ${renderMetaList('Linked notes', (todo.notes || []).map((n) => n.title))}
      </div>
    </div>`;
}

async function saveSelected() {
  const selected = state.selected;
  if (!selected) return;
  try {
    const editor = document.querySelector('.editor');
    const formData = new FormData();
    editor.querySelectorAll('input, textarea, select').forEach((el) => formData.append(el.name, el.value));
    if (selected.kind === 'note') {
      await api(`/api/notes/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: formData.get('title'), body: formData.get('body') }),
      });
      await openNote(selected.id);
    } else {
      await api(`/api/todos/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: formData.get('title'),
          description: formData.get('description'),
          status: formData.get('status'),
          priority: Number(formData.get('priority') || 0),
          dueDate: formData.get('dueDate') || null,
        }),
      });
      await openTodo(selected.id);
    }
    await loadLists();
    showToast(`${selected.kind === 'note' ? 'Note' : 'Todo'} saved`, 'success');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Save failed', 'error');
    throw error;
  }
}

async function deleteSelected() {
  const selected = state.selected;
  if (!selected || !confirm('Delete this item?')) return;
  await api(`/api/${selected.kind === 'note' ? 'notes' : 'todos'}/${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
  state.selected = null;
  renderDetail();
  await loadLists();
}

document.addEventListener('click', async (event) => {
  if (event.target.id === 'themeToggle') {
    toggleTheme();
    return;
  }
  if (event.target.id === 'viewTabBtn') {
    setDetailTab('view');
    return;
  }
  if (event.target.id === 'editTabBtn') {
    setDetailTab('edit');
    return;
  }
  const item = event.target.closest('.item');
  if (item) {
    const kind = item.dataset.kind;
    const id = item.dataset.id;
    if (kind === 'note') await openNote(id);
    else await openTodo(id);
    return;
  }
  if (event.target.id === 'saveBtn') await saveSelected();
  if (event.target.id === 'deleteBtn') await deleteSelected();
  if (event.target.id === 'refreshNotesBtn' || event.target.id === 'refreshTodosBtn') await loadLists();
  if (event.target.id === 'searchNotesBtn' || event.target.id === 'searchTodosBtn') {
    const q = $('searchInput').value.trim();
    if (!q) return;
    const type = event.target.id === 'searchTodosBtn' ? 'todos' : 'notes';
    const result = await api(`/api/search?type=${type}&q=${encodeURIComponent(q)}`);
    if (type === 'notes') state.notes = result.results.map(({ id, title, updated_at, snippet }) => ({ id, title, updated_at, body: snippet || '' }));
    else state.todos = result.results.map(({ id, title, status, priority }) => ({ id, title, status, priority }));
    renderLists();
  }
  if (event.target.id === 'addChecklistBtn') {
    const text = $('newChecklistText').value.trim();
    if (!text || state.selected?.kind !== 'note') return;
    await api(`/api/notes/${encodeURIComponent(state.selected.id)}/checklist-items`, { method: 'POST', body: JSON.stringify({ text }) });
    await openNote(state.selected.id);
  }
  const del = event.target.closest('[data-delete-item]');
  if (del && state.selected?.kind === 'note') {
    await api(`/api/checklist-items/${encodeURIComponent(del.dataset.deleteItem)}`, { method: 'DELETE' });
    await openNote(state.selected.id);
  }
  const checkbox = event.target.closest('input[type="checkbox"][data-item]');
  if (checkbox && state.selected?.kind === 'note') {
    await api(`/api/checklist-items/${encodeURIComponent(checkbox.dataset.item)}`, { method: 'PATCH', body: JSON.stringify({ checked: checkbox.checked }) });
    await openNote(state.selected.id);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getPreferredTheme());
  await loadLists();
  renderDetail();
});
