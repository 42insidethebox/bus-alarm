import {
  GtfsAgency,
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsDataset,
  GtfsFeedInfo,
  GtfsFrequency,
  GtfsParseError,
  GtfsParseResult,
  GtfsParserOptions,
  GtfsRoute,
  GtfsServiceTime,
  GtfsShapePoint,
  GtfsStop,
  GtfsStopTime,
  GtfsTableName,
  GtfsTrip,
  GtfsWarning,
  ResolvedGtfsParserOptions,
} from "./types";

const DEFAULT_OPTIONS: ResolvedGtfsParserOptions = {
  maxTextBytes: 64 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxRowsPerFile: 500_000,
  maxTotalRows: 1_000_000,
  maxColumns: 256,
  maxFieldLength: 64 * 1024,
  maxServiceHour: 167,
};

const FILE_TABLES: Record<string, GtfsTableName> = {
  "agency.txt": "agency",
  "stops.txt": "stops",
  "routes.txt": "routes",
  "trips.txt": "trips",
  "stop_times.txt": "stop_times",
  "calendar.txt": "calendar",
  "calendar_dates.txt": "calendar_dates",
  "frequencies.txt": "frequencies",
  "shapes.txt": "shapes",
  "feed_info.txt": "feed_info",
};

const TABLE_FILE = Object.fromEntries(
  Object.entries(FILE_TABLES).map(([file, table]) => [table, file]),
) as Record<GtfsTableName, string>;

const REQUIRED_TABLES: GtfsTableName[] = [
  "agency",
  "stops",
  "routes",
  "trips",
  "stop_times",
];

const REQUIRED_HEADERS: Record<GtfsTableName, readonly string[]> = {
  agency: ["agency_name", "agency_url", "agency_timezone"],
  stops: ["stop_id"],
  routes: ["route_id", "route_type"],
  trips: ["route_id", "service_id", "trip_id"],
  stop_times: [
    "trip_id",
    "arrival_time",
    "departure_time",
    "stop_id",
    "stop_sequence",
  ],
  calendar: [
    "service_id",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "start_date",
    "end_date",
  ],
  calendar_dates: ["service_id", "date", "exception_type"],
  frequencies: ["trip_id", "start_time", "end_time", "headway_secs"],
  shapes: [
    "shape_id",
    "shape_pt_lat",
    "shape_pt_lon",
    "shape_pt_sequence",
  ],
  feed_info: ["feed_publisher_name", "feed_publisher_url", "feed_lang"],
};

export interface ParsedCsvRecord {
  values: string[];
  /** One-based physical line where the record begins. */
  line: number;
}

interface CsvLimits {
  maxColumns?: number;
  maxFieldLength?: number;
  maxRecords?: number;
}

interface ParsedTable {
  table: GtfsTableName;
  headers: string[];
  rows: TableRow[];
}

interface TableRow {
  row: number;
  values: Record<string, string>;
}

function fail(
  code: ConstructorParameters<typeof GtfsParseError>[0],
  message: string,
  context: ConstructorParameters<typeof GtfsParseError>[2] = {},
): never {
  throw new GtfsParseError(code, message, context);
}

function appendChecked(
  field: string,
  value: string,
  maximum: number,
  line: number,
) {
  const next = field + value;
  if (next.length > maximum) {
    fail(
      "limit-exceeded",
      `CSV field beginning on line ${line} exceeds ${maximum} characters`,
      { row: line },
    );
  }
  return next;
}

/**
 * Strict RFC 4180 reader. Quoted commas, CRLFs, escaped quotes, and embedded
 * newlines are supported. Characters following a closing quote are rejected
 * instead of being guessed at.
 */
