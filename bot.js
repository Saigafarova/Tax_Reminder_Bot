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

bot.action('sit_hired', (ctx) => addSituation(ctx, 'hired_first'));
bot.action('sit_regime', (ctx) => addSituation(ctx, 'changed_regime'));
bot.action('sit_transport', (ctx) => addSituation(ctx, 'bought_transport'));
bot.action('sit_none', (ctx) => {
  return ctx.reply(
    'Хорошо! Если что-то изменится — возвращайтесь.\n\n' +
    'А пока вот что обычно сдают ИП на УСН с сотрудниками:\n' +
    '• ПСВ — до 25 числа каждого месяца\n' +
    '• РСВ — до 25 числа после квартала\n' +
    '• 6-НДФЛ — до 25 числа после квартала\n' +
    '• ЕФС-1 — при приёме/увольнении\n\n' +
    'Подробнее: https://мсп.рф/',
    {
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
        }
      }]
    }
  );
});


function addSituation(ctx, key) {
  const userId = ctx.user.id;
  const situation = SITUATIONS[key];
  const user = getUser(userId);

  if (!user.situations.includes(key)) {
    user.situations.push(key);
    user.reports.push(...situation.reports.map(r => ({ ...r, status: 'not_done' })));
  }

  let text = `📌 *${situation.title}*\n\n`;
  text += `*Какие отчёты появились:*\n\n`;

  situation.reports.forEach((r, i) => {
    text += `${i + 1}. *${r.name}*\n`;
    text += `${r.deadline}\n`;
    text += `Что нужно: ${r.documents.join(', ')}\n`;
    text += `Если не сдать: ${r.penalty}\n\n`;
  });

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'callback', text: 'Отметить сдано', payload: 'mark_done' }],
          [{ type: 'callback', text: 'Настроить напоминание', payload: 'set_reminder' }],
          [{ type: 'callback', text: 'В меню', payload: 'menu' }]
        ]
      }
    }]
  });
}

function showMenu(ctx, userId) {
  return ctx.reply('Что вам нужно?', {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'callback', text: 'Моя отчётность', payload: 'my_reports' }],
          [{ type: 'callback', text: 'Мои напоминания', payload: 'my_reminders' }],
          [{ type: 'callback', text: 'Изменить ситуацию', payload: 'change_sit' }]
        ]
      }
    }]
  });
}

bot.action('my_reports', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас пока нет отчётов. Выберите ситуацию в меню.', {
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
        }
      }]
    });
  }

  let text = '*Ваши отчёты:*\n\n';
  user.reports.forEach((r, i) => {
    const status = r.status === 'done' ? 'сдано' : 'не сдано';
    text += `${i + 1}. ${r.name} — ${r.deadline} — ${status}\n`;
  });

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'callback', text: 'Отметить сдано', payload: 'mark_done' }],
          [{ type: 'callback', text: 'Настроить напоминание', payload: 'set_reminder' }],
          [{ type: 'callback', text: 'В меню', payload: 'menu' }]
        ]
      }
    }]
  });
});

bot.action('mark_done', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас нет отчётов для отметки.');
  }

  return ctx.reply('Какой отчёт сдали?', {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: user.reports.map((r, i) => [
          { type: 'callback', text: `${i + 1}. ${r.name}`, payload: `done_${r.id}` }
        ])
      }
    }]
  });
});

bot.action('done_psv', (ctx) => markDone(ctx, 'psv'));
bot.action('done_rsv', (ctx) => markDone(ctx, 'rsv'));
bot.action('done_ndfl', (ctx) => markDone(ctx, 'ndfl'));
bot.action('done_efs_kadry', (ctx) => markDone(ctx, 'efs_kadry'));
bot.action('done_efs_vznosy', (ctx) => markDone(ctx, 'efs_vznosy'));
bot.action('done_usn_notification', (ctx) => markDone(ctx, 'usn_notification'));
bot.action('done_usn_declaration', (ctx) => markDone(ctx, 'usn_declaration'));
bot.action('done_usn_advances', (ctx) => markDone(ctx, 'usn_advances'));
bot.action('done_transport_tax_ip', (ctx) => markDone(ctx, 'transport_tax_ip'));

function markDone(ctx, reportId) {
  const userId = ctx.user.id;
  const user = getUser(userId);
  const report = user.reports.find(r => r.id === reportId);

  if (!report) {
    return ctx.reply('Не нашёл такой отчёт.');
  }

  report.status = 'done';
  return ctx.reply(`Записал: ${report.name} сдан.`, {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
      }
    }]
  });
}
bot.start();
console.log('Бот запущен...');