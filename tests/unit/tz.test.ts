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
    const { start, end } = localDayBoundsUTC(new Date("2026-01-16T04:30:00Z"), NEW_YORK);
    expect(start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-16T05:00:00.000Z");
  });

  // T24: the end used to be built from a UTC-midnight Date, which in a
  // UTC-negative zone is still the previous local day: the day had zero
  // length and every query for it came back empty.
  it("is 24 hours long west of UTC", () => {
    for (const tz of [NEW_YORK, LOS_ANGELES, "America/Sao_Paulo"]) {
      const { start, end } = localDayBoundsUTC(new Date("2026-01-15T17:00:00Z"), tz);
      expect(getYMDInTZ(start, tz), tz).toBe("2026-01-15");
      expect(getHHMMInTZ(start, tz), tz).toBe("00:00");
      expect(end.getTime() - start.getTime(), tz).toBe(24 * HOUR);
    }
  });

  it("starts at local midnight on Sydney switch days", () => {
    const forward = localDayBoundsUTC(new Date("2026-10-04T02:00:00Z"), "Australia/Sydney");
    expect(forward.start.toISOString()).toBe("2026-10-03T14:00:00.000Z");
    expect(forward.end.getTime() - forward.start.getTime()).toBe(23 * HOUR);
    const back = localDayBoundsUTC(new Date("2026-04-05T02:00:00Z"), "Australia/Sydney");
    expect(back.start.toISOString()).toBe("2026-04-04T13:00:00.000Z");
    expect(back.end.getTime() - back.start.getTime()).toBe(25 * HOUR);
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

  it("runs Monday to Monday west of UTC", () => {
    // T24: this used to run Sunday to Saturday, six days.
    for (const tz of [NEW_YORK, LOS_ANGELES]) {
      const { start, end } = localWeekBoundsUTC(new Date("2026-01-15T17:00:00Z"), tz);
      expect(getYMDInTZ(start, tz), tz).toBe("2026-01-12");
      expect(getHHMMInTZ(start, tz), tz).toBe("00:00");
      expect(getYMDInTZ(end, tz), tz).toBe("2026-01-19");
      expect(end.getTime() - start.getTime(), tz).toBe(7 * 24 * HOUR);
    }
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

  // T22: the offset used to be taken at the "local time read as UTC"
  // instant, which near a switch sits on the other side of it, so these
  // came out an hour off.
  it("converts 01:30 on the Madrid spring-forward day", () => {
    // 01:30 is still CET (+1), so 00:30 UTC.
    expect(localDateTimeToUTC("2026-03-29", "01:30", MADRID).toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
  });

  it("converts 01:30 on the Madrid fall-back day", () => {
    // 01:30 is still CEST (+2), so 23:30 UTC the day before.
    expect(localDateTimeToUTC("2026-10-25", "01:30", MADRID).toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    );
  });

  it("converts 06:30 on the New York spring-forward day", () => {
    // 06:30 is EDT (-4), so 10:30 UTC.
    expect(localDateTimeToUTC("2026-03-08", "06:30", NEW_YORK).toISOString()).toBe(
      "2026-03-08T10:30:00.000Z",
    );
  });

  it("puts a time skipped by spring-forward on the end of the gap", () => {
    // Madrid has no 02:30 on 2026-03-29; the clock jumps from 02:00 CET to
    // 03:00 CEST at 01:00 UTC.
    const at = localDateTimeToUTC("2026-03-29", "02:30", MADRID);
    expect(at.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(getHHMMInTZ(at, MADRID)).toBe("03:00");
  });

  it("keeps a block across the spring-forward gap the right way round", () => {
    const start = localDateTimeToUTC("2026-03-29", "02:30", MADRID);
    const end = localDateTimeToUTC("2026-03-29", "03:15", MADRID);
    expect(end.getTime() - start.getTime()).toBe(15 * 60_000);
  });

  it("takes a time that happens twice on fall-back the first time", () => {
    // 02:30 on 2026-10-25 happens in CEST (00:30 UTC) and again in CET.
    expect(localDateTimeToUTC("2026-10-25", "02:30", MADRID).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  // Every zone in the settings form that switches clocks, on both 2026
  // switch days. The UI writes any quarter hour through this function.
  const SWITCH_DAYS: Record<string, { forward: string; back: string }> = {
    "Europe/Madrid": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/Kyiv": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/Berlin": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/London": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/Lisbon": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/Warsaw": { forward: "2026-03-29", back: "2026-10-25" },
    "Europe/Amsterdam": { forward: "2026-03-29", back: "2026-10-25" },
    "America/New_York": { forward: "2026-03-08", back: "2026-11-01" },
    "America/Los_Angeles": { forward: "2026-03-08", back: "2026-11-01" },
    "America/Chicago": { forward: "2026-03-08", back: "2026-11-01" },
    "Australia/Sydney": { forward: "2026-10-04", back: "2026-04-05" },
  };
  const quarterHours = Array.from({ length: 96 }, (_, i) => {
    const min = i * 15;
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  });

  for (const [tz, { forward, back }] of Object.entries(SWITCH_DAYS)) {
    it(`reads every quarter hour back on both switch days in ${tz}`, () => {
      // Spring-forward skips one hour: four quarter hours.
      for (const [ymd, skippedCount] of [[forward, 4], [back, 0]] as const) {
        const instants = quarterHours.map((hhmm) => localDateTimeToUTC(ymd, hhmm, tz));
        const skipped = quarterHours.flatMap((hhmm, i) => {
          const readBack = `${getYMDInTZ(instants[i], tz)} ${getHHMMInTZ(instants[i], tz)}`;
          return readBack === `${ymd} ${hhmm}` ? [] : [i];
        });
        expect(skipped.length, ymd).toBe(skippedCount);
        // Every skipped time lands on the first real time after the gap.
        for (const i of skipped) {
          const firstAfterGap = instants[skipped[skipped.length - 1] + 1];
          expect(instants[i].getTime(), `${ymd} ${quarterHours[i]}`).toBe(firstAfterGap.getTime());
        }
        for (let i = 1; i < instants.length; i++) {
          expect(instants[i].getTime(), `${ymd} ${quarterHours[i]}`).toBeGreaterThanOrEqual(
            instants[i - 1].getTime(),
          );
        }
      }
    });
  }
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