export function parseRfc4180(
  source: string,
  limits: CsvLimits = {},
): ParsedCsvRecord[] {
  const maxColumns = limits.maxColumns ?? DEFAULT_OPTIONS.maxColumns;
  const maxFieldLength = limits.maxFieldLength ?? DEFAULT_OPTIONS.maxFieldLength;
  const maxRecords = limits.maxRecords ?? DEFAULT_OPTIONS.maxRowsPerFile + 1;
  if (!Number.isSafeInteger(maxColumns) || maxColumns < 1) {
    fail("invalid-option", "maxColumns must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxFieldLength) || maxFieldLength < 1) {
    fail("invalid-option", "maxFieldLength must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) {
    fail("invalid-option", "maxRecords must be a positive safe integer");
  }

  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const records: ParsedCsvRecord[] = [];
  let values: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;
  let touched = false;

  const pushField = () => {
    if (values.length + 1 > maxColumns) {
      fail(
        "limit-exceeded",
        `CSV record on line ${recordLine} exceeds ${maxColumns} columns`,
        { row: recordLine },
      );
    }
    values.push(field);
    field = "";
    afterQuote = false;
  };
  const pushRecord = () => {
    pushField();
    if (records.length + 1 > maxRecords) {
      fail(
        "limit-exceeded",
        `CSV exceeds the configured ${maxRecords} record limit`,
        { row: recordLine },
      );
    }
    records.push({ values, line: recordLine });
    values = [];
    touched = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\0") {
      fail("invalid-value", `NUL byte in CSV on line ${line}`, { row: line });
    }

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field = appendChecked(field, '"', maxFieldLength, recordLine);
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else if (char === "\r" || char === "\n") {
        field = appendChecked(field, "\n", maxFieldLength, recordLine);
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        line += 1;
      } else {
        field = appendChecked(field, char, maxFieldLength, recordLine);
      }
      touched = true;
      continue;
    }

    if (afterQuote) {
      if (char === ",") {
        pushField();
        touched = true;
      } else if (char === "\r" || char === "\n") {
        pushRecord();
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        line += 1;
        recordLine = line;
      } else {
        fail(
          "csv-malformed",
          `Unexpected character after closing quote on line ${line}`,
          { row: line },
        );
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        fail("csv-malformed", `Unexpected quote on line ${line}`, { row: line });
      }
      inQuotes = true;
      touched = true;
    } else if (char === ",") {
      pushField();
      touched = true;
    } else if (char === "\r" || char === "\n") {
      pushRecord();
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      line += 1;
      recordLine = line;
    } else {
      field = appendChecked(field, char, maxFieldLength, recordLine);
      touched = true;
    }
  }

  if (inQuotes) {
    fail("csv-malformed", `Unterminated quoted field beginning on line ${recordLine}`, {
      row: recordLine,
    });
  }
  if (touched || values.length > 0 || field.length > 0 || afterQuote) pushRecord();
  return records;
}

function resolveOptions(options: GtfsParserOptions): ResolvedGtfsParserOptions {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  for (const [key, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      fail("invalid-option", `${key} must be a positive safe integer`);
    }
  }
  if (resolved.maxFileBytes > resolved.maxTextBytes) {
    fail("invalid-option", "maxFileBytes cannot exceed maxTextBytes");
  }
  return resolved;
}

function utf8Bytes(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) {
        fail("invalid-value", "Input contains an unpaired Unicode surrogate");
      }
      bytes += 4;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("invalid-value", "Input contains an unpaired Unicode surrogate");
    } else bytes += 3;
  }
  return bytes;
}

function recognizedFiles(
  files: Record<string, string>,
  options: ResolvedGtfsParserOptions,
  warnings: GtfsWarning[],
) {
  const result = new Map<GtfsTableName, string>();
  let totalBytes = 0;
  for (const [suppliedName, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      fail("invalid-value", `File ${suppliedName} is not text`);
    }
    const bytes = utf8Bytes(content);
    totalBytes += bytes;
    if (bytes > options.maxFileBytes) {
      fail(
        "limit-exceeded",
        `${suppliedName} exceeds the configured ${options.maxFileBytes}-byte file limit`,
      );
    }
    if (totalBytes > options.maxTextBytes) {
      fail(
        "limit-exceeded",
        `GTFS input exceeds the configured ${options.maxTextBytes}-byte total limit`,
      );
    }
    const baseName = suppliedName.replace(/\\/g, "/").split("/").pop() ?? "";
    const table = FILE_TABLES[baseName.toLowerCase()];
    if (!table) {
      warnings.push({
        code: "ignored-file",
        message: `Ignored non-GTFS file ${suppliedName}`,
      });
      continue;
    }
    if (result.has(table)) {
      fail(
        "duplicate-file",
        `More than one file maps to ${TABLE_FILE[table]}`,
        { table },
      );
    }
    if (suppliedName !== TABLE_FILE[table]) {
      warnings.push({
        code: "noncanonical-file-name",
        table,
        message: `Read ${suppliedName} as ${TABLE_FILE[table]}`,
      });
    }
    result.set(table, content);
  }
  return result;
}

