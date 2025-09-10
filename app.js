// Concert Schedule PWA
class ConcertScheduleApp {
    constructor() {
        this.currentDay = 1;
        this.scheduleData = [];
        this.currentStageFilter = 'all';
        this.availableStages = new Set();
        this.timeUpdateInterval = null;
        this.favorites = new Set();
        this.days = [
            { id: 1, name: 'Day 1', date: 'Friday, June 14' },
            { id: 2, name: 'Day 2', date: 'Saturday, June 15' },
            { id: 3, name: 'Day 3', date: 'Sunday, June 16' }
        ];
        
        this.init();
    }

    init() {
        this.loadFavorites();
        this.setupEventListeners();
        this.loadScheduleData();
        this.startTimeUpdates();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        // Bottom navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const day = e.currentTarget.dataset.day;
                const action = e.currentTarget.dataset.action;
                
                if (day) {
                    this.switchDay(parseInt(day));
                } else if (action === 'map') {
                    this.showMap();
                }
            });
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseTimeUpdates();
            } else {
                this.resumeTimeUpdates();
            }
        });
    }

    async loadScheduleData() {
        try {
            const response = await fetch('sample-schedule.csv');
            if (!response.ok) {
                throw new Error('Failed to fetch schedule data');
            }
            
            const csvText = await response.text();
            const csvData = this.parseCSV(csvText);
            this.scheduleData = this.processScheduleData(csvData);
            this.renderStageFilters();
            this.renderSchedule();
            console.log('Schedule data loaded successfully');
            
            // Now trigger the initial auto-scroll after data is loaded
            this.updateNowPlayingStatus();
        } catch (error) {
            console.error('Error loading schedule data:', error);
            this.loadSampleData(); // Fallback to sample data
            this.renderSchedule();
            this.showNotification('Using sample data - check console for details', 'warning');
            
            // Trigger auto-scroll for fallback data too
            this.updateNowPlayingStatus();
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    row[header.toLowerCase()] = values[index] || '';
                });
                data.push(row);
            }
        }

        return data;
    }

    processScheduleData(csvData) {
        const processed = { 1: [], 2: [], 3: [] };
        
        csvData.forEach(row => {
            // Map the new CSV format to our internal structure
            const dayName = row.day || row.Day || '';
            const dayNumber = this.getDayNumber(dayName);
            
            const event = {
                time: row.time || row.Time || '',
                title: row.artist || row.Artist || '',
                stage: row.stage || row.Stage || '',
                description: row.description || row.Description || '',
                day: dayNumber,
                date: row.date || row.Date || ''
            };

            if (event.day >= 1 && event.day <= 3) {
                processed[event.day].push(event);
                // Add stage to available stages set
                if (event.stage) {
                    this.availableStages.add(event.stage);
                }
            }
        });

        // Sort events by time
        Object.keys(processed).forEach(day => {
            processed[day].sort((a, b) => this.compareTimes(a.time, b.time));
        });

        return processed;
    }

    getDayNumber(dayName) {
        const dayMap = {
            'friday': 1,
            'saturday': 2,
            'sunday': 3,
            'day 1': 1,
            'day 2': 2,
            'day 3': 3,
            '1': 1,
            '2': 2,
            '3': 3
        };
        
        return dayMap[dayName.toLowerCase()] || 1;
    }

    compareTimes(timeA, timeB) {
        const parseTime = (time) => {
            // Handle time ranges like "7:00pm - 8:00pm" or "3:05 - 3:35"
            const timeStr = time.split(' - ')[0] || time;
            
            if (!timeStr) return 0;
            
            // Handle AM/PM format like "7:00pm" or "12:30am"
            if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
                const timePart = timeStr.toLowerCase().replace(/\s*(am|pm)/, '');
                const period = timeStr.toLowerCase().includes('pm') ? 'pm' : 'am';
                
                if (timePart.includes(':')) {
                    const [hours, minutes] = timePart.split(':');
                    let hour = parseInt(hours);
                    const minute = parseInt(minutes || 0);
                    
                    // Convert to 24-hour format
                    if (period === 'pm' && hour !== 12) {
                        hour += 12;
                    } else if (period === 'am' && hour === 12) {
                        hour = 0;
                    }
                    
                    return hour * 60 + minute;
                }
            }
            // Handle 24-hour format like "3:05" or "15:30"
            else if (timeStr.includes(':')) {
                const [hours, minutes] = timeStr.split(':');
                return parseInt(hours) * 60 + parseInt(minutes || 0);
            }
            // Handle "3:05 PM" format (with space)
            else if (timeStr.includes(' ')) {
                const [timePart, period] = timeStr.split(' ');
                const [hours, minutes] = timePart.split(':');
                let hour = parseInt(hours);
                if (period === 'PM' && hour !== 12) hour += 12;
                if (period === 'AM' && hour === 12) hour = 0;
                return hour * 60 + parseInt(minutes || 0);
            }
            
            return 0;
        };

        return parseTime(timeA) - parseTime(timeB);
    }

    parseTimeRange(timeRange) {
        // Parse time range like "7:00pm - 8:00pm" or "3:05 - 3:35"
        const [startTime, endTime] = timeRange.split(' - ');
        
        const parseTime = (timeStr) => {
            if (!timeStr) return 0;
            
            // Handle AM/PM format like "7:00pm" or "12:30am"
            if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
                const timePart = timeStr.toLowerCase().replace(/\s*(am|pm)/, '');
                const period = timeStr.toLowerCase().includes('pm') ? 'pm' : 'am';
                
                if (timePart.includes(':')) {
                    const [hours, minutes] = timePart.split(':');
                    let hour = parseInt(hours);
                    const minute = parseInt(minutes || 0);
                    
                    // Convert to 24-hour format
                    if (period === 'pm' && hour !== 12) {
                        hour += 12;
                    } else if (period === 'am' && hour === 12) {
                        hour = 0;
                    }
                    
                    return hour * 60 + minute;
                }
            }
            // Handle 24-hour format like "3:05" or "15:30"
            else if (timeStr.includes(':')) {
                const [hours, minutes] = timeStr.split(':');
                return parseInt(hours) * 60 + parseInt(minutes || 0);
            }
            
            return 0;
        };

        return {
            start: parseTime(startTime),
            end: parseTime(endTime)
        };
    }

    getCurrentTimeInMinutes() {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    }

    isEventCurrentlyPlaying(event) {
        if (!event.time || !event.time.includes(' - ')) {
            return false;
        }

        const timeRange = this.parseTimeRange(event.time);
        const currentTime = this.getCurrentTimeInMinutes();
        
        const isPlaying = currentTime >= timeRange.start && currentTime <= timeRange.end;
        
        // Debug logging
        if (isPlaying) {
            console.log('Currently playing:', event.title, 'at', event.time, 
                       'Current time:', currentTime, 'Range:', timeRange.start, '-', timeRange.end);
        }
        
        return isPlaying;
    }

    getCurrentlyPlayingEvents(events) {
        return events.filter(event => this.isEventCurrentlyPlaying(event));
    }

    startTimeUpdates() {
        // Update every minute
        this.timeUpdateInterval = setInterval(() => {
            this.updateNowPlayingStatus();
        }, 60000); // 60 seconds

        // Don't do initial update here - wait for schedule data to load
        console.log('Time updates started, waiting for schedule data to load...');
    }

    updateNowPlayingStatus() {
        // Re-render schedule to update "now playing" status
        this.renderSchedule();
        
        // Use requestAnimationFrame to ensure DOM is fully updated before scrolling
        requestAnimationFrame(() => {
            // Double-check with another requestAnimationFrame for extra safety
            requestAnimationFrame(() => {
                this.autoScrollToNowPlaying();
            });
        });
    }

    autoScrollToNowPlaying() {
        // Only auto-scroll if there are currently playing events
        const nowPlayingCards = document.querySelectorAll('.event-card.now-playing');
        console.log('Auto-scroll: Found', nowPlayingCards.length, 'now playing events');
        
        // Debug: Check all event cards to see if any have the now-playing class
        const allEventCards = document.querySelectorAll('.event-card');
        console.log('Total event cards found:', allEventCards.length);
        
        // Check which events should be playing
        const currentDayEvents = this.scheduleData[this.currentDay] || [];
        const currentlyPlayingEvents = this.getCurrentlyPlayingEvents(currentDayEvents);
        console.log('Events that should be playing:', currentlyPlayingEvents.length);
        
        if (nowPlayingCards.length > 0) {
            // Scroll to the first currently playing event
            const firstNowPlaying = nowPlayingCards[0];
            console.log('Auto-scrolling to:', firstNowPlaying.querySelector('.event-title').textContent);
            
            // Try different scroll methods for better compatibility
            try {
                // Method 1: scrollIntoView with options
                firstNowPlaying.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                });
            } catch (error) {
                console.log('scrollIntoView failed, trying alternative method');
                // Method 2: Manual scroll calculation
                const rect = firstNowPlaying.getBoundingClientRect();
                const scrollTop = window.pageYOffset + rect.top - (window.innerHeight / 2);
                window.scrollTo({
                    top: scrollTop,
                    behavior: 'smooth'
                });
            }
        } else {
            console.log('No currently playing events found in DOM');
            console.log('But we know these events should be playing:', currentlyPlayingEvents.map(e => e.title));
        }
    }

    pauseTimeUpdates() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    resumeTimeUpdates() {
        if (!this.timeUpdateInterval) {
            this.startTimeUpdates();
        }
    }

    cleanup() {
        // Clean up intervals when app is destroyed
        this.pauseTimeUpdates();
    }

    // Favorites functionality
    loadFavorites() {
        try {
            const savedFavorites = localStorage.getItem('riot-festival-favorites');
            if (savedFavorites) {
                const favoritesArray = JSON.parse(savedFavorites);
                this.favorites = new Set(favoritesArray);
                console.log('Loaded favorites:', this.favorites.size, 'artists');
            }
        } catch (error) {
            console.error('Error loading favorites:', error);
            this.favorites = new Set();
        }
    }

    saveFavorites() {
        try {
            const favoritesArray = Array.from(this.favorites);
            localStorage.setItem('riot-festival-favorites', JSON.stringify(favoritesArray));
            console.log('Saved favorites:', favoritesArray.length, 'artists');
        } catch (error) {
            console.error('Error saving favorites:', error);
        }
    }

    toggleFavorite(artistName) {
        if (this.favorites.has(artistName)) {
            this.favorites.delete(artistName);
            console.log('Removed from favorites:', artistName);
        } else {
            this.favorites.add(artistName);
            console.log('Added to favorites:', artistName);
        }
        
        this.saveFavorites();
        this.renderSchedule(); // Re-render to update star states
    }

    isFavorite(artistName) {
        return this.favorites.has(artistName);
    }

    loadSampleData() {
        // Sample data for demonstration
        this.scheduleData = {
            1: [
                {
                    time: '6:00 PM',
                    title: 'Opening Ceremony',
                    stage: 'Main Stage',
                    description: 'Welcome to Riot Festival 2024!'
                },
                {
                    time: '6:30 PM',
                    title: 'The Electric Storm',
                    stage: 'Main Stage',
                    description: 'High-energy rock performance'
                },
                {
                    time: '6:30 PM',
                    title: 'Acoustic Dreams',
                    stage: 'Garden Stage',
                    description: 'Intimate acoustic set'
                },
                {
                    time: '7:30 PM',
                    title: 'Neon Nights',
                    stage: 'Electronic Tent',
                    description: 'Electronic dance music showcase'
                },
                {
                    time: '8:00 PM',
                    title: 'Thunder Road',
                    stage: 'Main Stage',
                    description: 'Classic rock revival'
                },
                {
                    time: '9:00 PM',
                    title: 'Midnight Express',
                    stage: 'Main Stage',
                    description: 'Headlining performance'
                }
            ],
            2: [
                {
                    time: '5:00 PM',
                    title: 'Sunset Sessions',
                    stage: 'Garden Stage',
                    description: 'Chill vibes and acoustic melodies'
                },
                {
                    time: '6:00 PM',
                    title: 'Digital Revolution',
                    stage: 'Electronic Tent',
                    description: 'Cutting-edge electronic music'
                },
                {
                    time: '6:30 PM',
                    title: 'Rock Legends',
                    stage: 'Main Stage',
                    description: 'Tribute to rock greats'
                },
                {
                    time: '7:30 PM',
                    title: 'Jazz Fusion',
                    stage: 'Garden Stage',
                    description: 'Modern jazz with electronic elements'
                },
                {
                    time: '8:30 PM',
                    title: 'The Final Countdown',
                    stage: 'Main Stage',
                    description: 'Epic closing performance'
                }
            ],
            3: [
                {
                    time: '4:00 PM',
                    title: 'Sunday Brunch Beats',
                    stage: 'Garden Stage',
                    description: 'Relaxed Sunday afternoon vibes'
                },
                {
                    time: '5:00 PM',
                    title: 'Indie Showcase',
                    stage: 'Main Stage',
                    description: 'Up-and-coming indie artists'
                },
                {
                    time: '6:00 PM',
                    title: 'Ambient Journey',
                    stage: 'Electronic Tent',
                    description: 'Atmospheric electronic soundscapes'
                },
                {
                    time: '7:00 PM',
                    title: 'Farewell Symphony',
                    stage: 'Main Stage',
                    description: 'Grand finale performance'
                }
            ]
        };
    }

    switchDay(day) {
        if (day < 1 || day > 3) return;

        this.currentDay = day;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-day="${day}"]`).classList.add('active');

        // Update header
        const dayInfo = this.days[day - 1];
        document.getElementById('current-day').textContent = dayInfo.name;
        document.getElementById('current-date').textContent = dayInfo.date;

        // Render schedule
        this.renderSchedule();
    }

    renderStageFilters() {
        const container = document.getElementById('stage-filters');
        if (!container) return;

        // Create "All" button
        const allButton = document.createElement('button');
        allButton.className = 'stage-filter-btn stage-filter-all active';
        allButton.textContent = 'All Stages';
        allButton.dataset.stage = 'all';
        allButton.addEventListener('click', () => this.setStageFilter('all'));

        // Create "Favorites" button
        const favoritesButton = document.createElement('button');
        favoritesButton.className = 'stage-filter-btn stage-filter-favorites';
        favoritesButton.innerHTML = '⭐ Favorites';
        favoritesButton.dataset.stage = 'favorites';
        favoritesButton.addEventListener('click', () => this.setStageFilter('favorites'));

        container.innerHTML = '';
        container.appendChild(allButton);
        container.appendChild(favoritesButton);

        // Create stage buttons
        const sortedStages = Array.from(this.availableStages).sort();
        sortedStages.forEach(stage => {
            const button = document.createElement('button');
            button.className = 'stage-filter-btn';
            button.textContent = stage;
            button.dataset.stage = stage;
            button.addEventListener('click', () => this.setStageFilter(stage));
            container.appendChild(button);
        });
    }

    setStageFilter(stage) {
        this.currentStageFilter = stage;
        
        // Update button states
        document.querySelectorAll('.stage-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-stage="${stage}"]`).classList.add('active');
        
        // Re-render schedule with filter
        this.renderSchedule();
    }

    renderSchedule() {
        const container = document.getElementById('schedule-content');
        const dayEvents = this.scheduleData[this.currentDay] || [];

        if (dayEvents.length === 0) {
            container.innerHTML = '<div class="loading">No events scheduled for this day.</div>';
            return;
        }

        // Filter events by stage or favorites
        let filteredEvents = dayEvents;
        if (this.currentStageFilter === 'favorites') {
            filteredEvents = dayEvents.filter(event => this.isFavorite(event.title));
        } else if (this.currentStageFilter !== 'all') {
            filteredEvents = dayEvents.filter(event => event.stage === this.currentStageFilter);
        }

        if (filteredEvents.length === 0) {
            if (this.currentStageFilter === 'favorites') {
                container.innerHTML = '<div class="loading">No favorite artists playing on this day. Star some artists to see them here!</div>';
            } else {
                container.innerHTML = `<div class="loading">No events on ${this.currentStageFilter} for this day.</div>`;
            }
            return;
        }

        // Group events by time
        const timeGroups = this.groupEventsByTime(filteredEvents);

        container.innerHTML = timeGroups.map(group => `
            <div class="time-group">
                <div class="time-group-header">${group.time}</div>
                ${group.events.map(event => {
                    const isNowPlaying = this.isEventCurrentlyPlaying(event);
                    const isFavorite = this.isFavorite(event.title);
                    return `
                    <div class="event-card ${isNowPlaying ? 'now-playing' : ''}">
                        <div class="event-header">
                            <div class="event-time">${event.time}</div>
                            <button class="favorite-btn ${isFavorite ? 'favorited' : ''}" 
                                    onclick="window.concertApp.toggleFavorite('${event.title.replace(/'/g, "\\'")}')"
                                    title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                                <span class="star">${isFavorite ? '★' : '☆'}</span>
                            </button>
                        </div>
                        <div class="event-title">${event.title}</div>
                        <div class="event-stage">${event.stage}</div>
                        ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                    </div>
                `;
                }).join('')}
            </div>
        `).join('');
    }

    groupEventsByTime(events) {
        const groups = {};
        
        events.forEach(event => {
            if (!groups[event.time]) {
                groups[event.time] = [];
            }
            groups[event.time].push(event);
        });

        return Object.keys(groups).map(time => ({
            time,
            events: groups[time]
        }));
    }

    showMap() {
        // Placeholder for map functionality
        this.showNotification('Map feature coming soon!', 'info');
    }

    // Manual test function for auto-scroll (for debugging)
    testAutoScroll() {
        console.log('Testing auto-scroll...');
        this.updateNowPlayingStatus();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully:', registration);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.concertApp = new ConcertScheduleApp();
    
    // Add global test function for debugging
    window.testAutoScroll = () => {
        if (window.concertApp) {
            window.concertApp.testAutoScroll();
        }
    };
    
    // Add global function to check current time
    window.checkCurrentTime = () => {
        if (window.concertApp) {
            const currentTime = window.concertApp.getCurrentTimeInMinutes();
            const hours = Math.floor(currentTime / 60);
            const minutes = currentTime % 60;
            console.log(`Current time: ${hours}:${minutes.toString().padStart(2, '0')} (${currentTime} minutes)`);
            return currentTime;
        }
    };
    
    // Add global function to manage favorites
    window.getFavorites = () => {
        if (window.concertApp) {
            const favorites = Array.from(window.concertApp.favorites);
            console.log('Current favorites:', favorites);
            return favorites;
        }
    };
    
    window.clearFavorites = () => {
        if (window.concertApp) {
            window.concertApp.favorites.clear();
            window.concertApp.saveFavorites();
            window.concertApp.renderSchedule();
            console.log('Favorites cleared');
        }
    };
});
