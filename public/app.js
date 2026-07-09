const state = { notes: [], todos: [], selected: null };
const $ = (id) => document.getElementById(id);
const themeKey = 'zk-theme';

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

async function loadLists() {
  const [notes, todos] = await Promise.all([api('/api/notes'), api('/api/todos')]);
  state.notes = notes.notes;
  state.todos = todos.todos;
  renderLists();
}

async function openNote(id) {
  const { note } = await api(`/api/notes/${encodeURIComponent(id)}`);
  state.selected = { kind: 'note', id, item: note };
  renderLists();
  renderDetail();
}

async function openTodo(id) {
  const { todo } = await api(`/api/todos/${encodeURIComponent(id)}`);
  state.selected = { kind: 'todo', id, item: todo };
  renderLists();
  renderDetail();
}

function renderDetail() {
  const detailTitle = $('detailTitle');
  const detailBody = $('detailBody');
  const selected = state.selected;
  $('saveBtn').disabled = !selected;
  $('deleteBtn').disabled = !selected;
  if (!selected) {
    detailTitle.textContent = 'Select a note or todo';
    detailBody.innerHTML = '<p class="empty">Pick an item from the left to edit it.</p>';
    return;
  }
  if (selected.kind === 'note') {
    const note = selected.item;
    detailTitle.textContent = note.title;
    detailBody.innerHTML = `
      <div class="editor" data-kind="note">
        <input name="title" value="${escapeHtml(note.title)}">
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
  const todo = selected.item;
  detailTitle.textContent = todo.title;
  detailBody.innerHTML = `
    <div class="editor" data-kind="todo">
      <input name="title" value="${escapeHtml(todo.title)}">
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
}

async function saveSelected() {
  const selected = state.selected;
  if (!selected) return;
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