function assertSafeText(
  value: string,
  table: GtfsTableName,
  row: number,
  field: string,
) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0 ||
      (code < 0x20 && code !== 0x09 && code !== 0x0a) ||
      code === 0x7f
    ) {
      fail("invalid-value", `${field} contains a forbidden control character`, {
        table,
        row,
        field,
      });
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) {
        fail("invalid-value", `${field} contains invalid Unicode`, { table, row, field });
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("invalid-value", `${field} contains invalid Unicode`, { table, row, field });
    }
  }
}

function parseTable(
  table: GtfsTableName,
  source: string,
  options: ResolvedGtfsParserOptions,
  warnings: GtfsWarning[],
) {
  const records = parseRfc4180(source, {
    maxColumns: options.maxColumns,
    maxFieldLength: options.maxFieldLength,
    maxRecords: options.maxRowsPerFile + 1,
  });
  if (records.length === 0) {
    fail("invalid-header", `${TABLE_FILE[table]} has no header row`, { table });
  }
  const headers = records[0].values.map((header) => header.trim());
  if (headers.some((header) => !header)) {
    fail("invalid-header", `${TABLE_FILE[table]} contains an empty header`, {
      table,
      row: records[0].line,
    });
  }
  const headerSet = new Set<string>();
  for (const header of headers) {
    if (headerSet.has(header)) {
      fail("duplicate-header", `${TABLE_FILE[table]} repeats header ${header}`, {
        table,
        row: records[0].line,
        field: header,
      });
    }
    headerSet.add(header);
  }
  for (const required of REQUIRED_HEADERS[table]) {
    if (!headerSet.has(required)) {
      fail("missing-header", `${TABLE_FILE[table]} is missing ${required}`, {
        table,
        field: required,
      });
    }
  }

  const rows: TableRow[] = [];
  let warnedTrimmed = false;
  for (const record of records.slice(1)) {
    if (record.values.length > headers.length) {
      fail(
        "csv-malformed",
        `${TABLE_FILE[table]} row ${record.line} has more values than headers`,
        { table, row: record.line },
      );
    }
    if (record.values.every((value) => value.trim() === "")) {
      warnings.push({
        code: "blank-row",
        table,
        row: record.line,
        message: `Ignored blank ${TABLE_FILE[table]} row ${record.line}`,
      });
      continue;
    }
    const values: Record<string, string> = Object.create(null) as Record<string, string>;
    headers.forEach((header, index) => {
      const raw = record.values[index] ?? "";
      assertSafeText(raw, table, record.line, header);
      const value = raw.trim();
      if (value !== raw && !warnedTrimmed) {
        warnedTrimmed = true;
        warnings.push({
          code: "trimmed-value",
          table,
          row: record.line,
          message: `Trimmed surrounding whitespace in ${TABLE_FILE[table]}`,
        });
      }
      values[header] = value;
    });
    rows.push({ row: record.line, values });
  }
  return { table, headers, rows } satisfies ParsedTable;
}

function cell(row: TableRow, field: string) {
  return row.values[field] ?? "";
}

function requiredCell(table: GtfsTableName, row: TableRow, field: string) {
  const value = cell(row, field);
  if (!value) {
    fail("missing-value", `${TABLE_FILE[table]} row ${row.row} requires ${field}`, {
      table,
      row: row.row,
      field,
    });
  }
  return value;
}

function id(table: GtfsTableName, row: TableRow, field: string, required = true) {
  const value = required
    ? requiredCell(table, row, field)
    : cell(row, field) || null;
  if (value && /[\t\r\n]/.test(value)) {
    fail("invalid-value", `${field} cannot contain line breaks or tabs`, {
      table,
      row: row.row,
      field,
    });
  }
  return value;
}

function numberValue(
  table: GtfsTableName,
  row: TableRow,
  field: string,
  config: { required?: boolean; integer?: boolean; minimum?: number; maximum?: number } = {},
) {
  const raw = config.required
    ? requiredCell(table, row, field)
    : cell(row, field);
  if (!raw) return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) {
    fail("invalid-value", `${field} must be a finite number`, {
      table,
      row: row.row,
      field,
    });
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || (config.integer && !Number.isSafeInteger(value))) {
    fail("invalid-value", `${field} has an invalid numeric value`, {
      table,
      row: row.row,
      field,
    });
  }
  if (config.minimum !== undefined && value < config.minimum) {
    fail("invalid-value", `${field} cannot be below ${config.minimum}`, {
      table,
      row: row.row,
      field,
    });
  }
  if (config.maximum !== undefined && value > config.maximum) {
    fail("invalid-value", `${field} cannot exceed ${config.maximum}`, {
      table,
      row: row.row,
      field,
    });
  }
  return value;
}

