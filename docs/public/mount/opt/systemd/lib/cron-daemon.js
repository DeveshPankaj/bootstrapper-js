// ExecStart for /etc/systemd/system/cron.service — starts the cron
// scheduler (src/core/cron.ts, exposed via the start-cron-scheduler command
// since it's compiled TS) and clears its interval on `systemctl stop`/
// `restart`, so restarting the unit doesn't leak a second ticking interval
// (and duplicate job runs) alongside the first.
const systemd = platform.getService('systemd')
const intervalId = platform.host.callCommand('start-cron-scheduler')
systemd.onStop(() => clearInterval(intervalId))
