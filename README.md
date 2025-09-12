# Riot Fest Schedule PWA

A modern Progressive Web App for displaying a 3-day concert schedule with offline functionality.

## Features

- 📱 **PWA Support**: Installable on mobile devices with offline access
- 🎵 **3-Day Schedule**: Easy navigation between concert days
- 📊 **CSV Loading**: Automatically loads schedule data from CSV file
- 🎨 **Modern Design**: Beautiful, responsive UI with dark theme
- 📍 **Map Integration**: Placeholder for venue map functionality
- ⚡ **Fast Loading**: Optimized for performance and offline use

## Getting Started

1. **Open the app**: Simply open `index.html` in a web browser
2. **Schedule loads automatically**: The app fetches `sample-schedule.csv` automatically
3. **Navigate**: Use the bottom tab bar to switch between days
4. **Install**: Add to home screen on mobile devices for app-like experience

## CSV Format

Your CSV file should include the following columns:

```csv
Day,Date,Stage,Time,Artist
Friday,September 19,Rise Stage,3:05pm - 3:35pm,Lambrini Girls
Saturday,September 20,Main Stage,6:30pm - 7:00pm,The Electric Storm
```

### Required Columns:
- `Day`: Day name (Friday, Saturday, Sunday, or Day 1, Day 2, Day 3)
- `Date`: Event date (e.g., "September 19")
- `Stage`: Venue/stage name
- `Time`: Event time range with AM/PM (e.g., "3:05pm - 3:35pm")
- `Artist`: Artist/band name

### Supported Day Formats:
- Day names: "Friday", "Saturday", "Sunday"
- Day numbers: "Day 1", "Day 2", "Day 3"
- Numeric: "1", "2", "3"

## File Structure

```
riot/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── app.js             # JavaScript application logic
├── manifest.json      # PWA manifest
├── sw.js              # Service worker for offline functionality
├── sample-schedule.csv # Example CSV file
├── icons/             # PWA icons (to be added)
└── README.md          # This file
```

## PWA Features

- **Offline Access**: Works without internet connection
- **Installable**: Can be installed on mobile devices
- **Responsive**: Optimized for all screen sizes
- **Fast**: Cached resources for quick loading

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS 11.3+)
- Samsung Internet

## Development

To modify the app:

1. Edit the HTML structure in `index.html`
2. Update styles in `styles.css`
3. Modify functionality in `app.js`
4. Update PWA settings in `manifest.json`

## Adding Icons

To complete the PWA setup, add icon files to the `icons/` directory:

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

## Deployment

This PWA is configured for deployment with Cloudflare Workers/Pages.

### Prerequisites

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

### Deploy Commands

```bash
# Install dependencies
npm install

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production

# Or use wrangler directly
wrangler pages deploy .
```

### Environment Setup

- **Staging**: `riot-festival-schedule-staging`
- **Production**: `riot-festival-schedule`

The app will be available at:
- Staging: `https://riot-festival-schedule-staging.pages.dev`
- Production: `https://riot-festival-schedule.pages.dev`

### Features After Deployment

- ✅ **PWA Installation**: Users can install on mobile devices
- ✅ **Offline Functionality**: Works without internet connection
- ✅ **Fast Global CDN**: Served from Cloudflare's edge network
- ✅ **HTTPS**: Automatic SSL certificate
- ✅ **Custom Domain**: Can be configured in Cloudflare dashboard

## License

This project is open source and available under the MIT License.