function enumValue<const T extends readonly number[]>(
  table: GtfsTableName,
  row: TableRow,
  field: string,
  allowed: T,
  required = false,
): T[number] | null {
  const value = numberValue(table, row, field, { required, integer: true });
  if (value === null) return null;
  if (!(allowed as readonly number[]).includes(value)) {
    fail("invalid-value", `${field} must be one of ${allowed.join(", ")}`, {
      table,
      row: row.row,
      field,
    });
  }
  return value as T[number];
}

function urlValue(
  table: GtfsTableName,
  row: TableRow,
  field: string,
  required = false,
) {
  const raw = required ? requiredCell(table, row, field) : cell(row, field);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("invalid-value", `${field} must be an absolute HTTP(S) URL`, {
      table,
      row: row.row,
      field,
    });
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    fail("invalid-value", `${field} must be a safe HTTP(S) URL without credentials`, {
      table,
      row: row.row,
      field,
    });
  }
  return parsed.toString();
}

function dateValue(
  table: GtfsTableName,
  row: TableRow,
  field: string,
  required = false,
) {
  const raw = required ? requiredCell(table, row, field) : cell(row, field);
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (!match) {
    fail("invalid-value", `${field} must use YYYYMMDD`, {
      table,
      row: row.row,
      field,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    fail("invalid-value", `${field} contains an impossible date`, {
      table,
      row: row.row,
      field,
    });
  }
  return raw;
}

function timezoneValue(table: GtfsTableName, row: TableRow, field: string, required = false) {
  const raw = required ? requiredCell(table, row, field) : cell(row, field);
  if (!raw) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw }).format(0);
  } catch {
    fail("invalid-value", `${field} must be a valid IANA timezone`, {
      table,
      row: row.row,
      field,
    });
  }
  return raw;
}

function colorValue(table: GtfsTableName, row: TableRow, field: string) {
  const raw = cell(row, field);
  if (!raw) return null;
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) {
    fail("invalid-value", `${field} must be a six-character hexadecimal color`, {
      table,
      row: row.row,
      field,
    });
  }
  return raw.toUpperCase();
}

/** Parse GTFS HH:MM:SS while retaining service-day rollover. */
export function parseGtfsServiceTime(
  raw: string,
  maxServiceHour = DEFAULT_OPTIONS.maxServiceHour,
): GtfsServiceTime {
  if (!Number.isSafeInteger(maxServiceHour) || maxServiceHour < 1) {
    fail("invalid-option", "maxServiceHour must be a positive safe integer");
  }
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(raw);
  if (!match) fail("invalid-value", `Invalid GTFS service time ${raw}`);
  const hour = Number(match[1]);
  if (hour > maxServiceHour) {
    fail(
      "limit-exceeded",
      `GTFS service time hour ${hour} exceeds configured maximum ${maxServiceHour}`,
    );
  }
  const totalSeconds = hour * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return {
    raw,
    totalSeconds,
    secondsSinceMidnight: totalSeconds % 86_400,
    serviceDayOffset: Math.floor(totalSeconds / 86_400),
  };
}

function timeCell(
  table: GtfsTableName,
  row: TableRow,
  field: string,
  maxServiceHour: number,
  required = false,
) {
  const raw = required ? requiredCell(table, row, field) : cell(row, field);
  if (!raw) return null;
  try {
    return parseGtfsServiceTime(raw, maxServiceHour);
  } catch (error) {
    if (error instanceof GtfsParseError) {
      throw new GtfsParseError(error.code, `${field}: ${error.message}`, {
        table,
        row: row.row,
        field,
      });
    }
    throw error;
  }
}

function duplicateKey(
  seen: Set<string>,
  key: string,
  table: GtfsTableName,
  row: TableRow,
  field: string,
) {
  if (seen.has(key)) {
    fail("duplicate-id", `${TABLE_FILE[table]} repeats ${field} ${key}`, {
      table,
      row: row.row,
      field,
    });
  }
  seen.add(key);
}

function parseAgencies(table: ParsedTable): GtfsAgency[] {
  const agencies: GtfsAgency[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const agencyId = id("agency", row, "agency_id", false);
    if (agencyId !== null) duplicateKey(seen, agencyId, "agency", row, "agency_id");
    agencies.push({
      id: agencyId,
      name: requiredCell("agency", row, "agency_name"),
      url: urlValue("agency", row, "agency_url", true)!,
      timezone: timezoneValue("agency", row, "agency_timezone", true)!,
      lang: cell(row, "agency_lang") || null,
      phone: cell(row, "agency_phone") || null,
    });
  }
  if (agencies.length > 1 && agencies.some((agency) => agency.id === null)) {
    fail(
      "missing-value",
      "agency_id is required when agency.txt contains multiple agencies",
      { table: "agency", field: "agency_id" },
    );
  }
  return agencies;
}

