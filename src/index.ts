
const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__'

const loadBootstrapScript = (storage: Storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__)
    if(!bootstrap_script_path) return

    const script = window.document.createElement('script')
    script.src = bootstrap_script_path

    window.document.head.appendChild(script)

}

window.addEventListener('load', () => {
    loadBootstrapScript(localStorage)
})

