'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ScheduleDataError,
    deriveFestivalDays,
    getEventStatus,
    parseCSV,
    parseClockTime,
    parseScheduleCSV,
    parseTimeRange,
    selectInitialDay
} = require('../app.js');

const HEADER = 'Day,Date,Stage,Time,Artist';

test('RFC 4180 parser supports quoted commas, escaped quotes, and CRLF', () => {
    const rows = parseCSV(`${HEADER}\r\nFriday,2025-09-19,Riot Stage,\"12:30pm - 1:00pm\",\"The \"\"Great\"\" Band, Jr.\"\r\n`);
    assert.deepEqual(rows, [
        ['Day', 'Date', 'Stage', 'Time', 'Artist'],
        ['Friday', '2025-09-19', 'Riot Stage', '12:30pm - 1:00pm', 'The "Great" Band, Jr.']
    ]);
});

test('CSV parser rejects malformed quotes', () => {
    assert.throws(
        () => parseCSV(`${HEADER}\nFriday,2025-09-19,Riot Stage,12:30pm - 1:00pm,\"Unclosed`),
        /ended inside a quoted field/
    );
    assert.throws(
        () => parseCSV(`${HEADER}\nFriday,2025-09-19,Riot Stage,12:30pm - 1:00pm,The \"Band\"`),
        /Unexpected quote/
    );
});

test('schedule validation rejects short, empty, invalid-date, and invalid-time rows', () => {
    assert.throws(
        () => parseScheduleCSV(`${HEADER}\nFriday,2025-09-19,Riot Stage,12:30pm - 1:00pm`),
        /Row 2: Expected 5 fields/
    );
    assert.throws(
        () => parseScheduleCSV(`${HEADER}\nFriday,2025-09-19,,12:30pm - 1:00pm,Artist`),
        /Row 2: Missing value for stage/
    );
    assert.throws(
        () => parseScheduleCSV(`${HEADER}\nFriday,2025-02-30,Riot Stage,12:30pm - 1:00pm,Artist`),
        /Date must use a valid YYYY-MM-DD/
    );
    assert.throws(
        () => parseScheduleCSV(`${HEADER}\nFriday,2025-09-19,Riot Stage,25:30 - 26:00,Artist`),
        ScheduleDataError
    );
});

test('time parsing handles AM/PM, 24-hour time, implied periods, and overnight ranges', () => {
    assert.equal(parseClockTime('12:00am'), 0);
    assert.equal(parseClockTime('12:00pm'), 720);
    assert.equal(parseClockTime('23:15'), 1395);
    assert.deepEqual(parseTimeRange('3:05 - 3:35pm'), { start: 905, end: 935 });
    assert.deepEqual(parseTimeRange('11:30pm - 12:15am'), { start: 1410, end: 1455 });
});

test('schedule events sort by date, start time, stage, and artist', () => {
    const events = parseScheduleCSV([
        HEADER,
        'Saturday,2025-09-20,Z Stage,1:00pm - 2:00pm,Late Date',
        'Friday,2025-09-19,Z Stage,2:00pm - 3:00pm,Late Time',
        'Friday,2025-09-19,B Stage,1:00pm - 2:00pm,B Artist',
        'Friday,2025-09-19,A Stage,1:00pm - 2:00pm,Z Artist',
        'Friday,2025-09-19,A Stage,1:00pm - 2:00pm,A Artist'
    ].join('\n'));

    assert.deepEqual(events.map((event) => event.artist), [
        'A Artist', 'Z Artist', 'B Artist', 'Late Time', 'Late Date'
    ]);
});

test('live status compares both festival-local date and time', () => {
    const event = {
        date: '2025-09-19',
        startMinutes: 750,
        endMinutes: 780
    };

    assert.equal(getEventStatus(event, new Date('2025-09-18T17:45:00Z')), 'upcoming');
    assert.equal(getEventStatus(event, new Date('2025-09-19T17:45:00Z')), 'live');
    assert.equal(getEventStatus(event, new Date('2025-09-20T17:45:00Z')), 'finished');
});

test('live status uses inclusive start and exclusive end boundaries', () => {
    const event = {
        date: '2025-09-19',
        startMinutes: 750,
        endMinutes: 780
    };

    assert.equal(getEventStatus(event, new Date('2025-09-19T17:29:00Z')), 'upcoming');
    assert.equal(getEventStatus(event, new Date('2025-09-19T17:30:00Z')), 'live');
    assert.equal(getEventStatus(event, new Date('2025-09-19T17:59:00Z')), 'live');
    assert.equal(getEventStatus(event, new Date('2025-09-19T18:00:00Z')), 'finished');
});

test('Chicago timezone wins when the UTC calendar date differs', () => {
    const event = {
        date: '2025-09-19',
        startMinutes: 1380,
        endMinutes: 1439
    };
    assert.equal(getEventStatus(event, new Date('2025-09-20T04:30:00Z')), 'live');
});

test('overnight sets remain live after festival-local midnight', () => {
    const event = {
        date: '2025-09-19',
        startMinutes: 1410,
        endMinutes: 1455
    };
    assert.equal(getEventStatus(event, new Date('2025-09-20T05:10:00Z')), 'live');
    assert.equal(getEventStatus(event, new Date('2025-09-20T05:15:00Z')), 'finished');
});

test('URL day selection honors valid values, then festival-local current day, then first day', () => {
    const events = parseScheduleCSV([
        HEADER,
        'Friday,2025-09-19,Riot Stage,1:00pm - 2:00pm,One',
        'Saturday,2025-09-20,Riot Stage,1:00pm - 2:00pm,Two',
        'Sunday,2025-09-21,Riot Stage,1:00pm - 2:00pm,Three'
    ].join('\n'));
    const days = deriveFestivalDays(events);

    assert.equal(selectInitialDay(days, '?day=2', new Date('2026-01-01T12:00:00Z')), 2);
    assert.equal(selectInitialDay(days, '?day=4', new Date('2025-09-20T17:00:00Z')), 2);
    assert.equal(selectInitialDay(days, '', new Date('2026-01-01T12:00:00Z')), 1);
});