function parseStops(table: ParsedTable, warnings: GtfsWarning[]): GtfsStop[] {
  const stops: GtfsStop[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const stopId = id("stops", row, "stop_id")!;
    duplicateKey(seen, stopId, "stops", row, "stop_id");
    const locationType = enumValue("stops", row, "location_type", [0, 1, 2, 3, 4] as const) ?? 0;
    const stopName = cell(row, "stop_name") || null;
    if ((locationType === 0 || locationType === 1 || locationType === 2) && !stopName) {
      fail("missing-value", "stop_name is required for stops, stations, and entrances", {
        table: "stops",
        row: row.row,
        field: "stop_name",
      });
    }
    const latitude = numberValue("stops", row, "stop_lat", {
      minimum: -90,
      maximum: 90,
    });
    const longitude = numberValue("stops", row, "stop_lon", {
      minimum: -180,
      maximum: 180,
    });
    if ((latitude === null) !== (longitude === null)) {
      fail("invalid-value", "stop_lat and stop_lon must either both be set or both be empty", {
        table: "stops",
        row: row.row,
        field: latitude === null ? "stop_lat" : "stop_lon",
      });
    }
    if (latitude === null && (locationType === 0 || locationType === 1)) {
      warnings.push({
        code: "missing-coordinate",
        table: "stops",
        row: row.row,
        message: `Stop ${stopId} has no coordinates`,
      });
    }
    stops.push({
      id: stopId,
      code: cell(row, "stop_code") || null,
      name: stopName,
      description: cell(row, "stop_desc") || null,
      latitude,
      longitude,
      locationType,
      parentStationId: id("stops", row, "parent_station", false),
      timezone: timezoneValue("stops", row, "stop_timezone"),
      wheelchairBoarding: enumValue(
        "stops",
        row,
        "wheelchair_boarding",
        [0, 1, 2] as const,
      ),
    });
  }
  return stops;
}

function parseRoutes(table: ParsedTable): GtfsRoute[] {
  const routes: GtfsRoute[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const routeId = id("routes", row, "route_id")!;
    duplicateKey(seen, routeId, "routes", row, "route_id");
    const shortName = cell(row, "route_short_name") || null;
    const longName = cell(row, "route_long_name") || null;
    if (!shortName && !longName) {
      fail("missing-value", "A route requires route_short_name or route_long_name", {
        table: "routes",
        row: row.row,
        field: "route_short_name",
      });
    }
    if (shortName && longName && shortName === longName) {
      fail("invalid-value", "route_short_name and route_long_name must differ", {
        table: "routes",
        row: row.row,
        field: "route_long_name",
      });
    }
    routes.push({
      id: routeId,
      agencyId: id("routes", row, "agency_id", false),
      shortName,
      longName,
      description: cell(row, "route_desc") || null,
      type: numberValue("routes", row, "route_type", {
        required: true,
        integer: true,
        minimum: 0,
        maximum: 9999,
      })!,
      url: urlValue("routes", row, "route_url"),
      color: colorValue("routes", row, "route_color"),
      textColor: colorValue("routes", row, "route_text_color"),
    });
  }
  return routes;
}

function parseTrips(table: ParsedTable): GtfsTrip[] {
  const trips: GtfsTrip[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const tripId = id("trips", row, "trip_id")!;
    duplicateKey(seen, tripId, "trips", row, "trip_id");
    trips.push({
      id: tripId,
      routeId: id("trips", row, "route_id")!,
      serviceId: id("trips", row, "service_id")!,
      headsign: cell(row, "trip_headsign") || null,
      shortName: cell(row, "trip_short_name") || null,
      directionId: enumValue("trips", row, "direction_id", [0, 1] as const),
      blockId: id("trips", row, "block_id", false),
      shapeId: id("trips", row, "shape_id", false),
      wheelchairAccessible: enumValue(
        "trips",
        row,
        "wheelchair_accessible",
        [0, 1, 2] as const,
      ),
      bikesAllowed: enumValue("trips", row, "bikes_allowed", [0, 1, 2] as const),
    });
  }
  return trips;
}

