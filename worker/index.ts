/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  ODPT_API_TOKEN?: string;
  PC_MONITOR_TOKEN?: string;
  TEMPERATURE_CACHE?: KVNamespace;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type TemperaturePayload = {
  cpuTemperature: number;
  gpuTemperature: number;
  cpuName?: string;
  gpuName?: string;
  pumpRpm?: number;
  capturedAt: string;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: JSON_HEADERS });
}

function isTemperaturePayload(value: unknown): value is TemperaturePayload {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.cpuTemperature === "number" && Number.isFinite(data.cpuTemperature)
    && typeof data.gpuTemperature === "number" && Number.isFinite(data.gpuTemperature)
    && typeof data.capturedAt === "string" && !Number.isNaN(Date.parse(data.capturedAt));
}

function isTemperatureQuietHours() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));
  return hour >= 2 && hour < 6;
}

function wasSavedWithinFiveMinutes(latest: TemperaturePayload | null) {
  return Boolean(latest && Date.now() - Date.parse(latest.capturedAt) < 5 * 60 * 1000);
}

const WEATHER_LOCATIONS = [
  { name: "埼玉県川口市", latitude: 35.8077, longitude: 139.7241 },
  { name: "東京都台東区", latitude: 35.7126, longitude: 139.78 },
];

function weatherLabel(code: number) {
  if (code === 0) return "晴れ";
  if ([1, 2].includes(code)) return "晴れ時々くもり";
  if (code === 3 || [45, 48].includes(code)) return "くもり";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  return "雷雨";
}

function weatherEmoji(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3 || [45, 48].includes(code)) return "☁️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌧️";
}

