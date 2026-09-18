// Sample systemd-style service (see /etc/systemd/system/heartbeat.service).
// Demonstrates Restart=always: writes a heartbeat line to the unit's journal
// every 10s via the `systemd` context service, and cleans up its interval
// when `systemctl stop`/`onStop` asks it to - a well-behaved service
// cooperates with the stop signal the same way a real daemon handles
// SIGTERM.
const systemd = platform.getService('systemd');

let beat = 0;
const tick = () => {
  beat += 1;
  systemd.log(`heartbeat #${beat}`);
};

tick();
const timer = setInterval(tick, 10000);

systemd.onStop(() => {
  clearInterval(timer);
});