function parseStopTimes(
  table: ParsedTable,
  maxServiceHour: number,
): GtfsStopTime[] {
  const stopTimes: GtfsStopTime[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const tripId = id("stop_times", row, "trip_id")!;
    const stopSequence = numberValue("stop_times", row, "stop_sequence", {
      required: true,
      integer: true,
      minimum: 0,
    })!;
    duplicateKey(seen, `${tripId}\0${stopSequence}`, "stop_times", row, "stop_sequence");
    stopTimes.push({
      tripId,
      arrivalTime: timeCell(
        "stop_times",
        row,
        "arrival_time",
        maxServiceHour,
      ),
      departureTime: timeCell(
        "stop_times",
        row,
        "departure_time",
        maxServiceHour,
      ),
      stopId: id("stop_times", row, "stop_id")!,
      stopSequence,
      stopHeadsign: cell(row, "stop_headsign") || null,
      pickupType: enumValue("stop_times", row, "pickup_type", [0, 1, 2, 3] as const),
      dropOffType: enumValue(
        "stop_times",
        row,
        "drop_off_type",
        [0, 1, 2, 3] as const,
      ),
      shapeDistanceTraveled: numberValue(
        "stop_times",
        row,
        "shape_dist_traveled",
        { minimum: 0 },
      ),
      timepoint: enumValue("stop_times", row, "timepoint", [0, 1] as const),
    });
  }
  return stopTimes;
}

function parseCalendars(table: ParsedTable | undefined): GtfsCalendar[] {
  if (!table) return [];
  const calendars: GtfsCalendar[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const serviceId = id("calendar", row, "service_id")!;
    duplicateKey(seen, serviceId, "calendar", row, "service_id");
    const weekdayFields = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ] as const;
    const weekdays = weekdayFields.map(
      (field) => enumValue("calendar", row, field, [0, 1] as const, true) === 1,
    ) as unknown as GtfsCalendar["weekdays"];
    const startDate = dateValue("calendar", row, "start_date", true)!;
    const endDate = dateValue("calendar", row, "end_date", true)!;
    if (startDate > endDate) {
      fail("invalid-value", "calendar start_date must not follow end_date", {
        table: "calendar",
        row: row.row,
        field: "start_date",
      });
    }
    calendars.push({ serviceId, weekdays, startDate, endDate });
  }
  return calendars;
}

function parseCalendarDates(table: ParsedTable | undefined): GtfsCalendarDate[] {
  if (!table) return [];
  const dates: GtfsCalendarDate[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const serviceId = id("calendar_dates", row, "service_id")!;
    const date = dateValue("calendar_dates", row, "date", true)!;
    duplicateKey(
      seen,
      `${serviceId}\0${date}`,
      "calendar_dates",
      row,
      "service_id/date",
    );
    dates.push({
      serviceId,
      date,
      exceptionType: enumValue(
        "calendar_dates",
        row,
        "exception_type",
        [1, 2] as const,
        true,
      )!,
    });
  }
  return dates;
}

function parseFrequencies(
  table: ParsedTable | undefined,
  maxServiceHour: number,
): GtfsFrequency[] {
  if (!table) return [];
  const frequencies: GtfsFrequency[] = [];
  for (const row of table.rows) {
    const startTime = timeCell(
      "frequencies",
      row,
      "start_time",
      maxServiceHour,
      true,
    )!;
    const endTime = timeCell(
      "frequencies",
      row,
      "end_time",
      maxServiceHour,
      true,
    )!;
    if (startTime.totalSeconds >= endTime.totalSeconds) {
      fail("invalid-value", "frequency start_time must precede end_time", {
        table: "frequencies",
        row: row.row,
        field: "start_time",
      });
    }
    frequencies.push({
      tripId: id("frequencies", row, "trip_id")!,
      startTime,
      endTime,
      headwaySeconds: numberValue("frequencies", row, "headway_secs", {
        required: true,
        integer: true,
        minimum: 1,
        maximum: 86_400,
      })!,
      exactTimes: enumValue("frequencies", row, "exact_times", [0, 1] as const),
    });
  }
  return frequencies;
}

function parseShapes(table: ParsedTable | undefined): GtfsShapePoint[] {
  if (!table) return [];
  const shapes: GtfsShapePoint[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const shapeId = id("shapes", row, "shape_id")!;
    const sequence = numberValue("shapes", row, "shape_pt_sequence", {
      required: true,
      integer: true,
      minimum: 0,
    })!;
    duplicateKey(seen, `${shapeId}\0${sequence}`, "shapes", row, "shape_pt_sequence");
    shapes.push({
      shapeId,
      latitude: numberValue("shapes", row, "shape_pt_lat", {
        required: true,
        minimum: -90,
        maximum: 90,
      })!,
      longitude: numberValue("shapes", row, "shape_pt_lon", {
        required: true,
        minimum: -180,
        maximum: 180,
      })!,
      sequence,
      distanceTraveled: numberValue("shapes", row, "shape_dist_traveled", {
        minimum: 0,
      }),
    });
  }
  return shapes;
}

