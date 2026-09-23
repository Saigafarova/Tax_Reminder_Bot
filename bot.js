import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { SITUATIONS } from './data.js';

const bot = new Bot(process.env.BOT_TOKEN);

const users = {};
function getUser(userId) {
  if (!users[userId]) {
    users[userId] = {
      situations: [], 
      reports: [],   
      reminders: []   
    };
  }
  return users[userId];
}

bot.command('start', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);

  if (user.situations.length > 0) {
    return showMenu(ctx, userId);
  }
  return ctx.reply(
    'Привет! Я помогаю ИП с сотрудниками на УСН с отчётностью.\n\n' +
    'Что у вас изменилось?',
    {
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Нанял сотрудника', payload: 'sit_hired' }],
            [{ type: 'callback', text: 'Сменил режим', payload: 'sit_regime' }],
            [{ type: 'callback', text: 'Купил транспорт', payload: 'sit_transport' }],
            [{ type: 'callback', text: 'Ничего, проверить', payload: 'sit_none' }]
          ]
        }
      }]
    }
  );
});


function showMenu(ctx, userId) {
  return ctx.reply('Вот меню:');
}


bot.start();
console.log('Бот запущен...');