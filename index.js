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
function showCategories(ctx) {
  return ctx.reply(
    'Выберите раздел:\n\n' +
      'Сроки и штрафы — типовые ориентиры. Перед сдачей сверьте в ЛК ФНС/СФР или с бухгалтером.',
    {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [
              ...CATEGORIES.map((c) => [
                { type: 'callback', text: c.title, payload: `cat_${c.id}` },
              ]),
              [{ type: 'callback', text: 'Моя отчётность', payload: 'my_reports' }],
              [{ type: 'callback', text: 'Мои напоминания', payload: 'my_reminders' }],
            ],
          },
        },
      ],
    }
  );
}

function showSituations(ctx, categoryId) {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  const list = Object.entries(SITUATIONS).filter(
    ([, s]) => s.categoryId === categoryId
  );

  if (list.length === 0) {
    return ctx.reply('В этом разделе пока нет ситуаций.', {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [
              [{ type: 'callback', text: '« К разделам', payload: 'choose_category' }],
            ],
          },
        },
      ],
    });
  }

  const title = category ? category.title : 'Ситуации';

  return ctx.reply(`Раздел: ${title}\n\nЧто у вас произошло?`, {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            ...list.map(([id, s]) => [
              {
                type: 'callback',
                text: s.title.length > 60 ? s.title.slice(0, 57) + '...' : s.title,
                payload: `sit_${id}`,
              },
            ]),
            [{ type: 'callback', text: '« К разделам', payload: 'choose_category' }],
          ],
        },
      },
    ],
  });
}

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


async function addSituation(ctx, key) {
  const situation = SITUATIONS[key];
  if (!situation) {
    return ctx.reply('Ситуация не найдена. Выберите раздел заново.', {
      attachments: [{
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'callback', text: 'К разделам', payload: 'choose_category' }]],
        },
      }],
    });
  }

  const userId = String(ctx.user.user_id);
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
            [{ type: 'callback', text: 'Настроить напоминание', payload: 'set_reminder' }],
            [{ type: 'callback', text: 'В меню', payload: 'menu' }],
          ],
        },
      },
    ],
  });
}

function showMainMenu(ctx) {
  return ctx.reply('Что вам нужно?', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Добавить ситуацию', payload: 'choose_category' }],
            [{ type: 'callback', text: 'Моя отчётность', payload: 'my_reports' }],
            [{ type: 'callback', text: 'Мои напоминания', payload: 'my_reminders' }],
            [{ type: 'callback', text: 'Сбросить данные', payload: 'reset_profile' }],
          ],
        },
      },
    ],
  });
}


bot.action('reset_profile', async (ctx) => {
  const userId = String(ctx.user.user_id);
  const users = await loadUsers();
  users[userId] = { situations: [], reports: [], reminders: [] };
  await saveUsers(users);

  return ctx.reply('Данные сброшены. Можно начать заново.', {
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [{ type: 'callback', text: 'Выбрать раздел', payload: 'choose_category' }],
          ],
        },
      },
    ],
  });
});

bot.action('choose_category', (ctx) => showCategories(ctx));

bot.action('cat_hiring_and_onboarding', (ctx) =>
  showSituations(ctx, 'hiring_and_onboarding')
);
bot.action('cat_regular_taxes_and_payments', (ctx) =>
  showSituations(ctx, 'regular_taxes_and_payments')
);
bot.action('cat_social_cases_and_annuals', (ctx) =>
  showSituations(ctx, 'social_cases_and_annuals')
);
bot.action('cat_offboarding_and_special', (ctx) =>
  showSituations(ctx, 'offboarding_and_special')
);

for (const id of Object.keys(SITUATIONS)) {
  bot.action(`sit_${id}`, (ctx) => addSituation(ctx, id));
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

const allReportIds = [
  ...new Set(
    Object.values(SITUATIONS).flatMap((s) => s.reports.map((r) => r.id))
  ),
];

for (const reportId of allReportIds) {
  bot.action(`done_${reportId}`, (ctx) => markDone(ctx, reportId));
  bot.action(`rem_${reportId}`, (ctx) => askDate(ctx, reportId));
} 
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

bot.action('change_sit', (ctx) => showCategories(ctx));

bot.action('menu', (ctx) => showMainMenu(ctx));

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