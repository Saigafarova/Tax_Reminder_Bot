import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { CATEGORIES, SITUATIONS } from './data.js';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const bot = new Bot(process.env.BOT_TOKEN);

// ——— Object Storage ———
const s3 = new S3Client({
  region: process.env.S3_REGION || 'ru-central1',
  endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET;
const USERS_KEY = 'users.json';

async function loadUsers() {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: USERS_KEY })
    );
    const text = await res.Body.transformToString();
    return JSON.parse(text);
  } catch (err) {
    // Файл ещё не создан
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return {};
    }
    console.error('loadUsers error:', err);
    return {};
  }
}

async function saveUsers(users) {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: USERS_KEY,
        Body: JSON.stringify(users),
        ContentType: 'application/json',
      })
    );
  } catch (err) {
    console.error('saveUsers error:', err);
  }
}

function ensureUser(users, userId) {
  if (!users[userId]) {
    users[userId] = { situations: [], reports: [], reminders: [] };
  }
  return users[userId];
}

// ——— Старт ———
async function handleStart(ctx) {
  const userId = String(ctx.user?.user_id);
  if (!userId || userId === 'undefined') {
    console.log('No user_id', ctx.update);
    return;
  }
  const users = await loadUsers();
  const user = ensureUser(users, userId);
  if (user.situations && user.situations.length > 0) {
    return showMainMenu(ctx);}
    
  return showCategories(ctx);}
bot.command('start', handleStart);
bot.on('bot_started', handleStart);

// ——— Ситуации ———
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
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
          },
        },
      ],
    }
  );
});

async function addSituation(ctx, key) {
  const userId = String(ctx.user.user_id);
  const situation = SITUATIONS[key];
  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.situations.includes(key)) {
    user.situations.push(key);
    user.reports.push(
      ...situation.reports.map((r) => ({ ...r, status: 'not_done' }))
    );
    await saveUsers(users);
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
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Отметить сдано', payload: 'mark_done' }],
            [
              {
                type: 'callback',
                text: 'Настроить напоминание',
                payload: 'set_reminder',
              },
            ],
            [{ type: 'callback', text: 'В меню', payload: 'menu' }],
          ],
        },
      },
    ],
  });
}

function showMenu(ctx) {
  return ctx.reply('Что вам нужно?', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Моя отчётность', payload: 'my_reports' }],
            [
              {
                type: 'callback',
                text: 'Мои напоминания',
                payload: 'my_reminders',
              },
            ],
            [
              {
                type: 'callback',
                text: 'Изменить ситуацию',
                payload: 'change_sit',
              },
            ],
          ],
        },
      },
    ],
  });
}

bot.action('my_reports', async (ctx) => {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас пока нет отчётов. Выберите ситуацию в меню.', {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
          },
        },
      ],
    });
  }

  let text = '*Ваши отчёты:*\n\n';
  user.reports.forEach((r, i) => {
    const status = r.status === 'done' ? 'сдано' : 'не сдано';
    text += `${i + 1}. ${r.name} — ${r.deadline} — ${status}\n`;
  });

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Отметить сдано', payload: 'mark_done' }],
            [
              {
                type: 'callback',
                text: 'Настроить напоминание',
                payload: 'set_reminder',
              },
            ],
            [{ type: 'callback', text: 'В меню', payload: 'menu' }],
          ],
        },
      },
    ],
  });
});

bot.action('mark_done', async (ctx) => {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас нет отчётов для отметки. Начните с /start');
  }

  return ctx.reply('Какой отчёт сдали?', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: user.reports.map((r, i) => [
            {
              type: 'callback',
              text: `${i + 1}. ${r.name}`,
              payload: `done_${r.id}`,
            },
          ]),
        },
      },
    ],
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

async function markDone(ctx, reportId) {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);
  const report = user.reports.find((r) => r.id === reportId);

  if (!report) {
    return ctx.reply('Не нашёл такой отчёт. Начните с /start');
  }

  report.status = 'done';
  await saveUsers(users);

  return ctx.reply(`Записал: ${report.name} сдан.`, {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
        },
      },
    ],
  });
}

bot.action('set_reminder', async (ctx) => {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.reports || user.reports.length === 0) {
    return ctx.reply('У вас нет отчётов для напоминания. Сначала выберите ситуацию (/start).', {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
          },
        },
      ],
    });
  }

  return ctx.reply('По какому отчёту напомнить?', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: user.reports.map((r, i) => [
            {
              type: 'callback',
              text: `${i + 1}. ${r.name}`,
              payload: `rem_${r.id}`,
            },
          ]),
        },
      },
    ],
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

async function askDate(ctx, reportId) {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);
  const report = user.reports.find((r) => r.id === reportId);

  if (!report) {
    return ctx.reply('Отчёт не найден. Начните заново с /start');
  }

  user.waitingForDate = reportId;
  await saveUsers(users);

  return ctx.reply(
    `${report.name}\n\n` +
      `Срок: ${report.deadline}\n\n` +
      `Напишите дату, когда напомнить, в формате ДД.ММ.ГГГГ\n` +
      `Например: 22.10.2026`
  );
}

bot.on('message_created', async (ctx) => {
  const userId = String(ctx.user?.user_id);
  if (!userId || userId === 'undefined') return;

  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.waitingForDate) return;

  const text = ctx.message?.body?.text;
  if (!text) return;

  // Не перехватываем команды
  if (text.startsWith('/')) return;

  const reportId = user.waitingForDate;
  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = text.match(dateRegex);

  if (!match) {
    return ctx.reply(
      'Не понял дату. Напишите в формате ДД.ММ.ГГГГ, например: 22.10.2026'
    );
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

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
  await saveUsers(users);

  const report = user.reports.find((r) => r.id === reportId);

  return ctx.reply(
    `Сохранено! Напомню ${match[1]}.${match[2]}.${match[3]} по отчёту "${report?.name || reportId}".`,
    {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
          },
        },
      ],
    }
  );
});

bot.action('my_reminders', async (ctx) => {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  const user = ensureUser(users, userId);

  if (!user.reminders || user.reminders.length === 0) {
    return ctx.reply('У вас пока нет напоминаний.', {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
          },
        },
      ],
    });
  }

  let text = '*Ваши напоминания:*\n\n';
  user.reminders.forEach((rem, i) => {
    const report = user.reports.find((r) => r.id === rem.reportId);
    text += `${i + 1}. ${report?.name || 'Отчёт'} — ${rem.remindDate}\n`;
  });

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'В меню', payload: 'menu' }]],
        },
      },
    ],
  });
});

bot.action('change_sit', (ctx) => {
  return ctx.reply('Что у вас изменилось?', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Нанял сотрудника', payload: 'sit_hired' }],
            [{ type: 'callback', text: 'Сменил режим', payload: 'sit_regime' }],
            [{ type: 'callback', text: 'Купил транспорт', payload: 'sit_transport' }],
            [{ type: 'callback', text: 'В меню', payload: 'menu' }],
          ],
        },
      },
    ],
  });
});

bot.action('menu', (ctx) => showMenu(ctx));

// ——— Handler для Cloud Functions ———
export async function handler(event) {
  console.log('EVENT:', JSON.stringify(event).slice(0, 500));

  try {
    let body = event.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    if (!body) body = event;

    console.log('Update type:', body.update_type);
    await bot.handleUpdate(body);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error in handler:', err);
    return { statusCode: 200, body: 'OK' };
  }
}