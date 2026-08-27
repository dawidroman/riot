'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConcertScheduleApp } = require('../app.js');

test('dialog Tab handling wraps focus in both directions', () => {
    const app = new ConcertScheduleApp();
    let focused = null;
    const first = { focus() { focused = 'first'; } };
    const last = { focus() { focused = 'last'; } };
    const dialog = { focus() { focused = 'dialog'; } };
    const backdrop = {
        hidden: false,
        querySelectorAll() { return [first, last]; },
        querySelector() { return dialog; }
    };
    const originalDocument = global.document;

    try {
        global.document = {
            activeElement: last,
            getElementById() { return backdrop; }
        };
        let prevented = false;
        app.handleDialogKeydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(focused, 'first');

        global.document.activeElement = first;
        prevented = false;
        app.handleDialogKeydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(focused, 'last');
    } finally {
        global.document = originalDocument;
    }
});

test('Escape closes the dialog and restores the previous focus', () => {
    const app = new ConcertScheduleApp();
    let restored = false;
    const previous = { isConnected: true, focus() { restored = true; } };
    const backdrop = { hidden: false };
    const originalDocument = global.document;

    try {
        app.dialogPreviouslyFocused = previous;
        global.document = {
            body: { classList: { remove() {} } },
            getElementById() { return backdrop; }
        };
        let prevented = false;
        app.handleDialogKeydown({ key: 'Escape', preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(backdrop.hidden, true);
        assert.equal(restored, true);
    } finally {
        global.document = originalDocument;
    }
});
