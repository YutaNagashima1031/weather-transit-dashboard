/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  ODPT_API_TOKEN?: string;
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
    forecast_hours: "12",
    forecast_days: "4",
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,precipitation,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error("天気情報の取得に失敗しました。");
  const results = await response.json() as Array<any>;
  return {
    fetchedAt: new Date().toISOString(),
    places: results.map((result, index) => ({
      name: WEATHER_LOCATIONS[index].name,
      summary: weatherLabel(result.current.weather_code),
      now: `${Math.round(result.current.temperature_2m)}°`,
      high: Math.round(result.daily.temperature_2m_max[0]),
      low: Math.round(result.daily.temperature_2m_min[0]),
      hourly: result.hourly.time.slice(0, 12).map((time: string, hour: number) => [
        hour === 0 ? "いま" : `${time.slice(11, 13)}時`,
        weatherEmoji(result.hourly.weather_code[hour]),
        `${Math.round(result.hourly.temperature_2m[hour])}°`,
        `${result.hourly.precipitation[hour]}mm`,
      ]),
      days: result.daily.time.slice(0, 4).map((_: string, day: number) => [
        ["今日", "明日", "明後日", "3日後"][day],
        weatherEmoji(result.daily.weather_code[day]),
        `${Math.round(result.daily.temperature_2m_max[day])}°`,
        `${Math.round(result.daily.temperature_2m_min[day])}°`,
        `${result.daily.precipitation_probability_max[day]}%`,
      ]),
    })),
  };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
      return Response.json({ status: "ready", incidents: [], fetchedAt: new Date().toISOString() });
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
};

export default worker;
