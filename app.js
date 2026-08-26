'use strict';

const APP_VERSION = '1.5.0';
const FESTIVAL_TIME_ZONE = 'America/Chicago';
const FAVORITES_KEY = 'riot-festival-favorites';
const LAST_UPDATE_KEY = 'riot-festival-last-schedule-update';
const REQUIRED_COLUMNS = ['day', 'date', 'stage', 'time', 'artist'];

class ScheduleDataError extends Error {
    constructor(message, rowNumber = null) {
        super(rowNumber ? `Row ${rowNumber}: ${message}` : message);
        this.name = 'ScheduleDataError';
        this.rowNumber = rowNumber;
    }
}

function parseCSV(csvText) {
    if (typeof csvText !== 'string') {
        throw new ScheduleDataError('CSV input must be text.');
    }

    const text = csvText.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let quotedFieldClosed = false;

    const finishField = () => {
        row.push(field);
        field = '';
        quotedFieldClosed = false;
    };

    const finishRow = () => {
        finishField();
        if (row.some((value) => value.trim() !== '')) {
            rows.push(row);
        }
        row = [];
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (inQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                    quotedFieldClosed = true;
                }
            } else {
                field += character;
            }
            continue;
        }

        if (quotedFieldClosed) {
            if (character === ',') {
                finishField();
            } else if (character === '\n' || character === '\r') {
                if (character === '\r' && text[index + 1] === '\n') {
                    index += 1;
                }
                finishRow();
            } else if (character !== ' ' && character !== '\t') {
                throw new ScheduleDataError(`Unexpected character after a quoted field at line ${rows.length + 1}.`);
            }
            continue;
        }

        if (character === '"') {
            if (field.trim() !== '') {
                throw new ScheduleDataError(`Unexpected quote in an unquoted field at line ${rows.length + 1}.`);
            }
            field = '';
            inQuotes = true;
        } else if (character === ',') {
            finishField();
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && text[index + 1] === '\n') {
                index += 1;
            }
            finishRow();
        } else {
            field += character;
        }
    }

    if (inQuotes) {
        throw new ScheduleDataError('CSV ended inside a quoted field.');
    }

    if (field !== '' || row.length > 0 || quotedFieldClosed) {
        finishRow();
    }

    return rows;
}

function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseClockTime(value, impliedPeriod = null) {
    const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) {
        throw new ScheduleDataError(`Invalid time "${value}".`);
    }

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = match[3] ? match[3].toLowerCase() : impliedPeriod;

    if (minute > 59) {
        throw new ScheduleDataError(`Invalid time "${value}".`);
    }

    if (period) {
        if (hour < 1 || hour > 12) {
            throw new ScheduleDataError(`Invalid time "${value}".`);
        }
        if (period === 'am' && hour === 12) hour = 0;
        if (period === 'pm' && hour !== 12) hour += 12;
    } else if (hour > 23) {
        throw new ScheduleDataError(`Invalid time "${value}".`);
    }

    return hour * 60 + minute;
}

function parseTimeRange(value) {
    const match = String(value).trim().match(/^(.+?)\s+[-–]\s+(.+)$/);
    if (!match) {
        throw new ScheduleDataError(`Invalid time range "${value}".`);
    }

    const startText = match[1].trim();
    const endText = match[2].trim();
    const startPeriodMatch = startText.match(/(am|pm)$/i);
    const endPeriodMatch = endText.match(/(am|pm)$/i);
    const startPeriod = startPeriodMatch ? startPeriodMatch[1].toLowerCase() : null;
    const endPeriod = endPeriodMatch ? endPeriodMatch[1].toLowerCase() : null;
    const start = parseClockTime(startText, endPeriod);
    let end = parseClockTime(endText, startPeriod);

    if (end <= start) {
        end += 24 * 60;
    }

    return { start, end };
}