function parseFeedInfo(table: ParsedTable | undefined): GtfsFeedInfo | null {
  if (!table || table.rows.length === 0) return null;
  if (table.rows.length > 1) {
    fail("invalid-value", "feed_info.txt must contain at most one data row", {
      table: "feed_info",
      row: table.rows[1].row,
    });
  }
  const row = table.rows[0];
  const startDate = dateValue("feed_info", row, "feed_start_date");
  const endDate = dateValue("feed_info", row, "feed_end_date");
  if (startDate && endDate && startDate > endDate) {
    fail("invalid-value", "feed_start_date must not follow feed_end_date", {
      table: "feed_info",
      row: row.row,
      field: "feed_start_date",
    });
  }
  const email = cell(row, "feed_contact_email") || null;
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) {
    fail("invalid-value", "feed_contact_email is not a valid email address", {
      table: "feed_info",
      row: row.row,
      field: "feed_contact_email",
    });
  }
  return {
    publisherName: requiredCell("feed_info", row, "feed_publisher_name"),
    publisherUrl: urlValue("feed_info", row, "feed_publisher_url", true)!,
    language: requiredCell("feed_info", row, "feed_lang"),
    defaultLanguage: cell(row, "default_lang") || null,
    startDate,
    endDate,
    version: cell(row, "feed_version") || null,
    contactEmail: email,
    contactUrl: urlValue("feed_info", row, "feed_contact_url"),
  };
}

function assertReference(
  condition: boolean,
  message: string,
  table: GtfsTableName,
  field: string,
) {
  if (!condition) fail("foreign-key", message, { table, field });
}

function validateDataset(dataset: GtfsDataset, warnings: GtfsWarning[]) {
  const agencyIds = new Set(
    dataset.agencies.flatMap((agency) => (agency.id === null ? [] : [agency.id])),
  );
  const stopIds = new Set(dataset.stops.map((stop) => stop.id));
  const routeIds = new Set(dataset.routes.map((route) => route.id));
  const tripIds = new Set(dataset.trips.map((trip) => trip.id));
  const serviceIds = new Set([
    ...dataset.calendars.map((calendar) => calendar.serviceId),
    ...dataset.calendarDates.map((date) => date.serviceId),
  ]);
  const shapeIds = new Set(dataset.shapes.map((shape) => shape.shapeId));

  for (const stop of dataset.stops) {
    if (stop.parentStationId) {
      assertReference(
        stop.parentStationId !== stop.id && stopIds.has(stop.parentStationId),
        `Stop ${stop.id} references unknown or self parent ${stop.parentStationId}`,
        "stops",
        "parent_station",
      );
    }
  }

  for (const route of dataset.routes) {
    if (route.agencyId) {
      assertReference(
        agencyIds.has(route.agencyId),
        `Route ${route.id} references unknown agency ${route.agencyId}`,
        "routes",
        "agency_id",
      );
    } else if (dataset.agencies.length > 1) {
      fail("missing-value", `Route ${route.id} requires agency_id in a multi-agency feed`, {
        table: "routes",
        field: "agency_id",
      });
    }
  }

  for (const trip of dataset.trips) {
    assertReference(
      routeIds.has(trip.routeId),
      `Trip ${trip.id} references unknown route ${trip.routeId}`,
      "trips",
      "route_id",
    );
    assertReference(
      serviceIds.has(trip.serviceId),
      `Trip ${trip.id} references unknown service ${trip.serviceId}`,
      "trips",
      "service_id",
    );
    if (trip.shapeId) {
      assertReference(
        shapeIds.has(trip.shapeId),
        `Trip ${trip.id} references unknown shape ${trip.shapeId}`,
        "trips",
        "shape_id",
      );
    }
  }

  const stopsByTrip = new Map<string, GtfsStopTime[]>();
  for (const stopTime of dataset.stopTimes) {
    assertReference(
      tripIds.has(stopTime.tripId),
      `stop_times references unknown trip ${stopTime.tripId}`,
      "stop_times",
      "trip_id",
    );
    assertReference(
      stopIds.has(stopTime.stopId),
      `stop_times references unknown stop ${stopTime.stopId}`,
      "stop_times",
      "stop_id",
    );
    const rows = stopsByTrip.get(stopTime.tripId) ?? [];
    rows.push(stopTime);
    stopsByTrip.set(stopTime.tripId, rows);
  }
  for (const trip of dataset.trips) {
    const stopTimes = stopsByTrip.get(trip.id);
    if (!stopTimes?.length) {
      warnings.push({
        code: "unused-entity",
        table: "trips",
        message: `Trip ${trip.id} has no stop_times rows`,
      });
      continue;
    }
    const ordered = [...stopTimes].sort((a, b) => a.stopSequence - b.stopSequence);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (
      (!first.arrivalTime && !first.departureTime) ||
      (!last.arrivalTime && !last.departureTime)
    ) {
      fail(
        "missing-value",
        `Trip ${trip.id} requires a time at its first and last stop`,
        { table: "stop_times", field: "arrival_time/departure_time" },
      );
    }
  }

  for (const frequency of dataset.frequencies) {
    assertReference(
      tripIds.has(frequency.tripId),
      `frequencies references unknown trip ${frequency.tripId}`,
      "frequencies",
      "trip_id",
    );
  }

  const usedRoutes = new Set(dataset.trips.map((trip) => trip.routeId));
  const unusedRouteCount = dataset.routes.filter((route) => !usedRoutes.has(route.id)).length;
  if (unusedRouteCount) {
    warnings.push({
      code: "unused-entity",
      table: "routes",
      message: `${unusedRouteCount} route(s) have no trips`,
    });
  }
}

