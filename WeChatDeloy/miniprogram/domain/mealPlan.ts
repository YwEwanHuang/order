export const MAX_NOTE = 200;
export const MAX_DISHES = 20;

export function validateNote(note: string | null | undefined): string | null {
  if (!note) return null;
  if (note.length > MAX_NOTE) return 'note_too_long';
  return null;
}

export function validateDishCount(ids: number[]): string | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DISHES) {
    return 'invalid_dish_count';
  }
  return null;
}

export function buildPayload(date: string, dishIds: number[], note?: string) {
  const unique = Array.from(new Set(dishIds));
  return { date, dish_ids: unique, note: note || '' };
}

export function maskOpenid(openid: string | null | undefined): string {
  if (!openid) return '';
  if (openid.length <= 8) return openid;
  return openid.slice(0, 5) + '…' + openid.slice(-4);
}