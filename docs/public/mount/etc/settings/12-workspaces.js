// Workspaces feature removed. Unregisters the section in case an older version
// of this file already registered it in this session.
try { platform.getService('settings')?.unregisterSection?.('12-workspaces') } catch (_) {}
