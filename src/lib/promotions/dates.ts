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

export function parsePromotionDateRange(
  text: string,
  options: DateRangeOptions = {}
) {
  const fullRange = text.match(
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i
  );

  if (fullRange) {
    const [, startDay, endDay, month, year] = fullRange;

    return singaporeRange(
      Number(year),
      monthIndex(month),
      Number(startDay),
      Number(endDay)
    );
  }

  const tillRange = text.match(
    /till\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i
  );

  if (!tillRange) {
    throw new Error(`Promotion validity range was not found: ${text}`);
  }

  const referenceDate = options.referenceDate ?? new Date();
  const singaporeYear = Number(
    new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      year: "numeric"
    }).format(referenceDate)
  );
  const endDay = Number(tillRange[1]);
  const year = Number(tillRange[3] ?? singaporeYear);
  const duration = options.defaultDurationDays ?? 7;

  return singaporeRange(
    year,
    monthIndex(tillRange[2]),
    endDay - duration + 1,
    endDay
  );
}

export function isPromotionExpired(validTo: Date, now = new Date()) {
  return now.getTime() > validTo.getTime();
}

function singaporeRange(
  year: number,
  month: number,
  startDay: number,
  endDay: number
) {
  return {
    validFrom: new Date(Date.UTC(year, month, startDay - 1, 16, 0, 0, 0)),
    validTo: new Date(Date.UTC(year, month, endDay, 15, 59, 59, 999))
  };
}

function monthIndex(value: string) {
  const month = MONTHS[value.slice(0, 3).toLowerCase()];

  if (month === undefined) {
    throw new Error(`Unsupported promotion month: ${value}`);
  }

  return month;
}
