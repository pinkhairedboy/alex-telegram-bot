# Telegram Message Monitor Bot

Monitors Telegram groups for specific keywords and forwards matching messages with notifications.

## Setup

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Run locally: `npm start`
5. Authenticate with your phone number (first time only)
6. The session will be saved to `.env`

### Docker Deployment

1. Clone on your server
2. Copy your `.env` file (with SESSION_STRING from local setup)
3. Run with Docker Compose:

```bash
# First time setup (if you haven't authenticated locally)
docker-compose run --rm telegram-bot

# Normal operation (with existing session)
docker-compose up -d
```

## Configuration

- `MONITORED_CHAT_USERNAMES` - Comma-separated list of group usernames to monitor
- `FILTER_KEYWORDS` - Keywords to filter messages (case-insensitive)
- `BOT_TOKEN` - Bot token from @BotFather
- `API_ID` & `API_HASH` - From https://my.telegram.org/apps

## How it Works

1. Client API monitors specified groups as your user account
2. Filters messages by keywords
3. Forwards matching messages to your bot chat
4. Bot re-forwards with notification and deletes original