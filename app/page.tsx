"use client";

import { useEffect, useState } from "react";

type TodayForecast = { key: "today" | "tomorrow"; emoji: string; high: number; low: number; morning: number; afternoon: number };
type Place = { name: string; summary: string; now: string; high: number; low: number; hourly: string[][]; days?: string[][]; todayTomorrow?: TodayForecast[] };
type Temperature = { cpuTemperature: number; gpuTemperature: number; cpuName?: string; gpuName?: string; capturedAt: string };
type TransitIncident = { line: string; detail: string; updatedAt: string; frequency?: number };
type Transit = { status: "ready" | "pending" | "error"; fetchedAt?: string; message?: string; incidents: TransitIncident[] };
type Tab = "hourly" | "today" | "days";

const fallbackPlaces: Place[] = [
  { name: "埼玉県川口市", summary: "読み込み中", now: "--℃", high: 0, low: 0, hourly: [] },
  { name: "東京都台東区", summary: "読み込み中", now: "--℃", high: 0, low: 0, hourly: [] },
];

function jst(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function temperatureState(value: number) {
  if (value >= 90) return "danger";
  if (value >= 75) return "caution";
  if (value >= 60) return "safe";
  return "normal";
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("hourly");
  const [dark, setDark] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState("");
  const [places, setPlaces] = useState<Place[]>(fallbackPlaces);
  const [temperature, setTemperature] = useState<Temperature | null>(null);
  const [temperatureStatus, setTemperatureStatus] = useState("PC監視ツールの接続待ち");
  const [transit, setTransit] = useState<Transit>({ status: "pending", incidents: [], message: "運行情報を確認中です" });

  const updateWeather = async () => {
    const response = await fetch("/api/weather");
    if (!response.ok) throw new Error("weather");
    const data = await response.json() as { places: Place[]; fetchedAt: string };
    setPlaces(data.places);
    setUpdated(jst(data.fetchedAt));
  };

  const updateTemperature = async () => {
    try {
      const response = await fetch("/api/pc-temperature", { cache: "no-store" });
      const data = await response.json() as { status: string; latest?: Temperature; message?: string };
      if (data.status === "ready" && data.latest) {
        setTemperature(data.latest);
        setTemperatureStatus(`PCから ${jst(data.latest.capturedAt)} に取得`);
      } else if (data.status === "setup_required") {
        setTemperatureStatus("初回設定待ち");
      } else {
        setTemperatureStatus("PC監視ツールの接続待ち");
      }
    } catch {
      setTemperatureStatus("温度情報を確認できません");
    }
  };

  const updateTransit = async () => {
    try {
      const response = await fetch("/api/transit", { cache: "no-store" });
      const data = await response.json() as Transit;
      setTransit(data);
    } catch {
      setTransit({ status: "error", incidents: [], message: "運行情報を取得できません" });
    }
  };

  useEffect(() => {
    updateWeather().catch(() => setUpdated("天気情報を取得できません"));
    updateTemperature();
    updateTransit();
    const temperatureTimer = window.setInterval(updateTemperature, 60_000);
    const saved = localStorage.getItem("theme");
    setDark(saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
    return () => window.clearInterval(temperatureTimer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const refresh = async () => {
    setUpdating(true);
    try {
      await Promise.all([updateWeather(), updateTemperature(), updateTransit()]);
    } finally {
      setUpdating(false);
    }
  };

  return <main>
    <header className="bar wrap">
      <a className="brand" href="#top"><b>☀</b>首都圏 <strong>天気・運行情報</strong></a>
      <div className="actions"><small><i /> 最終更新 {updated || "読み込み中"}</small><button className="refresh" disabled={updating} onClick={refresh}>↻ {updating ? "更新中…" : "情報を更新"}</button><button onClick={() => setDark(!dark)}>{dark ? "☀ ライト" : "◐ ダーク"}</button></div>
    </header>

    <section id="top" className="hero wrap"><div><p>WEATHER & TRANSIT / TOKYO AREA</p><h1>今日の移動を、<br /><em>ひと目で。</em></h1><span>埼玉県川口市・東京都台東区の天気と、首都圏の運行情報をまとめて確認できます。</span></div><aside><b>☀</b><div><small>現在の東京エリア</small><strong>天気と運行情報</strong><span>更新ボタンで最新情報を取得</span></div></aside></section>

    <section className="weather wrap"><div className="title"><div><p>WEATHER FORECAST</p><h2>2地点の天気予報</h2></div><small>取得日時: {updated || "読み込み中"}</small></div>
      <nav>{([['hourly', '1時間ごと'], ['today', '今日・明日'], ['days', '今日〜3日後']] as const).map(([key, label]) => <button className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>)}</nav>
      <div className="cards">{places.map(place => <article key={place.name}><div className="cardhead"><div><small>{place.name}</small><h3>{place.summary}</h3></div><b>☀</b></div>
        {tab === "hourly" && <div className="hourly">{place.hourly.map(value => <div key={value[0]}><small>{value[0]}</small><b>{value[1]}</b><strong>{value[2]}</strong>{Number.parseFloat(value[3]) > 0 && <span>☔ {value[3]}</span>}</div>)}</div>}
        {tab === "today" && <div className="today">{(place.todayTomorrow ?? []).map(day => <div className="today-day" key={day.key}><small>{day.key === "today" ? "今日" : "明日"} {day.emoji}</small><div>最高 <b>{day.high}℃</b><br />最低 <i>{day.low}℃</i></div><div><small>降水確率</small><p>午前 <strong>{day.morning}%</strong></p><p>午後 <strong>{day.afternoon}%</strong></p></div></div>)}</div>}
        {tab === "days" && <div className="days">{(place.days ?? []).map(value => <div key={value[0]}><small>{value[0]}</small><b>{value[1]}</b><strong>{value[2]} <i>{value[3]}</i></strong><span>☔ {value[4]}</span></div>)}</div>}
      </article>)}</div>
    </section>

    <section className="temperature wrap"><div className="temperature-head"><div><p>PC TEMPERATURE MONITOR</p><h2>このPCの温度監視</h2><span>{temperatureStatus}・PC側は1分ごとに常時送信します。</span></div><span className="live"><i /> LIVE</span></div>
      <div className="temperature-cards two-columns"><div className={`temperature-card ${temperature ? temperatureState(temperature.cpuTemperature) : ""}`}><small>CPU 温度</small><strong>{temperature ? `${temperature.cpuTemperature}℃` : "--℃"}</strong><span>{temperature?.cpuName || "CPU名を取得中"}</span></div><div className={`temperature-card ${temperature ? temperatureState(temperature.gpuTemperature) : ""}`}><small>GPU 温度</small><strong>{temperature ? `${temperature.gpuTemperature}℃` : "--℃"}</strong><span>{temperature?.gpuName || "GPU名を取得中"}</span></div></div>
      <small className="temperature-note">温度情報が表示されない場合は、Libre Hardware Monitorが起動しているか、Remote Web Serverと送信ツールの設定を見直してください。表示は補助監視のため、BIOS/UEFIの過熱時シャットダウン設定も有効にしてください。</small>
    </section>

    <section className="transit wrap"><div className="transithead"><div><p>TRAIN STATUS</p><h2>首都圏の運行情報</h2><span>東京メトロ全線と対象JR路線のうち、遅延・事故・運転見合わせ・直通運転中止のみを表示します。</span></div>{(transit.status !== "ready" || transit.incidents.length > 0) && <aside><b>!</b><strong>{transit.status === "ready" ? transit.incidents.length : "…"}</strong><small>{transit.status === "ready" ? "対象の障害路線" : "情報を確認中"}</small></aside>}</div><div className="list">{transit.status === "ready" && transit.incidents.length === 0 ? <div className="normal-status"><i /><p><b>現在、対象の障害情報はありません</b><span>首都圏の対象路線は通常どおり運行しています。</span></p><em>正常</em></div> : transit.incidents.map(item => <div key={`${item.line}-${item.updatedAt}`}><i /><p><b>{item.line}</b><span>{item.detail}</span></p><em>運行情報</em></div>)}{transit.status !== "ready" && <div><i /><p><b>{transit.message || "運行情報を確認中です"}</b><span>更新ボタンで天気と同時に再取得できます。</span></p><em>確認中</em></div>}</div><small>運行情報取得日時: {transit.fetchedAt ? jst(transit.fetchedAt) : "確認中"}</small></section>
    <footer className="wrap">首都圏 天気・運行情報 <span>表示時刻は日本時間です</span></footer>
  </main>;
}
