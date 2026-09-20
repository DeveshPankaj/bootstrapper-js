# Persistence for Python Todo — split into its own module to demonstrate
# that this app supports multiple .py files with normal `import` between
# them (main.js writes every sibling .py file into Pyodide's own FS and
# puts the app dir on sys.path before running the entry point).
#
# Reads/writes go through window.__todoFS (injected by main.js), which
# backs onto the real vfs at /home/user1/.local/share/todo-python/todos.json.

import json
from js import window


def load_items():
    raw = window.__todoFS.load()
    if not raw:
        return []
    try:
        items = json.loads(raw)
        return [it for it in items if isinstance(it, dict) and 'text' in it]
    except Exception:
        return []


def save_items(items):
    window.__todoFS.save(json.dumps(items))
