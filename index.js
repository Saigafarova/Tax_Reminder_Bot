import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { SITUATIONS } from './data.js';

const bot = new Bot(process.env.BOT_TOKEN);

const users = {};

function getUser(userId) {
  if (!users[userId]) {
    users[userId] = { situations: [], reports: [], reminders: [] };
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

bot.action('set_reminder', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас нет отчётов для напоминания.');
  }

  return ctx.reply('По какому отчёту напомнить?', {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: user.reports.map((r, i) => [
          { type: 'callback', text: `${i + 1}. ${r.name}`, payload: `rem_${r.id}` }
        ])
      }
    }]
  });
});

bot.action('rem_psv', (ctx) => askDate(ctx, 'psv'));
bot.action('rem_rsv', (ctx) => askDate(ctx, 'rsv'));
bot.action('rem_ndfl', (ctx) => askDate(ctx, 'ndfl'));
bot.action('rem_efs_kadry', (ctx) => askDate(ctx, 'efs_kadry'));
bot.action('rem_efs_vznosy', (ctx) => askDate(ctx, 'efs_vznosy'));
bot.action('rem_usn_notification', (ctx) => askDate(ctx, 'usn_notification'));
bot.action('rem_usn_declaration', (ctx) => askDate(ctx, 'usn_declaration'));
bot.action('rem_usn_advances', (ctx) => askDate(ctx, 'usn_advances'));
bot.action('rem_transport_tax_ip', (ctx) => askDate(ctx, 'transport_tax_ip'));

function askDate(ctx, reportId) {
  const userId = ctx.user.id;
  const user = getUser(userId);
  const report = user.reports.find(r => r.id === reportId);
  
  user.waitingForDate = reportId;
  
  return ctx.reply(
    `${report.name}\n\n` +
    `Срок: ${report.deadline}\n\n` +
    `Напишите дату, когда напомнить, в формате ДД.ММ.ГГГГ\n` +
    `Например: 22.10.2026`
  );
}

bot.on('message_created', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);
  
  if (!user.waitingForDate) return;
  
  const text = ctx.message.body.text;
  const reportId = user.waitingForDate;
  
  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = text.match(dateRegex);
  
  if (!match) {
    return ctx.reply('Не понял дату. Напишите в формате ДД.ММ.ГГГГ, например: 22.10.2026');
  }
  
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);

  if (month < 1 || month > 12) {
    return ctx.reply('Неверный месяц. Месяц должен быть от 01 до 12.');
  }

  if (day < 1 || day > 31) {
    return ctx.reply('Неверный день. День должен быть от 01 до 31.');
  }

  const testDate = new Date(year, month - 1, day);
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) {
    return ctx.reply('Такой даты не существует. Проверьте, пожалуйста.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (testDate < today) {
    return ctx.reply('Дата уже прошла. Укажите будущую дату.');
  }

  const remindDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  

  if (!user.reminders) user.reminders = [];
  user.reminders.push({ reportId, remindDate });
  user.waitingForDate = null;
  
  const report = user.reports.find(r => r.id === reportId);
  
  return ctx.reply(`Сохранено! Напомню ${match[1]}.${match[2]}.${match[3]} по отчёту "${report.name}".`, {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
      }
    }]
  });
});



function saveReminder(ctx, reportId, days) {
  const userId = ctx.user.id;
  const user = getUser(userId);

  const report = user.reports.find(r => r.id === reportId);
  if (!report) {
    return ctx.reply('Не нашёл такой отчёт. Попробуйте снова.');
  }

  if (!user.reminders) user.reminders = [];

  const isExist = user.reminders.some(r => r.reportId === reportId && r.days === days);
  if (!isExist) {
    user.reminders.push({ reportId, days });
  }

  return ctx.reply(`Сохранено! Напомню за ${days} дн. по отчёту "${report.name}".`, {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
      }
    }]
  });
}

bot.action('my_reminders', (ctx) => {
  const userId = ctx.user.id;
  const user = getUser(userId);

  if (!user.reminders || user.reminders.length === 0) {
    return ctx.reply('У вас пока нет напоминаний.', {
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
        }
      }]
    });
  }

  let text = '*Ваши напоминания:*\n\n';
user.reminders.forEach((rem, i) => {
  const report = user.reports.find(r => r.id === rem.reportId);
  text += `${i + 1}. ${report?.name || 'Отчёт'} — ${rem.remindDate}\n`;
});

async function checkReminders() {
  const today = new Date().toISOString().split('T')[0];
  
  for (const userId in users) {
    const user = users[userId];
    if (!user.reminders) continue;
    
    for (const rem of user.reminders) {
      if (rem.remindDate === today) {
        const report = user.reports.find(r => r.id === rem.reportId);
        // отправка сообщения
        // await bot.api.sendMessage({ user_id: userId, text: `Напоминание: ${report.name}` });
      }
    }
  }
}

setInterval(checkReminders, 24 * 60 * 60 * 1000);

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]]
      }
    }]
  });
});

bot.action('change_sit', (ctx) => {
  return ctx.reply('Что у вас изменилось?', {
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'callback', text: 'Нанял сотрудника', payload: 'sit_hired' }],
          [{ type: 'callback', text: 'Сменил режим', payload: 'sit_regime' }],
          [{ type: 'callback', text: 'Купил транспорт', payload: 'sit_transport' }],
          [{ type: 'callback', text: 'В меню', payload: 'menu' }]
        ]
      }
    }]
  });
});
bot.action('menu', (ctx) => showMenu(ctx, ctx.user.id));



export async function handler(event) {
  try {
    const body = JSON.parse(event.body);
    await bot.handleUpdate(body);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 200, body: 'OK' };
  }
}