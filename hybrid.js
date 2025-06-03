require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const TelegramBot = require('node-telegram-bot-api');
const input = require('input');
const fs = require('fs');
const path = require('path');

// Configuration
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || '');
const botToken = process.env.BOT_TOKEN;
const monitoredChatUsernames = process.env.MONITORED_CHAT_USERNAMES ?
  process.env.MONITORED_CHAT_USERNAMES.split(',').map(u => u.trim()) : [];
const filterKeywords = process.env.FILTER_KEYWORDS ?
  process.env.FILTER_KEYWORDS.split(',').map(k => k.trim().toLowerCase()) : [];

// Bot for receiving and re-sending with notifications
const bot = new TelegramBot(botToken, { polling: true });

// Track processed messages to avoid loops
const processedMessages = new Set();

// Filter function - returns true if message should be forwarded
function applyFilters(messageText) {
  if (!filterKeywords.length) return true; // No keywords = forward all
  return filterKeywords.some(keyword => messageText.includes(keyword));
}

(async () => {
  console.log('Starting hybrid Telegram monitor...');

  // Start client
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Please enter your phone number: '),
    password: async () => await input.text('Please enter your password (if 2FA enabled): '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });
  
  console.log('Client connected.');
  
  // Get user's chat ID from client
  const me = await client.getMe();
  const yourChatId = me.id;
  console.log(`Your chat ID: ${yourChatId}`);

  // Save session string
  const sessionString = client.session.save();
  if (sessionString && !process.env.SESSION_STRING) {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/SESSION_STRING=.*$/m, `SESSION_STRING=${sessionString}`);
    fs.writeFileSync(envPath, envContent);
    console.log('✓ Session string saved to .env file');
    console.log('\nIMPORTANT: Copy the updated .env file to your Docker host before running in container mode!');
  }

  // Get monitored chat IDs
  const chatIds = [];
  const chatNames = {};
  for (const username of monitoredChatUsernames) {
    try {
      const entity = await client.getEntity(username);
      const chatId = entity.id.value || entity.id;
      chatIds.push(chatId);
      chatNames[chatId] = entity.title || entity.username || username;
      console.log(`✓ Monitoring: ${chatNames[chatId]}`);
    } catch (error) {
      console.error(`✗ Could not find: ${username}`);
    }
  }

  // Get bot info from API
  let botUsername, botId;
  try {
    const botInfo = await bot.getMe();
    botUsername = botInfo.username;
    botId = botInfo.id;
    console.log(`✓ Bot connected: @${botUsername} (ID: ${botId})`);
  } catch (error) {
    console.error('✗ Could not get bot info:', error.message);
    process.exit(1);
  }

  // Get bot entity for client forwarding
  let botEntity;
  try {
    botEntity = await client.getEntity(botUsername);
  } catch (error) {
    console.error(`✗ Client could not find bot: @${botUsername}`);
    process.exit(1);
  }

  console.log(`\nMonitoring ${chatIds.length} chats`);
  console.log(`Filtering: ${filterKeywords.length ? `Active (${filterKeywords.length} keywords)` : 'Disabled'}`);
  console.log(`Forwarding to bot: @${botUsername}`);

  // Bot mirrors all messages from you
  bot.on('message', async (msg) => {
    // Only process messages in your chat from you
    if (msg.chat.id !== yourChatId || msg.from.id !== yourChatId) {
      return;
    }

    // Skip messages from the bot itself to avoid loops
    if (msg.from.id === botId) {
      return;
    }

    // Skip if already processed
    if (processedMessages.has(msg.message_id)) {
      return;
    }
    processedMessages.add(msg.message_id);

    try {
      // Mirror: forward back and delete original
      await bot.forwardMessage(yourChatId, yourChatId, msg.message_id);
      await bot.deleteMessage(yourChatId, msg.message_id);

    } catch (error) {
      console.error('Bot error:', error.message);
    }
  });

  // Client monitors messages
  client.addEventHandler(async (event) => {
    const message = event.message;

    try {
      // Get chat ID
      let chatId;
      if (message.peerId.channelId) {
        chatId = message.peerId.channelId.value;
      } else if (message.peerId.chatId) {
        chatId = message.peerId.chatId.value;
      } else {
        return;
      }

      // Check if monitored
      if (!chatIds.includes(chatId)) {
        return;
      }

      // Filter check
      const messageText = (message.text || '').toLowerCase();
      if (!applyFilters(messageText)) return; // Comment this line to disable filters

      const matchedKeyword = filterKeywords.find(keyword => messageText.includes(keyword));
      console.log(`[${chatNames[chatId]}] ${matchedKeyword ? `Matched: "${matchedKeyword}"` : 'Forwarding'}`);

      // Forward to bot (this will appear in your chat with the bot)
      await client.forwardMessages(botEntity, {
        messages: [message.id],
        fromPeer: message.peerId
      });

    } catch (error) {
      console.error('Client error:', error.message);
    }
  }, new NewMessage({ chats: chatIds }));

  console.log('\nBot and monitor running... Press Ctrl+C to stop\n');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping...');
    bot.stopPolling();
    client.disconnect();
    process.exit(0);
  });

  // Cleanup old processed messages periodically
  setInterval(() => {
    if (processedMessages.size > 1000) {
      processedMessages.clear();
    }
  }, 3600000); // Every hour
})();
