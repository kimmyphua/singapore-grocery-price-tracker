const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

type DateRangeOptions = {
  referenceDate?: Date;
  defaultDurationDays?: number;
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export function parsePromotionDateRange(
  text: string,
  options: DateRangeOptions = {}
) {
  const endpointRange = text.match(
    /(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?(?!\s*\d)/i
  );

  if (endpointRange) {
    const [, startDay, startMonth, startYear, endDay, endMonth, endYear] =
      endpointRange;
    const years = inferRangeYears(
      Number(startDay),
      monthIndex(startMonth),
      startYear ? Number(startYear) : undefined,
      Number(endDay),
      monthIndex(endMonth),
      endYear ? Number(endYear) : undefined,
      options.referenceDate
    );

    return singaporeRange(
      calendarDate(
        years.startYear,
        startMonth,
        Number(startDay)
      ),
      calendarDate(years.endYear, endMonth, Number(endDay))
    );
  }

  const sharedMonthRange = text.match(
    /(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?(?!\s*\d)/i
  );

  if (sharedMonthRange) {
    const [, startDay, endDay, month, year] = sharedMonthRange;
    const monthNumber = monthIndex(month);
    const resolvedYear = year
      ? Number(year)
      : nearestYear(monthNumber, Number(endDay), options.referenceDate);

    return singaporeRange(
      calendarDate(resolvedYear, month, Number(startDay)),
      calendarDate(resolvedYear, month, Number(endDay))
    );
  }

  const tillRange = text.match(
    /till\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?(?!\s*\d)/i
  );

  if (!tillRange) {
    throw new Error(`Promotion validity range was not found: ${text}`);
  }

  const endDay = Number(tillRange[1]);
  const duration = options.defaultDurationDays ?? 7;
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new Error("defaultDurationDays must be a positive integer");
  }

  const endMonth = monthIndex(tillRange[2]);
  const endYear = tillRange[3]
    ? Number(tillRange[3])
    : nearestYear(endMonth, endDay, options.referenceDate);
  const end = calendarDate(endYear, tillRange[2], endDay);
  const start = addCalendarDays(end, -(duration - 1));

  return singaporeRange(start, end);
}

function inferRangeYears(
  startDay: number,
  startMonth: number,
  startYear: number | undefined,
  endDay: number,
  endMonth: number,
  endYear: number | undefined,
  referenceDate: Date | undefined
) {
  if (startYear !== undefined && endYear !== undefined) {
    return { startYear, endYear };
  }

  if (endYear !== undefined) {
    return {
      startYear:
        compareMonthDay(startMonth, startDay, endMonth, endDay) > 0
          ? endYear - 1
          : endYear,
      endYear
    };
  }

  if (startYear !== undefined) {
    return {
      startYear,
      endYear:
        compareMonthDay(endMonth, endDay, startMonth, startDay) < 0
          ? startYear + 1
          : startYear
    };
  }

  const inferredEndYear = nearestYear(endMonth, endDay, referenceDate);
  return {
    startYear:
      compareMonthDay(startMonth, startDay, endMonth, endDay) > 0
        ? inferredEndYear - 1
        : inferredEndYear,
    endYear: inferredEndYear
  };
}

function nearestYear(
  month: number,
  day: number,
  referenceDate = new Date()
) {
  const reference = singaporeCalendarDate(referenceDate);
  const referenceTime = Date.UTC(reference.year, reference.month, reference.day);
  const candidates = [reference.year - 1, reference.year, reference.year + 1]
    .filter((year) => isValidCalendarDate(year, month, day))
    .map((year) => ({
      year,
      distance: Math.abs(Date.UTC(year, month, day) - referenceTime)
    }))
    .sort((a, b) => a.distance - b.distance);

  if (!candidates[0]) {
    throw new Error(
      `Invalid promotion date: ${day} ${monthName(month)} near ${reference.year}`
    );
  }

  return candidates[0].year;
}

function singaporeCalendarDate(date: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day)
  };
}

function calendarDate(
  year: number,
  monthNameValue: string,
  day: number
): CalendarDate {
  const month = monthIndex(monthNameValue);

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`Invalid promotion date: ${day} ${monthNameValue} ${year}`);
  }

  return { year, month, day };
}

function isValidCalendarDate(year: number, month: number, day: number) {
  return (
    Number.isInteger(year) &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  );
}

export function isPromotionExpired(validTo: Date, now = new Date()) {
  return now.getTime() > validTo.getTime();
}

function singaporeRange(start: CalendarDate, end: CalendarDate) {
  const startTime = Date.UTC(start.year, start.month, start.day);
  const endTime = Date.UTC(end.year, end.month, end.day);
  if (endTime < startTime) {
    throw new Error("Promotion validity range ends before it starts");
  }

  return {
    validFrom: new Date(
      Date.UTC(start.year, start.month, start.day - 1, 16, 0, 0, 0)
    ),
    validTo: new Date(
      Date.UTC(end.year, end.month, end.day, 15, 59, 59, 999)
    )
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month, date.day + days));
  if (Number.isNaN(result.getTime())) {
    throw new Error("Promotion validity range could not be inferred");
  }

  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth(),
    day: result.getUTCDate()
  };
}

function compareMonthDay(
  leftMonth: number,
  leftDay: number,
  rightMonth: number,
  rightDay: number
) {
  return leftMonth - rightMonth || leftDay - rightDay;
}

function monthIndex(value: string) {
  const month = MONTHS[value.slice(0, 3).toLowerCase()];

  if (month === undefined) {
    throw new Error(`Unsupported promotion month: ${value}`);
  }

  return month;
}

function monthName(month: number) {
  return Object.keys(MONTHS).find((name) => MONTHS[name] === month) ?? "month";
}
