#!/bin/bash

# Riot Festival Schedule PWA Deployment Script

echo "🎵 Deploying Riot Festival Schedule PWA..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

# Deploy to staging first
echo "🚀 Deploying to staging..."
wrangler pages deploy . --env staging

if [ $? -eq 0 ]; then
    echo "✅ Staging deployment successful!"
    echo "📍 Staging URL: https://riot-festival-schedule-staging.pages.dev"
    
    # Ask if user wants to deploy to production
    read -p "Deploy to production? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Deploying to production..."
        wrangler pages deploy . --env production
        
        if [ $? -eq 0 ]; then
            echo "✅ Production deployment successful!"
            echo "📍 Production URL: https://riot-festival-schedule.pages.dev"
        else
            echo "❌ Production deployment failed!"
            exit 1
        fi
    fi
else
    echo "❌ Staging deployment failed!"
    exit 1
fi

echo "🎉 Deployment complete!"
