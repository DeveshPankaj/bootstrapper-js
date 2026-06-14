// Example dynamic Settings section. Demonstrates registering a new page in
// the Settings app from a standalone vfs script, loaded from /etc/settings/
// (see /home/user1/settings.html's loadDynamicSettingsScripts). Any script -
// here or elsewhere - can register/unregister a section the same way via
// `platform.getService('settings')`.
const platform = window.platform;

platform.getService('settings').registerSection('99-example', (container, api) => {
  container.innerHTML = `
    <h1 class="settings-page-title">Example</h1>
    <p class="settings-page-subtitle">
      A dynamically-registered settings section, loaded from
      <code>/etc/settings/99-example.js</code>.
    </p>
    <div class="settings-group">
      <div class="settings-group-body" style="display: block; padding: 1rem 1.25rem;">
        <p style="margin: 0 0 0.75rem;">This page's nav item (name + icon) comes from the
          <code>meta</code> passed to <code>registerSection</code>.</p>
        <p style="margin: 0 0 0.75rem;">Live clock: <strong id="example-clock"></strong></p>
        <p style="margin: 0;">Button clicks: <strong id="example-count">0</strong></p>
      </div>
    </div>
    <button class="settings-btn primary" id="example-button">Click me</button>
  `;

  const clockEl = container.querySelector('#example-clock');
  const updateClock = () => { clockEl.textContent = new Date().toLocaleTimeString(); };
  updateClock();
  const interval = setInterval(updateClock, 1000);
  api.onDestroy(() => clearInterval(interval));

  const countEl = container.querySelector('#example-count');
  const button = container.querySelector('#example-button');
  let count = 0;
  const onClick = () => { count += 1; countEl.textContent = String(count); };
  button.addEventListener('click', onClick);
  api.onDestroy(() => button.removeEventListener('click', onClick));
}, {
  title: 'Example',
  icon: 'science',
  color: '#ff9500',
});
