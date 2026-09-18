// Sample systemd-style service (see
// /etc/systemd/system/disk-usage-logger.service) - disabled by default.
// Periodically logs the browser's storage quota/usage estimate for this
// origin, standing in for `df`-style disk accounting since the vfs sits on
// IndexedDB rather than a real block device.
const systemd = platform.getService('systemd');

const logUsage = async () => {
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      systemd.log('navigator.storage.estimate() unavailable in this browser');
      return;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const mb = (n) => (n / (1024 * 1024)).toFixed(1);
    const pct = quota ? ((usage / quota) * 100).toFixed(1) : '0.0';
    systemd.log(`disk usage: ${mb(usage)}MB / ${mb(quota)}MB (${pct}%)`);
  } catch (err) {
    systemd.log(`failed to read storage estimate: ${err.message}`);
  }
};

logUsage();
const timer = setInterval(logUsage, 60000);

systemd.onStop(() => {
  clearInterval(timer);
});