function parseScheduleCSV(csvText) {
    const matrix = parseCSV(csvText);
    if (matrix.length === 0) {
        throw new ScheduleDataError('The schedule is empty.');
    }

    const headers = matrix[0].map((header) => header.trim().toLowerCase());
    const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missingColumns.length > 0) {
        throw new ScheduleDataError(`Missing required column${missingColumns.length > 1 ? 's' : ''}: ${missingColumns.join(', ')}.`);
    }

    if (new Set(headers).size !== headers.length) {
        throw new ScheduleDataError('Column names must be unique.');
    }

    const events = [];
    for (let index = 1; index < matrix.length; index += 1) {
        const values = matrix[index];
        const rowNumber = index + 1;
        if (values.length !== headers.length) {
            throw new ScheduleDataError(`Expected ${headers.length} fields but found ${values.length}.`, rowNumber);
        }

        const row = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex].trim()]));
        const missingValues = REQUIRED_COLUMNS.filter((column) => row[column] === '');
        if (missingValues.length > 0) {
            throw new ScheduleDataError(`Missing value for ${missingValues.join(', ')}.`, rowNumber);
        }
        if (!isValidISODate(row.date)) {
            throw new ScheduleDataError('Date must use a valid YYYY-MM-DD value.', rowNumber);
        }

        let timeRange;
        try {
            timeRange = parseTimeRange(row.time);
        } catch (error) {
            throw new ScheduleDataError(error.message, rowNumber);
        }

        events.push({
            artist: row.artist,
            date: row.date,
            dayLabel: row.day,
            endMinutes: timeRange.end,
            stage: row.stage,
            startMinutes: timeRange.start,
            time: row.time
        });
    }

    events.sort((first, second) => (
        first.date.localeCompare(second.date)
        || first.startMinutes - second.startMinutes
        || first.stage.localeCompare(second.stage)
        || first.artist.localeCompare(second.artist)
    ));
    return events;
}

