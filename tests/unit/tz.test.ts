import { describe, expect, it } from "vitest";
import {
  getHHMMInTZ,
  getTZOffsetMinutes,
  getWeekdayInTZ,
  getYMDInTZ,
  isValidYMD,
  localDateTimeToUTC,
  localDayBoundsUTC,
  localWeekBoundsUTC,
  ymdToProbeUTC,
} from "@/lib/time/tz";

const MADRID = "Europe/Madrid";
const NEW_YORK = "America/New_York";
const LOS_ANGELES = "America/Los_Angeles";
const HOUR = 3_600_000;

describe("getTZOffsetMinutes", () => {
  it("returns winter and summer offsets", () => {
    expect(getTZOffsetMinutes(new Date("2026-01-15T12:00:00Z"), MADRID)).toBe(60);
    expect(getTZOffsetMinutes(new Date("2026-07-15T12:00:00Z"), MADRID)).toBe(120);
    expect(getTZOffsetMinutes(new Date("2026-01-15T12:00:00Z"), NEW_YORK)).toBe(-300);
  });
});

describe("localDayBoundsUTC", () => {
  it("covers an ordinary Madrid day as 24 hours from local midnight", () => {
    const { start, end } = localDayBoundsUTC(new Date("2026-01-15T12:00:00Z"), MADRID);
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("is 23 hours long on the spring-forward day", () => {
    const { start, end } = localDayBoundsUTC(new Date("2026-03-29T12:00:00Z"), MADRID);
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(23 * HOUR);
  });

  it("is 25 hours long on the fall-back day", () => {
    const { start, end } = localDayBoundsUTC(new Date("2026-10-25T12:00:00Z"), MADRID);
    expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR);
  });

  it("uses the user's day, not the UTC day, late in the evening", () => {
    // 04:30 UTC on the 16th is still the 15th in New York.
    const { start } = localDayBoundsUTC(new Date("2026-01-16T04:30:00Z"), NEW_YORK);
    expect(start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("localWeekBoundsUTC", () => {
  it("runs Monday to Monday", () => {
    // Thursday 2026-01-15.
    const { start, end } = localWeekBoundsUTC(new Date("2026-01-15T12:00:00Z"), MADRID);
    expect(start.toISOString()).toBe("2026-01-11T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-18T23:00:00.000Z");
  });

  it("treats Sunday as the last day of the week", () => {
    const { start } = localWeekBoundsUTC(new Date("2026-01-18T12:00:00Z"), MADRID);
    expect(getYMDInTZ(start, MADRID)).toBe("2026-01-12");
  });

  it("is one hour short across the spring-forward Sunday", () => {
    const { start, end } = localWeekBoundsUTC(new Date("2026-03-26T12:00:00Z"), MADRID);
    expect(getYMDInTZ(start, MADRID)).toBe("2026-03-23");
    expect(end.getTime() - start.getTime()).toBe((7 * 24 - 1) * HOUR);
  });
});

describe("localDateTimeToUTC", () => {
  it("converts an ordinary local time", () => {
    expect(localDateTimeToUTC("2026-01-15", "10:30", MADRID).toISOString()).toBe(
      "2026-01-15T09:30:00.000Z",
    );
    expect(localDateTimeToUTC("2026-07-15", "10:30", MADRID).toISOString()).toBe(
      "2026-07-15T08:30:00.000Z",
    );
  });

  it("converts times after the switch on the spring-forward day", () => {
    expect(localDateTimeToUTC("2026-03-29", "10:00", MADRID).toISOString()).toBe(
      "2026-03-29T08:00:00.000Z",
    );
  });

  // T22: the offset is taken at the naive "local time read as UTC" instant.
  // Near a transition that instant sits on the other side of the switch,
  // so the result is one hour off: in Madrid for 01:00–02:00 local, in New
  // York for 03:00–07:00 local on the spring-forward day.
  it.fails("T22: converts 01:30 on the Madrid spring-forward day", () => {
    // 01:30 is still CET (+1), so 00:30 UTC.
    expect(localDateTimeToUTC("2026-03-29", "01:30", MADRID).toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
  });

  it.fails("T22: converts 01:30 on the Madrid fall-back day", () => {
    // 01:30 is still CEST (+2), so 23:30 UTC the day before.
    expect(localDateTimeToUTC("2026-10-25", "01:30", MADRID).toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    );
  });

  it.fails("T22: converts 06:30 on the New York spring-forward day", () => {
    // 06:30 is EDT (-4), so 10:30 UTC.
    expect(localDateTimeToUTC("2026-03-08", "06:30", NEW_YORK).toISOString()).toBe(
      "2026-03-08T10:30:00.000Z",
    );
  });
});

describe("isValidYMD", () => {
  it("accepts real calendar dates", () => {
    expect(isValidYMD("2026-02-28")).toBe(true);
    expect(isValidYMD("2028-02-29")).toBe(true);
  });

  it("rejects bad format and dates that would roll over", () => {
    for (const bad of ["2026-02-31", "2026-02-29", "2026-13-01", "2026-00-10", "2026-1-5", "", "2026-01-15T00:00"]) {
      expect(isValidYMD(bad), bad).toBe(false);
    }
  });
});

describe("ymdToProbeUTC", () => {
  it("lands inside the same local day in a negative-offset zone", () => {
    const probe = ymdToProbeUTC("2026-06-01", LOS_ANGELES);
    expect(probe).not.toBeNull();
    expect(getYMDInTZ(probe as Date, LOS_ANGELES)).toBe("2026-06-01");
  });

  it("lands inside the same local day far east of UTC", () => {
    const probe = ymdToProbeUTC("2026-06-01", "Pacific/Kiritimati");
    expect(getYMDInTZ(probe as Date, "Pacific/Kiritimati")).toBe("2026-06-01");
  });

  it("returns null for an invalid date", () => {
    expect(ymdToProbeUTC("2026-02-31", MADRID)).toBeNull();
  });
});

describe("getHHMMInTZ and getWeekdayInTZ", () => {
  it("prints midnight as 00:00", () => {
    expect(getHHMMInTZ(new Date("2026-01-14T23:00:00Z"), MADRID)).toBe("00:00");
  });

  it("gives the weekday of the local day", () => {
    // Sunday 23:30 UTC is already Monday in Madrid.
    expect(getWeekdayInTZ(new Date("2026-01-18T23:30:00Z"), MADRID)).toBe(1);
    expect(getWeekdayInTZ(new Date("2026-01-18T23:30:00Z"), NEW_YORK)).toBe(0);
  });
});