/**
 * Parse already-unzipped GTFS text files into a normalized, validated dataset.
 * The parser performs no I/O and is safe to run before persisting any feed.
 */
export function parseGtfs(
  files: Record<string, string>,
  parserOptions: GtfsParserOptions = {},
): GtfsParseResult {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    fail("invalid-value", "GTFS files must be supplied as a filename-to-text record");
  }
  const options = resolveOptions(parserOptions);
  const warnings: GtfsWarning[] = [];
  const sources = recognizedFiles(files, options, warnings);
  for (const required of REQUIRED_TABLES) {
    if (!sources.has(required)) {
      fail("missing-file", `GTFS feed is missing ${TABLE_FILE[required]}`, {
        table: required,
      });
    }
  }
  if (!sources.has("calendar") && !sources.has("calendar_dates")) {
    fail(
      "missing-file",
      "GTFS feed requires calendar.txt, calendar_dates.txt, or both",
      { table: "calendar" },
    );
  }

  const tables = new Map<GtfsTableName, ParsedTable>();
  let totalRows = 0;
  for (const [table, source] of sources) {
    const parsed = parseTable(table, source, options, warnings);
    totalRows += parsed.rows.length;
    if (totalRows > options.maxTotalRows) {
      fail(
        "limit-exceeded",
        `GTFS feed exceeds the configured ${options.maxTotalRows}-row total limit`,
        { table },
      );
    }
    if (parsed.rows.length === 0 && !REQUIRED_TABLES.includes(table)) {
      warnings.push({
        code: "empty-optional-table",
        table,
        message: `${TABLE_FILE[table]} has no data rows`,
      });
    }
    tables.set(table, parsed);
  }
  for (const required of REQUIRED_TABLES) {
    if (!tables.get(required)!.rows.length) {
      fail("missing-value", `${TABLE_FILE[required]} requires at least one data row`, {
        table: required,
      });
    }
  }

  const dataset: GtfsDataset = {
    agencies: parseAgencies(tables.get("agency")!),
    stops: parseStops(tables.get("stops")!, warnings),
    routes: parseRoutes(tables.get("routes")!),
    trips: parseTrips(tables.get("trips")!),
    stopTimes: parseStopTimes(tables.get("stop_times")!, options.maxServiceHour),
    calendars: parseCalendars(tables.get("calendar")),
    calendarDates: parseCalendarDates(tables.get("calendar_dates")),
    frequencies: parseFrequencies(tables.get("frequencies"), options.maxServiceHour),
    shapes: parseShapes(tables.get("shapes")),
    feedInfo: parseFeedInfo(tables.get("feed_info")),
  };
  if (dataset.calendars.length === 0 && dataset.calendarDates.length === 0) {
    fail("missing-value", "At least one service calendar row is required", {
      table: "calendar",
    });
  }
  validateDataset(dataset, warnings);
  return { dataset, warnings };
}
