// 日本の祝日計算（振替休日・国民の休日を含む）
// ハッピーマンデー制度（2000年〜）や祝日法改正、東京オリンピック特例（2020/2021）に対応

type HolidayMap = Record<string, string>;

const holidayCache = new Map<number, HolidayMap>();

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// 指定月の第N月曜日の日付を返す
function nthMonday(year: number, month: number, nth: number) {
  const first = new Date(year, month - 1, 1);
  const firstMondayOffset = (8 - first.getDay()) % 7; // 0=Sun
  const firstMonday = 1 + firstMondayOffset;
  return firstMonday + (nth - 1) * 7;
}

// 春分の日（1980-2099年の近似式）
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

// 秋分の日（1980-2099年の近似式）
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function computeBaseHolidays(year: number): HolidayMap {
  const map: HolidayMap = {};
  const add = (month: number, day: number, name: string) => {
    map[toDateStr(year, month, day)] = name;
  };

  if (year < 1949) return map;

  // 元日
  add(1, 1, '元日');

  // 成人の日
  if (year >= 2000) {
    add(1, nthMonday(year, 1, 2), '成人の日');
  } else if (year >= 1949) {
    add(1, 15, '成人の日');
  }

  // 建国記念の日
  if (year >= 1967) add(2, 11, '建国記念の日');

  // 天皇誕生日
  if (year >= 2020) {
    add(2, 23, '天皇誕生日');
  } else if (year >= 1989) {
    add(12, 23, '天皇誕生日');
  } else if (year >= 1949) {
    add(4, 29, '天皇誕生日');
  }

  // 春分の日
  if (year >= 1949) add(3, vernalEquinoxDay(year), '春分の日');

  // 昭和の日 / みどりの日（4/29）
  if (year >= 2007) {
    add(4, 29, '昭和の日');
  } else if (year >= 1989) {
    add(4, 29, 'みどりの日');
  } else if (year >= 1949) {
    // 4/29は天皇誕生日として既に登録済み
  }

  // 憲法記念日
  if (year >= 1949) add(5, 3, '憲法記念日');

  // みどりの日（5/4）
  if (year >= 2007) add(5, 4, 'みどりの日');

  // こどもの日
  if (year >= 1949) add(5, 5, 'こどもの日');

  // 海の日
  if (year === 2020) {
    add(7, 23, '海の日');
  } else if (year === 2021) {
    add(7, 22, '海の日');
  } else if (year >= 2003) {
    add(7, nthMonday(year, 7, 3), '海の日');
  } else if (year >= 1996) {
    add(7, 20, '海の日');
  }

  // 山の日
  if (year === 2020) {
    add(8, 10, '山の日');
  } else if (year === 2021) {
    add(8, 8, '山の日');
  } else if (year >= 2016) {
    add(8, 11, '山の日');
  }

  // 敬老の日
  if (year >= 2003) {
    add(9, nthMonday(year, 9, 3), '敬老の日');
  } else if (year >= 1966) {
    add(9, 15, '敬老の日');
  }

  // 秋分の日
  if (year >= 1948) add(9, autumnalEquinoxDay(year), '秋分の日');

  // スポーツの日 / 体育の日
  if (year === 2020) {
    add(7, 24, 'スポーツの日');
  } else if (year === 2021) {
    add(7, 23, 'スポーツの日');
  } else if (year >= 2020) {
    add(10, nthMonday(year, 10, 2), 'スポーツの日');
  } else if (year >= 2000) {
    add(10, nthMonday(year, 10, 2), '体育の日');
  } else if (year >= 1966) {
    add(10, 10, '体育の日');
  }

  // 文化の日
  if (year >= 1948) add(11, 3, '文化の日');

  // 勤労感謝の日
  if (year >= 1948) add(11, 23, '勤労感謝の日');

  return map;
}

function computeHolidaysForYear(year: number): HolidayMap {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const base = computeBaseHolidays(year);

  // 国民の休日: 前後を祝日に挟まれた平日（日曜を除く）
  const dates = Object.keys(base).sort();
  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00');
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
    const nextNext = new Date(d);
    nextNext.setDate(nextNext.getDate() + 2);
    const nextNextStr = `${nextNext.getFullYear()}-${pad2(nextNext.getMonth() + 1)}-${pad2(nextNext.getDate())}`;

    if (!base[nextStr] && base[nextNextStr] && next.getDay() !== 0) {
      base[nextStr] = '国民の休日';
    }
  }

  // 振替休日: 日曜日の祝日の直後の「祝日でない日」を振替休日にする
  const datesAfterKokumin = Object.keys(base).sort();
  for (const dateStr of datesAfterKokumin) {
    const d = new Date(dateStr + 'T00:00:00');
    if (d.getDay() !== 0) continue;
    // 1973年（振替休日制度開始）以降のみ対象
    if (d.getFullYear() < 1973) continue;

    const cursor = new Date(d);
    do {
      cursor.setDate(cursor.getDate() + 1);
    } while (base[`${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`]);

    const substituteStr = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`;
    base[substituteStr] = '振替休日';
  }

  holidayCache.set(year, base);
  return base;
}

export function getHolidayName(dateStr: string): string | undefined {
  const year = parseInt(dateStr.substring(0, 4), 10);
  if (!year || Number.isNaN(year)) return undefined;
  const map = computeHolidaysForYear(year);
  return map[dateStr];
}

export function getHolidaysForYears(years: number[]): HolidayMap {
  const result: HolidayMap = {};
  for (const y of years) {
    Object.assign(result, computeHolidaysForYear(y));
  }
  return result;
}
