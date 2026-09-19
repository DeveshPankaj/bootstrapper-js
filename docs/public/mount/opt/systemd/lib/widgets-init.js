// ExecStart for /etc/systemd/system/widgets.service — loads every
// /etc/widgets/*.js script (via the load-widgets command, backed by
// src/remote.ts) so each can call platform.host.registerWidget(...).
// A "oneshot"-style unit: registration is synchronous and nothing needs to
// keep running afterward, so it goes active immediately and stays active
// with no ongoing timer (unlike cron.service).
platform.host.callCommand('load-widgets')
