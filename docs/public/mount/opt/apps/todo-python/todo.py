# Python Todo — the entire UI (styling, DOM tree, events) and all state
# management is done here in Python, running in-browser via Pyodide.
# todo.html just boots Pyodide and hands control to this file.

import json
from js import document, window
from pyodide.ffi import create_proxy

STORAGE_KEY = 'py-todo-items'


def load_items():
    raw = window.localStorage.getItem(STORAGE_KEY)
    if not raw:
        return []
    try:
        items = json.loads(raw)
        return [it for it in items if isinstance(it, dict) and 'text' in it]
    except Exception:
        return []


def save_items():
    window.localStorage.setItem(STORAGE_KEY, json.dumps(items))


items = load_items()

root = document.getElementById('app-root')
root.innerHTML = ''

style = document.createElement('style')
style.textContent = """
  .todo-app { max-width: 420px; margin: 0 auto; padding: 20px 18px; }
  .todo-add-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .todo-input {
    flex: 1; background: #1e1e2e; border: 1px solid #313244; border-radius: 7px;
    padding: 9px 12px; color: #cdd6f4; font-size: 13px; font-family: inherit; outline: none;
  }
  .todo-input:focus { border-color: #a6adc8; }
  .todo-add-btn {
    background: #a6e3a1; color: #11111b; border: none; border-radius: 7px;
    padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .todo-add-btn:hover { background: #94e2a4; }
  .todo-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .todo-item {
    display: flex; align-items: center; gap: 10px; background: #1e1e2e;
    border-radius: 8px; padding: 9px 11px;
  }
  .todo-check {
    width: 18px; height: 18px; border-radius: 5px; border: 2px solid #6c7086;
    flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: #11111b; font-size: 13px; font-weight: 700;
  }
  .todo-item.done .todo-check { background: #a6e3a1; border-color: #a6e3a1; }
  .todo-text { flex: 1; font-size: 13px; color: #cdd6f4; word-break: break-word; cursor: pointer; }
  .todo-item.done .todo-text { text-decoration: line-through; color: #6c7086; }
  .todo-del {
    background: none; border: none; color: #6c7086; font-size: 15px; line-height: 1;
    cursor: pointer; padding: 2px 4px; flex-shrink: 0;
  }
  .todo-del:hover { color: #f38ba8; }
  .todo-empty { color: #6c7086; font-size: 12.5px; font-style: italic; text-align: center; padding: 18px 0; }
  .todo-footer {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 14px; padding-top: 12px; border-top: 1px solid #313244;
    font-size: 11.5px; color: #6c7086;
  }
  .todo-clear { background: none; border: none; color: #89b4fa; font-size: 11.5px; cursor: pointer; }
  .todo-clear:hover { text-decoration: underline; }
"""
document.head.appendChild(style)

wrap = document.createElement('div')
wrap.className = 'todo-app'

add_row = document.createElement('div')
add_row.className = 'todo-add-row'
inp = document.createElement('input')
inp.className = 'todo-input'
inp.placeholder = 'What needs doing?'
add_btn = document.createElement('button')
add_btn.className = 'todo-add-btn'
add_btn.textContent = 'Add'
add_row.appendChild(inp)
add_row.appendChild(add_btn)

todo_list = document.createElement('ul')
todo_list.className = 'todo-list'

footer = document.createElement('div')
footer.className = 'todo-footer'
count_label = document.createElement('span')
clear_btn = document.createElement('button')
clear_btn.className = 'todo-clear'
clear_btn.textContent = 'Clear completed'
footer.appendChild(count_label)
footer.appendChild(clear_btn)

wrap.appendChild(add_row)
wrap.appendChild(todo_list)
wrap.appendChild(footer)
root.appendChild(wrap)


def render():
    todo_list.innerHTML = ''
    if not items:
        empty = document.createElement('li')
        empty.className = 'todo-empty'
        empty.textContent = 'No tasks yet — add one above.'
        todo_list.appendChild(empty)
    for i, item in enumerate(items):
        li = document.createElement('li')
        li.className = 'todo-item' + (' done' if item['done'] else '')

        check = document.createElement('span')
        check.className = 'todo-check'
        check.textContent = '✓' if item['done'] else ''

        text = document.createElement('span')
        text.className = 'todo-text'
        text.textContent = item['text']

        del_btn = document.createElement('button')
        del_btn.className = 'todo-del'
        del_btn.textContent = '✕'

        def make_toggle(idx):
            def toggle(e):
                items[idx]['done'] = not items[idx]['done']
                save_items()
                render()
            return create_proxy(toggle)

        def make_delete(idx):
            def delete(e):
                del items[idx]
                save_items()
                render()
            return create_proxy(delete)

        check.addEventListener('click', make_toggle(i))
        text.addEventListener('click', make_toggle(i))
        del_btn.addEventListener('click', make_delete(i))

        li.appendChild(check)
        li.appendChild(text)
        li.appendChild(del_btn)
        todo_list.appendChild(li)

    remaining = sum(1 for it in items if not it['done'])
    count_label.textContent = f"{remaining} of {len(items)} left" if items else ''
    clear_btn.style.display = 'inline' if any(it['done'] for it in items) else 'none'


def add_item(e=None):
    text = str(inp.value).strip()
    if not text:
        return
    items.append({'text': text, 'done': False})
    inp.value = ''
    save_items()
    render()


def clear_completed(e=None):
    items[:] = [it for it in items if not it['done']]
    save_items()
    render()


def on_input_keydown(e):
    if e.key == 'Enter':
        add_item()


add_btn.addEventListener('click', create_proxy(add_item))
inp.addEventListener('keydown', create_proxy(on_input_keydown))
clear_btn.addEventListener('click', create_proxy(clear_completed))

render()
inp.focus()
