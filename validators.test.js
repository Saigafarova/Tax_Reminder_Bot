import { describe, it, expect } from 'vitest';
import { validateDate, formatDateISO } from './validators.js';

describe('validateDate', () => {

  it('принимает корректную дату в будущем', () => {
    const result = validateDate('22.10.2026');
    expect(result.valid).toBe(true);
  });

  it('отклоняет неверный формат', () => {
    const result = validateDate('22-10-2026');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('формат');
  });

  it('отклоняет неверный месяц (13)', () => {
    const result = validateDate('22.13.2026');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('месяц');
  });

  it('отклоняет неверный день (32)', () => {
    const result = validateDate('32.10.2026');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('день');
  });

  it('отклоняет несуществующую дату (31 февраля)', () => {
    const result = validateDate('31.02.2026');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('не существует');
  });

  it('отклоняет дату в прошлом', () => {
    const result = validateDate('01.01.2020');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('прошла');
  });

  it('отклоняет пустую строку', () => {
    const result = validateDate('');
    expect(result.valid).toBe(false);
  });

});

describe('formatDateISO', () => {

  it('форматирует дату правильно', () => {
    expect(formatDateISO(5, 10, 2026)).toBe('2026-10-05');
  });

  it('добавляет ведущий ноль', () => {
    expect(formatDateISO(1, 1, 2026)).toBe('2026-01-01');
  });

});