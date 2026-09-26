import { Bot } from '@maxhub/max-bot-api';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const bot = new Bot(process.env.BOT_TOKEN);

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
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return {};
    }
    console.error('loadUsers error:', err);
    throw err;
  }
}

async function saveUsers(users) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: USERS_KEY,
      Body: JSON.stringify(users),
      ContentType: 'application/json',
    })
  );
}

function todayStr() {
  // Москва UTC+3
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = msk.getUTCFullYear();
  const m = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const d = String(msk.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function handler(event) {
  console.log('Reminders job started', new Date().toISOString());
  console.log('Event:', JSON.stringify(event).slice(0, 300));

  const today = todayStr();
  console.log('Today (MSK):', today);

  const users = await loadUsers();
  let sentCount = 0;
  let changed = false;

  for (const [userId, user] of Object.entries(users)) {
    if (!user.reminders || user.reminders.length === 0) continue;

    for (const rem of user.reminders) {
      // уже отправляли
      if (rem.sent) continue;
      if (rem.remindDate !== today) continue;

      const report = (user.reports || []).find((r) => r.id === rem.reportId);
      const reportName = report?.name || rem.reportId;

      const text =
        `⏰ Напоминание\n\n` +
        `Сегодня дата, которую вы указали по отчёту:\n` +
        `«${reportName}»\n\n` +
        `Не забудьте сдать вовремя.\n` +
        `Если уже сдали — отметьте это в боте (/start → Моя отчётность).`;

      try {
        await bot.api.sendMessageToUser(Number(userId), text);
        console.log('Sent to', userId, reportName);
        rem.sent = true;
        sentCount++;
        changed = true;
      } catch (err) {
        console.error('Failed to send to', userId, err.message || err);
      }
    }
  }

  if (changed) {
    await saveUsers(users);}

  console.log('Done. Sent:', sentCount);
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, today, sentCount }),
  };
}