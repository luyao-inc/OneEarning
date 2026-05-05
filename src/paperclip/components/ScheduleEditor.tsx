import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type SchedulePreset = "every_minute" | "every_hour" | "every_day" | "weekdays" | "weekly" | "monthly" | "custom";

const SCHEDULE_PRESETS: SchedulePreset[] = [
  "every_minute",
  "every_hour",
  "every_day",
  "weekdays",
  "weekly",
  "monthly",
  "custom",
];

const HOUR_VALUES = Array.from({ length: 24 }, (_, i) => String(i));

const MINUTES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i * 5),
  label: String(i * 5).padStart(2, "0"),
}));

const WEEKDAY_VALUES = ["1", "2", "3", "4", "5", "6", "0"] as const;

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function parseCronToPreset(cron: string): {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  dayOfWeek: string;
  dayOfMonth: string;
} {
  const defaults = { hour: "10", minute: "0", dayOfWeek: "1", dayOfMonth: "1" };

  if (!cron || !cron.trim()) {
    return { preset: "every_day", ...defaults };
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { preset: "custom", ...defaults };
  }

  const [min, hr, dom, , dow] = parts;

  if (min === "*" && hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_minute", ...defaults };
  }

  if (hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_hour", ...defaults, minute: min === "*" ? "0" : min };
  }

  if (dom === "*" && dow === "*" && hr !== "*") {
    return { preset: "every_day", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  if (dom === "*" && dow === "1-5" && hr !== "*") {
    return { preset: "weekdays", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  if (dom === "*" && /^\d$/.test(dow) && hr !== "*") {
    return { preset: "weekly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfWeek: dow };
  }

  if (/^\d{1,2}$/.test(dom) && dow === "*" && hr !== "*") {
    return { preset: "monthly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfMonth: dom };
  }

  return { preset: "custom", ...defaults };
}

function buildCron(preset: SchedulePreset, hour: string, minute: string, dayOfWeek: string, dayOfMonth: string): string {
  switch (preset) {
    case "every_minute":
      return "* * * * *";
    case "every_hour":
      return `${minute} * * * *`;
    case "every_day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "custom":
      return "";
  }
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function describeSchedule(cron: string, t: TFunction): string {
  const { preset, hour, minute, dayOfWeek, dayOfMonth } = parseCronToPreset(cron);
  const hp = hour.padStart(2, "0");
  const mp = minute.padStart(2, "0");
  const time24 = `${hp}:${mp}`;
  const base = "paperclip.routinesPage.scheduleEditor";

  switch (preset) {
    case "every_minute":
      return t(`${base}.describeEveryMinute`);
    case "every_hour":
      return t(`${base}.describeEveryHour`, { minute: mp });
    case "every_day":
      return t(`${base}.describeEveryDay`, { time: time24 });
    case "weekdays":
      return t(`${base}.describeWeekdays`, { time: time24 });
    case "weekly": {
      const weekday = t(`${base}.dow_${dayOfWeek}`);
      return t(`${base}.describeWeekly`, { weekday, time: time24 });
    }
    case "monthly":
      return t(`${base}.describeMonthly`, {
        day: dayOfMonth,
        ordinalDay: `${dayOfMonth}${ordinalSuffix(Number(dayOfMonth))}`,
        time: time24,
      });
    case "custom":
      return cron.trim() ? cron : t(`${base}.describeNoSchedule`);
  }
}

export { describeSchedule };

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (cron: string) => void;
}) {
  const { t } = useTranslation();
  const base = "paperclip.routinesPage.scheduleEditor";
  const parsed = useMemo(() => parseCronToPreset(value), [value]);
  const [preset, setPreset] = useState<SchedulePreset>(parsed.preset);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth);
  const [customCron, setCustomCron] = useState(preset === "custom" ? value : "");

  const atWord = t(`${base}.atWord`);
  const atMinuteLabel = t(`${base}.atMinute`);
  const onWord = t(`${base}.onWord`);
  const onDayLabel = t(`${base}.onDay`);

  useEffect(() => {
    const p = parseCronToPreset(value);
    setPreset(p.preset);
    setHour(p.hour);
    setMinute(p.minute);
    setDayOfWeek(p.dayOfWeek);
    setDayOfMonth(p.dayOfMonth);
    if (p.preset === "custom") setCustomCron(value);
  }, [value]);

  const emitChange = useCallback(
    (p: SchedulePreset, h: string, m: string, dow: string, dom: string, custom: string) => {
      if (p === "custom") {
        onChange(custom);
      } else {
        onChange(buildCron(p, h, m, dow, dom));
      }
    },
    [onChange],
  );

  const handlePresetChange = (newPreset: SchedulePreset) => {
    setPreset(newPreset);
    if (newPreset === "custom") {
      setCustomCron(value);
    } else {
      emitChange(newPreset, hour, minute, dayOfWeek, dayOfMonth, customCron);
    }
  };

  return (
    <div className="space-y-3">
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as SchedulePreset)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t(`${base}.chooseFrequency`)} />
        </SelectTrigger>
        <SelectContent>
          {SCHEDULE_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`${base}.preset_${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <div className="space-y-1.5">
          <Input
            value={customCron}
            onChange={(e) => {
              setCustomCron(e.target.value);
              emitChange("custom", hour, minute, dayOfWeek, dayOfMonth, e.target.value);
            }}
            placeholder="0 10 * * *"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{t(`${base}.cronHint`)}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {preset !== "every_minute" && preset !== "every_hour" && (
            <>
              {atWord ? <span className="text-sm text-muted-foreground">{atWord}</span> : null}
              <Select
                value={hour}
                onValueChange={(h) => {
                  setHour(h);
                  emitChange(preset, h, minute, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_VALUES.map((h) => (
                    <SelectItem key={h} value={h}>
                      {`${h.padStart(2, "0")}:00`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">:</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  setMinute(m);
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "every_hour" && (
            <>
              <span className="text-sm text-muted-foreground">{atMinuteLabel}</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  setMinute(m);
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      :{m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "weekly" && (
            <>
              {onWord ? <span className="text-sm text-muted-foreground">{onWord}</span> : null}
              <div className="flex gap-1">
                {WEEKDAY_VALUES.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={dayOfWeek === d ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setDayOfWeek(d);
                      emitChange(preset, hour, minute, d, dayOfMonth, customCron);
                    }}
                  >
                    {t(`${base}.dow_${d}`)}
                  </Button>
                ))}
              </div>
            </>
          )}

          {preset === "monthly" && (
            <>
              <span className="text-sm text-muted-foreground">{onDayLabel}</span>
              <Select
                value={dayOfMonth}
                onValueChange={(dom) => {
                  setDayOfMonth(dom);
                  emitChange(preset, hour, minute, dayOfWeek, dom, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_MONTH.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}
    </div>
  );
}
