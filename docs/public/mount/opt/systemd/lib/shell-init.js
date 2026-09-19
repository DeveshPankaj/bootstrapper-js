// ExecStart for /etc/systemd/system/shell.service — runs the user's startup
// script (/home/user1/initd.run), the analogue of a login shell/session
// starting for the user once the system is up. Another "oneshot"-style
// unit: initd.run's own commands run to completion here, nothing further
// needs to be kept alive by this unit itself.
platform.host.exec(platform, '/home/user1/initd.run')