function formatFestivalDate(isoDate) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${isoDate}T12:00:00Z`));
}

function deriveFestivalDays(events) {
    return Array.from(new Set(events.map((event) => event.date)))
        .sort()
        .map((date, index) => ({
            date,
            events: events.filter((event) => event.date === date),
            id: index + 1,
            label: formatFestivalDate(date),
            name: `Day ${index + 1}`
        }));
}

function getZonedDateTime(date, timeZone = FESTIVAL_TIME_ZONE) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        timeZone,
        year: 'numeric'
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
}

function getEventStatus(event, now = new Date(), timeZone = FESTIVAL_TIME_ZONE) {
    const localNow = getZonedDateTime(now, timeZone);
    const currentDayNumber = Date.parse(`${localNow.date}T00:00:00Z`) / (24 * 60 * 60 * 1000);
    const eventDayNumber = Date.parse(`${event.date}T00:00:00Z`) / (24 * 60 * 60 * 1000);
    const festivalRelativeMinutes = (currentDayNumber - eventDayNumber) * 24 * 60 + localNow.minutes;
    if (festivalRelativeMinutes < event.startMinutes) return 'upcoming';
    if (festivalRelativeMinutes >= event.endMinutes) return 'finished';
    return 'live';
}

function selectInitialDay(days, search = '', now = new Date(), timeZone = FESTIVAL_TIME_ZONE) {
    const requestedDay = Number(new URLSearchParams(search).get('day'));
    if (Number.isInteger(requestedDay) && days.some((day) => day.id === requestedDay)) {
        return requestedDay;
    }

    const localDate = getZonedDateTime(now, timeZone).date;
    const currentFestivalDay = days.find((day) => day.date === localDate);
    return currentFestivalDay ? currentFestivalDay.id : (days[0] ? days[0].id : null);
}

function formatMinutes(totalMinutes) {
    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function makeElement(tagName, className = '', text = '') {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

class ConcertScheduleApp {
    constructor() {
        this.currentDay = null;
        this.currentStageFilter = 'all';
        this.days = [];
        this.events = [];
        this.favorites = new Set();
        this.timeUpdateInterval = null;
        this.deferredInstallPrompt = null;
        this.dialogPreviouslyFocused = null;
        this.toastTimeout = null;
    }

    init() {
        this.loadFavorites();
        this.bindEvents();
        this.setupInstallPrompt();
        this.updateConnectionStatus();
        this.updateLastUpdateDisplay();
        this.registerServiceWorker();
        this.loadScheduleData();
        this.startTimeUpdates();
    }

    bindEvents() {
        document.getElementById('day-navigation').addEventListener('click', (event) => {
            const button = event.target.closest('[data-day]');
            if (button) this.switchDay(Number(button.dataset.day));
        });

        document.getElementById('stage-filters').addEventListener('click', (event) => {
            const button = event.target.closest('[data-stage]');
            if (button) this.setStageFilter(button.dataset.stage);
        });

        document.getElementById('schedule-content').addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="toggle-favorite"]');
            if (button) this.toggleFavorite(button.dataset.artist);
        });

        document.getElementById('about-button').addEventListener('click', () => this.showAbout());
        document.getElementById('close-about').addEventListener('click', () => this.hideAbout());
        document.getElementById('about-dialog').addEventListener('click', (event) => {
            if (event.target.id === 'about-dialog') this.hideAbout();
        });
        document.addEventListener('keydown', (event) => this.handleDialogKeydown(event));

        document.getElementById('check-updates-button').addEventListener('click', () => this.checkForUpdates());
        document.getElementById('clear-favorites-button').addEventListener('click', () => this.clearFavorites());
        document.getElementById('now-button').addEventListener('click', () => this.scrollToLiveEvent());
        document.getElementById('install-button').addEventListener('click', () => this.installApp());
        document.getElementById('dismiss-install').addEventListener('click', () => this.hideInstallPromotion());

        window.addEventListener('online', () => this.updateConnectionStatus());
        window.addEventListener('offline', () => this.updateConnectionStatus());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopTimeUpdates();
            else this.startTimeUpdates();
        });
    }

    async loadScheduleData({ manual = false } = {}) {
        const scheduleContent = document.getElementById('schedule-content');
        const updateButton = document.getElementById('check-updates-button');
        if (manual) {
            updateButton.disabled = true;
            updateButton.textContent = 'Checking…';
        }
        if (this.events.length === 0) scheduleContent.setAttribute('aria-busy', 'true');

        try {
            const response = await fetch('sample-schedule.csv', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Schedule request returned ${response.status}.`);
            const source = response.headers.get('X-Riot-Schedule-Source') || 'network';
            const events = parseScheduleCSV(await response.text());
            if (events.length === 0) throw new ScheduleDataError('The schedule has no event rows.');

            const previousDate = this.days.find((day) => day.id === this.currentDay)?.date;
            this.events = events;
            this.days = deriveFestivalDays(events);
            const matchingDay = this.days.find((day) => day.date === previousDate);
            this.currentDay = matchingDay
                ? matchingDay.id
                : selectInitialDay(this.days, window.location.search);

            if (source === 'network') {
                localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
                this.updateLastUpdateDisplay();
            }

            this.renderDayNavigation();
            this.renderStageFilters();
            this.renderCurrentDay();
            scheduleContent.setAttribute('aria-busy', 'false');

            if (manual) {
                const message = source === 'cache'
                    ? 'You are offline. Showing the last saved schedule.'
                    : 'Schedule is up to date.';
                this.showNotification(message, source === 'cache' ? 'warning' : 'success');
            } else if (source === 'cache') {
                this.showNotification('Offline: showing the last saved schedule.', 'warning');
            }
        } catch (error) {
            console.error('Unable to load schedule:', error);
            if (this.events.length === 0) {
                this.renderState(
                    navigator.onLine ? 'Schedule unavailable' : 'You are offline',
                    navigator.onLine
                        ? 'The schedule could not be loaded. Try checking for updates.'
                        : 'Connect once to download the schedule for offline use.',
                    'error'
                );
            }
            if (manual) this.showNotification(`Update check failed: ${error.message}`, 'error');
        } finally {
            scheduleContent.setAttribute('aria-busy', 'false');
            if (manual) {
                updateButton.disabled = false;
                updateButton.textContent = 'Check for schedule updates';
            }
            this.updateConnectionStatus();
        }
    }

    async checkForUpdates() {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                try {
                    await registration.update();
                } catch (error) {
                    console.warn('Service worker update check failed:', error);
                }
            }
        }
        await this.loadScheduleData({ manual: true });
    }

    renderState(title, message, type = 'empty') {
        const container = document.getElementById('schedule-content');
        const state = makeElement('div', `state-message state-${type}`);
        state.appendChild(makeElement('h3', '', title));
        state.appendChild(makeElement('p', '', message));
        container.replaceChildren(state);
    }

    renderDayNavigation() {
        const navigation = document.getElementById('day-navigation');
        const fragment = document.createDocumentFragment();
        this.days.forEach((day) => {
            const button = makeElement('button', 'nav-item');
            button.type = 'button';
            button.dataset.day = String(day.id);
            button.setAttribute('aria-label', `${day.name}, ${day.label}`);
            button.appendChild(makeElement('span', 'nav-day', day.name));
            button.appendChild(makeElement('span', 'nav-date', new Intl.DateTimeFormat('en-US', {
                month: 'short', day: 'numeric', timeZone: 'UTC'
            }).format(new Date(`${day.date}T12:00:00Z`))));
            fragment.appendChild(button);
        });
        navigation.replaceChildren(fragment);
        this.updateDayControls();
    }

    updateDayControls() {
        document.querySelectorAll('[data-day]').forEach((button) => {
            const active = Number(button.dataset.day) === this.currentDay;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    renderStageFilters() {
        const container = document.getElementById('stage-filters');
        const stages = Array.from(new Set(this.events.map((event) => event.stage))).sort();
        const filters = [
            { id: 'all', label: 'All stages' },
            { id: 'favorites', label: '★ Favorites' },
            ...stages.map((stage) => ({ id: stage, label: stage }))
        ];
        if (!filters.some((filter) => filter.id === this.currentStageFilter)) {
            this.currentStageFilter = 'all';
        }

        const fragment = document.createDocumentFragment();
        filters.forEach((filter) => {
            const button = makeElement('button', 'stage-filter', filter.label);
            button.type = 'button';
            button.dataset.stage = filter.id;
            button.setAttribute('aria-pressed', String(filter.id === this.currentStageFilter));
            button.classList.toggle('active', filter.id === this.currentStageFilter);
            fragment.appendChild(button);
        });
        container.replaceChildren(fragment);
    }

    switchDay(dayId) {
        if (!this.days.some((day) => day.id === dayId)) return;
        this.currentDay = dayId;
        const url = new URL(window.location.href);
        url.searchParams.set('day', String(dayId));
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        this.updateDayControls();
        this.renderCurrentDay();
        document.getElementById('current-day').focus({ preventScroll: true });
    }

    setStageFilter(stage) {
        this.currentStageFilter = stage;
        document.querySelectorAll('[data-stage]').forEach((button) => {
            const active = button.dataset.stage === stage;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        this.renderSchedule();
    }

    renderCurrentDay() {
        const day = this.days.find((candidate) => candidate.id === this.currentDay);
        if (!day) {
            this.renderState('No festival days found', 'The schedule does not contain any dated events.', 'empty');
            return;
        }
        const dayHeading = document.getElementById('current-day');
        dayHeading.textContent = day.name;
        dayHeading.tabIndex = -1;
        document.getElementById('current-date').textContent = day.label;
        this.renderSchedule();
    }

    renderSchedule() {
        const day = this.days.find((candidate) => candidate.id === this.currentDay);
        if (!day) return;

        let events = day.events;
        if (this.currentStageFilter === 'favorites') {
            events = events.filter((event) => this.isFavorite(event.artist));
        } else if (this.currentStageFilter !== 'all') {
            events = events.filter((event) => event.stage === this.currentStageFilter);
        }

        if (events.length === 0) {
            const favoritesSelected = this.currentStageFilter === 'favorites';
            this.renderState(
                favoritesSelected ? 'No favorites on this day' : 'No events match this stage',
                favoritesSelected
                    ? 'Use the star buttons to add artists to this view.'
                    : 'Choose another stage or show all stages.',
                'empty'
            );
            this.updateNowButton();
            return;
        }

        const groups = new Map();
        events.forEach((event) => {
            if (!groups.has(event.startMinutes)) groups.set(event.startMinutes, []);
            groups.get(event.startMinutes).push(event);
        });

        const container = document.getElementById('schedule-content');
        const fragment = document.createDocumentFragment();
        groups.forEach((groupEvents, startMinutes) => {
            const section = makeElement('section', 'time-group');
            const heading = makeElement('h3', 'time-group-heading', formatMinutes(startMinutes));
            section.appendChild(heading);

            const rows = makeElement('div', 'event-list');
            groupEvents.forEach((event) => rows.appendChild(this.createEventRow(event)));
            section.appendChild(rows);
            fragment.appendChild(section);
        });
        container.replaceChildren(fragment);
        this.updateNowButton();
    }

    createEventRow(event) {
        const status = getEventStatus(event);
        const eventId = `${event.date}|${event.startMinutes}|${event.stage}|${event.artist}`;
        const row = makeElement('article', `event-row status-${status}`);
        row.dataset.eventId = eventId;
        if (status === 'live') row.classList.add('live');

        const details = makeElement('div', 'event-details');
        details.appendChild(makeElement('h4', 'event-artist', event.artist));
        const metadata = makeElement('p', 'event-metadata');
        metadata.appendChild(makeElement('span', 'event-stage', event.stage));
        metadata.appendChild(makeElement('span', 'metadata-separator', '•'));
        metadata.appendChild(makeElement('span', 'event-end', `Ends ${formatMinutes(event.endMinutes)}`));
        details.appendChild(metadata);

        const actions = makeElement('div', 'event-actions');
        const statusLabel = status === 'live' ? 'Live now' : status === 'finished' ? 'Finished' : 'Upcoming';
        actions.appendChild(makeElement('span', `event-status ${status}`, statusLabel));

        const favorite = makeElement('button', 'favorite-button', this.isFavorite(event.artist) ? '★' : '☆');
        favorite.type = 'button';
        favorite.dataset.action = 'toggle-favorite';
        favorite.dataset.artist = event.artist;
        favorite.dataset.eventId = eventId;
        favorite.classList.toggle('favorited', this.isFavorite(event.artist));
        favorite.setAttribute('aria-pressed', String(this.isFavorite(event.artist)));
        favorite.setAttribute('aria-label', `${this.isFavorite(event.artist) ? 'Remove' : 'Add'} ${event.artist} ${this.isFavorite(event.artist) ? 'from' : 'to'} favorites`);
        actions.appendChild(favorite);

        row.appendChild(details);
        row.appendChild(actions);
        return row;
    }

    updateNowButton() {
        const button = document.getElementById('now-button');
        const day = this.days.find((candidate) => candidate.id === this.currentDay);
        const today = getZonedDateTime(new Date()).date;
        const hasLiveEvent = Boolean(document.querySelector('.event-row.live'));
        button.hidden = !day || day.date !== today || !hasLiveEvent;
    }

    scrollToLiveEvent() {
        const liveEvent = document.querySelector('.event-row.live');
        if (liveEvent) {
            liveEvent.scrollIntoView({ behavior: 'smooth', block: 'center' });
            liveEvent.setAttribute('tabindex', '-1');
            liveEvent.focus({ preventScroll: true });
        }
    }

    startTimeUpdates() {
        if (this.timeUpdateInterval) return;
        this.timeUpdateInterval = window.setInterval(() => this.refreshTimeStatuses(), 60 * 1000);
    }

    stopTimeUpdates() {
        if (!this.timeUpdateInterval) return;
        window.clearInterval(this.timeUpdateInterval);
        this.timeUpdateInterval = null;
    }

    refreshTimeStatuses() {
        const activeElement = document.activeElement;
        const focusedEventId = activeElement?.dataset?.eventId;
        this.renderSchedule();
        if (focusedEventId) {
            const matchingButton = Array.from(document.querySelectorAll('[data-event-id]'))
                .find((element) => element.dataset.eventId === focusedEventId && element.matches('button'));
            if (matchingButton) matchingButton.focus({ preventScroll: true });
        }
    }

    loadFavorites() {
        try {
            const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
            this.favorites = new Set(Array.isArray(saved) ? saved.filter((artist) => typeof artist === 'string') : []);
        } catch (error) {
            console.warn('Favorites could not be read:', error);
            this.favorites = new Set();
        }
    }

    saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(this.favorites)));
    }

    isFavorite(artist) {
        return this.favorites.has(artist);
    }

    toggleFavorite(artist) {
        const removing = this.isFavorite(artist);
        if (removing) this.favorites.delete(artist);
        else this.favorites.add(artist);
        this.saveFavorites();
        this.renderSchedule();

        const replacement = Array.from(document.querySelectorAll('[data-action="toggle-favorite"]'))
            .find((button) => button.dataset.artist === artist);
        if (replacement) replacement.focus({ preventScroll: true });
        else Array.from(document.querySelectorAll('[data-stage]'))
            .find((button) => button.dataset.stage === this.currentStageFilter)
            ?.focus({ preventScroll: true });
        this.announce(`${artist} ${removing ? 'removed from' : 'added to'} favorites.`);
    }

    clearFavorites() {
        if (this.favorites.size === 0) {
            this.showNotification('There are no favorites to clear.', 'info');
            return;
        }
        if (!window.confirm('Clear all favorite artists from this device?')) return;
        this.favorites.clear();
        this.saveFavorites();
        this.renderSchedule();
        this.showNotification('All favorites cleared.', 'success');
    }

    updateConnectionStatus() {
        const online = navigator.onLine;
        const label = online ? 'Online' : 'Offline';
        document.getElementById('network-status').classList.toggle('offline', !online);
        document.getElementById('network-status-text').textContent = label;
        document.getElementById('dialog-network-status').textContent = `Network: ${label}`;
    }

    updateLastUpdateDisplay() {
        const stored = localStorage.getItem(LAST_UPDATE_KEY);
        let label = 'No successful network update recorded';
        if (stored) {
            const date = new Date(stored);
            if (!Number.isNaN(date.getTime())) {
                label = `Last network update: ${new Intl.DateTimeFormat('en-US', {
                    dateStyle: 'medium', timeStyle: 'short'
                }).format(date)}`;
            }
        }
        document.getElementById('last-update').textContent = label;
        document.getElementById('dialog-last-update').textContent = label;
    }

    showAbout() {
        const backdrop = document.getElementById('about-dialog');
        this.dialogPreviouslyFocused = document.activeElement;
        backdrop.hidden = false;
        document.body.classList.add('dialog-open');
        window.requestAnimationFrame(() => document.getElementById('close-about').focus());
    }

    hideAbout() {
        const backdrop = document.getElementById('about-dialog');
        if (backdrop.hidden) return;
        backdrop.hidden = true;
        document.body.classList.remove('dialog-open');
        if (this.dialogPreviouslyFocused?.isConnected) this.dialogPreviouslyFocused.focus();
        this.dialogPreviouslyFocused = null;
    }

    handleDialogKeydown(event) {
        const backdrop = document.getElementById('about-dialog');
        if (backdrop.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.hideAbout();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = Array.from(backdrop.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (focusable.length === 0) {
            event.preventDefault();
            backdrop.querySelector('[role="dialog"]').focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            if (!window.matchMedia('(display-mode: standalone)').matches) {
                document.getElementById('install-promotion').hidden = false;
            }
        });
        window.addEventListener('appinstalled', () => {
            this.deferredInstallPrompt = null;
            this.hideInstallPromotion();
            this.showNotification('Riot Fest Schedule installed.', 'success');
        });
    }

    async installApp() {
        if (!this.deferredInstallPrompt) return;
        this.deferredInstallPrompt.prompt();
        await this.deferredInstallPrompt.userChoice;
        this.deferredInstallPrompt = null;
        this.hideInstallPromotion();
    }

    hideInstallPromotion() {
        document.getElementById('install-promotion').hidden = true;
    }

    announce(message) {
        const region = document.getElementById('app-status');
        region.textContent = '';
        window.setTimeout(() => { region.textContent = message; }, 10);
    }

    showNotification(message, type = 'info') {
        this.announce(message);
        const toast = document.getElementById('toast');
        window.clearTimeout(this.toastTimeout);
        toast.textContent = message;
        toast.className = `toast toast-${type}`;
        toast.hidden = false;
        this.toastTimeout = window.setTimeout(() => { toast.hidden = true; }, 4000);
    }

    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (error) {
            console.warn('Offline support could not be registered:', error);
        }
    }
}

const exported = {
    APP_VERSION,
    ConcertScheduleApp,
    FESTIVAL_TIME_ZONE,
    ScheduleDataError,
    deriveFestivalDays,
    formatMinutes,
    getEventStatus,
    getZonedDateTime,
    isValidISODate,
    parseCSV,
    parseClockTime,
    parseScheduleCSV,
    parseTimeRange,
    selectInitialDay
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.concertApp = new ConcertScheduleApp();
        window.concertApp.init();
    });
}
