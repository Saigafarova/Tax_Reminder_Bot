export function validateDate(text) {

  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = text.match(dateRegex);

  if (!match) {
    return { valid: false, error: 'Неверный формат. Используйте ДД.ММ.ГГГГ' };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return { valid: false, error: 'Неверный месяц. Месяц должен быть от 01 до 12' };
  }


  if (day < 1 || day > 31) {
    return { valid: false, error: 'Неверный день. День должен быть от 01 до 31' };
  }


  const testDate = new Date(year, month - 1, day);
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) {
    return { valid: false, error: 'Такой даты не существует' };
  }


  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (testDate < today) {
    return { valid: false, error: 'Дата уже прошла' };
  }

  return { valid: true, date: testDate };
}

export function formatDateISO(day, month, year) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}