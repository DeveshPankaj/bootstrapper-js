import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => console.log('CONSOLE:', msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForTimeout(2000);

const notifWidget = page.locator('.widget[data-widget="notifications"]');
// Widget loading happens after the systemd-managed boot sequence
// (cron/widgets service) finishes activating, which can take a while.
await assert.doesNotReject(async () => notifWidget.waitFor({ state: 'visible', timeout: 25000 }));
console.log('PASS: notifications widget is mounted on the desktop');

// Badge should be hidden/absent when there's no unread history yet.
const badgeBefore = notifWidget.locator('.widget-notifications-badge:not(.hidden)');
console.log('badge visible before any notifications:', await badgeBefore.count());

// Fire a few notifications through the real `notify` command.
await page.evaluate(() => {
  window.platform.host.callCommand('notify', { title: 'Test One', body: 'First test notification' });
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.platform.host.callCommand('notify', { title: 'Test Two', body: 'Second test notification' });
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.platform.host.callCommand('notify', { title: 'Test Three', body: 'Third test notification' });
});

// Confirm the history file was written directly.
const historyAfterSend = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/var/log/notifications.json', 'utf-8').toString());
});
console.log('history length after 3 notify calls:', historyAfterSend.length);
assert.equal(historyAfterSend.length, 3, 'expected 3 entries in /var/log/notifications.json');
assert.equal(historyAfterSend.every((e) => e.read === false), true, 'all new entries should start unread');

// Wait for the widget's poll interval (~4s) to pick up the new unread count.
await page.waitForTimeout(4500);

const badge = notifWidget.locator('.widget-notifications-badge');
const badgeText = await badge.innerText();
console.log('badge text after notifications:', badgeText);
assert.equal(badgeText, '3', 'badge should show 3 unread notifications');
const badgeHiddenClass = await badge.evaluate((el) => el.classList.contains('hidden'));
assert.equal(badgeHiddenClass, false, 'badge should not be hidden while unread > 0');
console.log('PASS: unread badge count updates live from notify calls');

// Click the bell to open the dropdown (force: true — draggable overlay intercepts
// pointer events headlessly, per CLAUDE.md testing gotchas).
const bell = notifWidget.locator('.widget-notifications-bell');
await bell.click({ force: true });
await page.waitForTimeout(300);

const dropdown = notifWidget.locator('.widget-notifications-dropdown');
const dropdownHidden = await dropdown.evaluate((el) => el.classList.contains('hidden'));
assert.equal(dropdownHidden, false, 'dropdown should be visible after clicking the bell');

const items = notifWidget.locator('.widget-notifications-item');
const itemCount = await items.count();
console.log('dropdown item count:', itemCount);
assert.equal(itemCount, 3, 'dropdown should list all 3 notifications');

const firstItemText = await items.first().innerText();
console.log('first (newest) dropdown item:', JSON.stringify(firstItemText));
assert.ok(firstItemText.includes('Test Three'), 'newest notification should be listed first');
assert.ok(/ago|just now/.test(firstItemText), 'dropdown item should show a relative time');
console.log('PASS: dropdown lists notifications newest-first with relative timestamps');

await page.screenshot({ path: 'testing/screenshots/notification-center-dropdown.png' });

// Opening the dropdown should have triggered mark-all-read -> badge clears.
await page.waitForTimeout(300);
const badgeHiddenAfterOpen = await badge.evaluate((el) => el.classList.contains('hidden'));
assert.equal(badgeHiddenAfterOpen, true, 'badge should be hidden after opening dropdown (mark-all-read)');
console.log('PASS: opening the dropdown marks all notifications read and clears the badge');

const historyAfterMarkRead = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/var/log/notifications.json', 'utf-8').toString());
});
assert.equal(historyAfterMarkRead.every((e) => e.read === true), true, 'all entries should be marked read on disk');
console.log('PASS: mark-all-read persisted to /var/log/notifications.json');

// Persistence across reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const historyAfterReload = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/var/log/notifications.json', 'utf-8').toString());
});
assert.equal(historyAfterReload.length, 3, 'history should persist across a page reload');
console.log('PASS: notification history persists across reload');

// Clear all.
const notifWidget2 = page.locator('.widget[data-widget="notifications"]');
await notifWidget2.locator('.widget-notifications-bell').click({ force: true });
await page.waitForTimeout(300);
await notifWidget2.locator('.widget-notifications-clear').click({ force: true });
await page.waitForTimeout(300);

const historyAfterClear = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/var/log/notifications.json', 'utf-8').toString());
});
console.log('history length after Clear all:', historyAfterClear.length);
assert.equal(historyAfterClear.length, 0, 'Clear all should empty /var/log/notifications.json');

const emptyMessage = await notifWidget2.locator('.widget-notifications-empty').innerText();
console.log('empty state message:', emptyMessage);
console.log('PASS: Clear all empties the history file and the dropdown reflects it');

console.log('ALL NOTIFICATION CENTER TESTS PASSED');

await browser.close();