async function getWeather() {
  const query = new URLSearchParams({
    latitude: WEATHER_LOCATIONS.map((location) => location.latitude).join(","),
    longitude: WEATHER_LOCATIONS.map((location) => location.longitude).join(","),
    timezone: "Asia/Tokyo",
    forecast_days: "4",
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,precipitation,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error("天気情報の取得に失敗しました。");
  const results = await response.json() as Array<any>;
  return {
    fetchedAt: new Date().toISOString(),
    places: results.map((result, index) => {
      const currentHourIndex = Math.max(0, result.hourly.time.findIndex((time: string) => time >= result.current.time));
      const probability = (date: string, fromHour: number, toHour: number) => {
        const values = result.hourly.time.map((time: string, hour: number) => ({
          time,
          probability: result.hourly.precipitation_probability[hour],
          precipitation: result.hourly.precipitation[hour],
        }))
          .filter(({ time, precipitation }: { time: string; precipitation: number }) => time.startsWith(date)
            && Number(time.slice(11, 13)) >= fromHour
            && Number(time.slice(11, 13)) <= toHour
            && precipitation > 0)
          .map(({ probability }: { probability: number }) => probability);
        return values.length ? Math.max(...values) : 0;
      };
      const rainProbabilityForDay = (day: number) => probability(result.daily.time[day], 0, 23);
      return {
      name: WEATHER_LOCATIONS[index].name,
      summary: weatherLabel(result.current.weather_code),
      now: `${Math.round(result.current.temperature_2m)}°`,
      high: Math.round(result.daily.temperature_2m_max[0]),
      low: Math.round(result.daily.temperature_2m_min[0]),
      hourly: result.hourly.time.slice(currentHourIndex, currentHourIndex + 12).map((time: string, offset: number) => {
        const hour = currentHourIndex + offset;
        return [
        hour === 0 ? "いま" : `${time.slice(11, 13)}時`,
        weatherEmoji(result.hourly.weather_code[hour]),
        `${Math.round(result.hourly.temperature_2m[hour])}°`,
        `${result.hourly.precipitation[hour]}mm`,
        ];
      }),
      days: result.daily.time.slice(0, 4).map((_: string, day: number) => [
        ["今日", "明日", "明後日", "3日後"][day],
        weatherEmoji(result.daily.weather_code[day]),
        `${Math.round(result.daily.temperature_2m_max[day])}°`,
        `${Math.round(result.daily.temperature_2m_min[day])}°`,
        `${rainProbabilityForDay(day)}%`,
      ]),
      todayTomorrow: result.daily.time.slice(0, 2).map((date: string, day: number) => {
        return {
          key: day === 0 ? "today" : "tomorrow",
          emoji: weatherEmoji(result.daily.weather_code[day]),
          high: Math.round(result.daily.temperature_2m_max[day]),
          low: Math.round(result.daily.temperature_2m_min[day]),
          morning: probability(date, 0, 11),
          afternoon: probability(date, 12, 23),
        };
      }),
    };
    }),
  };
}

const DISRUPTION_PATTERN = /遅延|事故|運転見合わせ|直通運転中止/;

function routeName(value: unknown) {
  const id = String(value ?? "").split(".").pop() ?? "対象路線";
  return id.replaceAll("-", " ");
}

async function getTransitInformation(token: string) {
  const operators = ["odpt.Operator:JR-East", "odpt.Operator:TokyoMetro"];
  const responses = await Promise.all(operators.map(async (operator) => {
    const query = new URLSearchParams({ "odpt:operator": operator, "acl:consumerKey": token });
    const response = await fetch(`https://api.odpt.org/api/v4/odpt:TrainInformation?${query}`);
    if (!response.ok) throw new Error("ODPTの運行情報を取得できませんでした。");
    return response.json() as Promise<Array<Record<string, unknown>>>;
  }));
  const items = responses.flat();
  const incidents = items.map((item) => {
    const text = String(item["odpt:trainInformationText"] ?? item["odpt:trainInformationStatus"] ?? "");
    return {
      line: routeName(item["odpt:railway"]),
      detail: text,
      updatedAt: String(item["dc:date"] ?? new Date().toISOString()),
      frequency: Number(item["odpt:frequency"] ?? 0),
    };
  }).filter((item) => DISRUPTION_PATTERN.test(item.detail));
  return { status: "ready", fetchedAt: new Date().toISOString(), incidents };
}

type NewsTopic = "politics" | "domestic" | "it" | "investment";
type NewsItem = { title: string; url: string; source: string; publishedAt: string };
type NewsPayload = { status: "ready" | "error"; fetchedAt: string; topics: Record<NewsTopic, NewsItem[]> };

const NEWS_TOPICS: Array<{ key: NewsTopic; label: string; query: string }> = [
  { key: "politics", label: "日本政治", query: "日本 政治" },
  { key: "domestic", label: "国内・天気", query: "日本 国内 天気 防災" },
  { key: "it", label: "IT", query: "IT システムエンジニア" },
  { key: "investment", label: "インデックス投資", query: "インデックス投資 投資信託 -FX -為替 -個別株" },
];

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function rssTag(item: string, tag: string) {
  const matched = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return matched ? decodeXml(matched[1]) : "";
}

function normalizeNewsTitle(title: string) {
  return title.normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[「」『』【】〔〕（）()\[\]…・:：!！?？、,，.。]/g, "")
    .toLowerCase();
}

function toNewsItems(xml: string) {
  const seen = new Set<string>();
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []).slice(0, 20).map((item) => {
    const rawTitle = rssTag(item, "title");
    const parts = rawTitle.split(" - ");
    const source = parts.length > 1 ? parts.pop()! : "ニュース";
    return {
      title: parts.join(" - ") || rawTitle,
      source,
      url: rssTag(item, "link"),
      publishedAt: rssTag(item, "pubDate"),
    };
  }).filter((item) => {
    const key = normalizeNewsTitle(item.title);
    if (!item.title || !item.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

async function fetchNewsTopic(topic: typeof NEWS_TOPICS[number]) {
  const params = new URLSearchParams({ q: topic.query, hl: "ja", gl: "JP", ceid: "JP:ja" });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://news.google.com/rss/search?${params}`, {
      headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
    });
    if (response.ok) return toNewsItems(await response.text());
    if (attempt === 0 && response.status >= 500) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`news_${topic.key}`);
}

async function getNews(previous: NewsPayload | null = null): Promise<NewsPayload> {
  const entries = await Promise.all(NEWS_TOPICS.map(async (topic) => {
    try {
      return { key: topic.key, items: await fetchNewsTopic(topic), fresh: true };
    } catch {
      return { key: topic.key, items: previous?.topics[topic.key] ?? [], fresh: false };
    }
  }));
  const hasFreshData = entries.some((entry) => entry.fresh);
  if (!hasFreshData && !previous) throw new Error("news_unavailable");
  return {
    status: "ready",
    fetchedAt: hasFreshData ? new Date().toISOString() : previous!.fetchedAt,
    topics: Object.fromEntries(entries.map((entry) => [entry.key, entry.items])) as Record<NewsTopic, NewsItem[]>,
  };
}

async function refreshNewsCache(env: Env, previous: NewsPayload | null = null) {
  const news = await getNews(previous);
  if (env.TEMPERATURE_CACHE && news.fetchedAt !== previous?.fetchedAt) await env.TEMPERATURE_CACHE.put("news:latest", JSON.stringify(news));
  return news;
}

function lastScheduledNewsRefreshTime(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(now)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  const schedule = [20, 16, 12, 6];
  const hour = schedule.find((value) => value <= values.hour);
  const targetHour = hour ?? 20;
  const targetDay = hour === undefined ? values.day - 1 : values.day;
  return Date.UTC(values.year, values.month - 1, targetDay, targetHour - 9, 0, 0);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/pc-temperature") {
      if (!env.TEMPERATURE_CACHE) {
        return json({ status: "setup_required", message: "温度監視の保存先はまだ設定されていません。" }, 503);
      }

      if (request.method === "GET") {
        const latest = await env.TEMPERATURE_CACHE.get<TemperaturePayload>("latest", "json");
        return json({ status: latest ? "ready" : "waiting", latest });
      }

      if (request.method === "POST") {
        const authorization = request.headers.get("Authorization");
        if (!env.PC_MONITOR_TOKEN || authorization !== `Bearer ${env.PC_MONITOR_TOKEN}`) {
          return json({ error: "unauthorized" }, 401);
        }
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        if (!isTemperaturePayload(payload)) return json({ error: "invalid_temperature_payload" }, 400);
        if (isTemperatureQuietHours()) {
          return json({ status: "skipped", reason: "quiet_hours" });
        }
        const latest = await env.TEMPERATURE_CACHE.get<TemperaturePayload>("latest", "json");
        if (wasSavedWithinFiveMinutes(latest)) {
          return json({ status: "skipped", reason: "five_minute_interval" });
        }
        const normalized: TemperaturePayload = {
          cpuTemperature: Math.round(payload.cpuTemperature * 10) / 10,
          gpuTemperature: Math.round(payload.gpuTemperature * 10) / 10,
          ...(typeof payload.cpuName === "string" ? { cpuName: payload.cpuName.slice(0, 120) } : {}),
          ...(typeof payload.gpuName === "string" ? { gpuName: payload.gpuName.slice(0, 120) } : {}),
          ...(typeof payload.pumpRpm === "number" && Number.isFinite(payload.pumpRpm) ? { pumpRpm: Math.round(payload.pumpRpm) } : {}),
          capturedAt: payload.capturedAt,
        };
        await env.TEMPERATURE_CACHE.put("latest", JSON.stringify(normalized));
        return json({ status: "saved", savedAt: new Date().toISOString() });
      }

      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === "/api/weather") {
      try {
        return Response.json(await getWeather(), { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "天気情報を取得できませんでした。" }, { status: 502 });
      }
    }

    if (url.pathname === "/api/transit") {
      if (!env.ODPT_API_TOKEN) {
        return Response.json({
          status: "pending",
          message: "ODPTのアクセストークン承認待ちのため、運行情報を準備中です。",
          incidents: [],
          fetchedAt: new Date().toISOString(),
        });
      }
      try {
        return Response.json(await getTransitInformation(env.ODPT_API_TOKEN), { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return Response.json({ status: "error", message: error instanceof Error ? error.message : "運行情報を取得できませんでした。", incidents: [] }, { status: 502 });
      }
    }

    if (url.pathname === "/api/news") {
      let cached: NewsPayload | null = null;
      try {
        cached = env.TEMPERATURE_CACHE ? await env.TEMPERATURE_CACHE.get<NewsPayload>("news:latest", "json") : null;
        const needsRefresh = !cached || Date.parse(cached.fetchedAt) < lastScheduledNewsRefreshTime();
        return json(needsRefresh ? await refreshNewsCache(env, cached) : cached);
      } catch {
        if (cached) return json(cached);
        return json({ status: "error", fetchedAt: new Date().toISOString(), topics: {} }, 502);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: unknown, env: Env) {
    const cached = env.TEMPERATURE_CACHE ? await env.TEMPERATURE_CACHE.get<NewsPayload>("news:latest", "json") : null;
    await refreshNewsCache(env, cached);
  },
};

export default worker;
