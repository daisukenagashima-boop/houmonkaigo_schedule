import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ERAS = [
  { name: '令和', start: '2019-05-01', startYear: 2019 },
  { name: '平成', start: '1989-01-08', startYear: 1989 },
  { name: '昭和', start: '1926-12-25', startYear: 1926 },
  { name: '大正', start: '1912-07-30', startYear: 1912 },
  { name: '明治', start: '1868-01-25', startYear: 1868 },
] as const;

export function toWareki(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  for (const era of ERAS) {
    if (dateStr >= era.start) {
      const eraYear = year - era.startYear + 1;
      const eraYearStr = eraYear === 1 ? '元' : eraYear.toString();
      return `${era.name}${eraYearStr}年${month}月${day}日`;
    }
  }
  return `${year}年${month}月${day}日`;
}

export function fromWareki(eraName: string, eraYear: number, month: number, day: number) {
  const era = ERAS.find(e => e.name === eraName);
  if (!era) return '';
  const year = era.startYear + eraYear - 1;
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
