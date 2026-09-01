"use client";

import { useEffect, useRef, useState } from "react";
import { adminSaveVoice, adminVoice } from "@/data/admin";
import { speakAgent } from "@/data/agent-voice";
import { DEFAULT_VOICE, type VoiceSettings } from "@/data/voices-core";
import { Button } from "@/components/ui/button";
import { AdminSaveBar } from "@/components/admin-save-bar";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminVoices() {
  const [voice, setVoice] = useState<VoiceSettings>({ ...DEFAULT_VOICE });
  const [male, setMale] = useState<{ id: string; label: string }[]>([]);
  const [female, setFemale] = useState<{ id: string; label: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState("");
  const [msg, setMsg] = useState("");
  const previewRef = useRef<HTMLAudioElement | null>(null);

  function stopPreview() {
    const el = previewRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
    setPlaying("");
  }

  useEffect(() => {
    void (async () => {
      const vo = await adminVoice({ data: { token: token() } });
      if (vo.ok) {
        setVoice({ ...DEFAULT_VOICE, ...vo.settings });
        setMale(vo.male);
        setFemale(vo.female);
        setRoles(vo.roles);
      }
    })();
    return () => stopPreview();
  }, []);

  async function listen(who: "oleg" | "olga" | "both") {
    stopPreview();
    const el = previewRef.current || new Audio();
    previewRef.current = el;
    el.muted = false;
    el.volume = 1;
    const people = who === "both" ? (["oleg", "olga"] as const) : [who];
    setPlaying(who === "both" ? "Олег и Ольга" : who === "olga" ? "Ольга" : "Олег");
    try {
      for (const person of people) {
        const sample = person === "olga" ? voice.sampleOlga || DEFAULT_VOICE.sampleOlga : voice.sampleOleg || DEFAULT_VOICE.sampleOleg;
        const res = await speakAgent({ data: { text: sample, who: person, preview: voice } });
        if (!res.ok || !("audio" in res)) {
          setMsg("Не удалось проиграть голос. Проверьте баланс Yandex SpeechKit.");
          setPlaying("");
          return;
        }
        await new Promise<void>((resolve, reject) => {
          el.onended = () => resolve();
          el.onerror = () => reject(new Error("audio"));
          el.playbackRate = 1;
          el.volume = "volume" in res ? Number(res.volume) : 1;
          el.src = res.audio;
          const play = el.play();
          if (play && typeof play.catch === "function") play.catch(() => reject(new Error("play")));
        });
        if (who === "both") await new Promise((r) => setTimeout(r, 80 + (voice.turnGap || 0) * 1000));
      }
    } catch {
      setMsg("Браузер не проиграл звук.");
    }
    setPlaying("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-2xl">Настройки голосов</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          У Олега и Ольги свои тембр, интонация, темп и громкость. Двигайте ползунки и сразу слушайте.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {(
          [
            {
              who: "oleg" as const,
              title: "Олег",
              sub: "Мужской голос, техника и инженерия",
              voiceKey: "oleg" as const,
              speedKey: "olegSpeed" as const,
              moodKey: "olegMood" as const,
              volumeKey: "olegVolume" as const,
              sampleKey: "sampleOleg" as const,
              options: male.length ? male : [{ id: "zahar", label: "Захар" }],
            },
            {
              who: "olga" as const,
              title: "Ольга",
              sub: "Женский голос, запись и творчество",
              voiceKey: "olga" as const,
              speedKey: "olgaSpeed" as const,
              moodKey: "olgaMood" as const,
              volumeKey: "olgaVolume" as const,
              sampleKey: "sampleOlga" as const,
              options: female.length ? female : [{ id: "alena", label: "Алёна" }],
            },
          ]
        ).map((card) => (
          <div key={card.who} className="rounded-[1.8rem] bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl">{card.title}</p>
                <p className="mt-1 text-sm text-muted">{card.sub}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void listen(card.who)}>
                Слушать
              </Button>
            </div>
            <label className="mt-5 block text-sm">
              Тембр
              <select
                className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                value={voice[card.voiceKey]}
                onChange={(e) => setVoice((v) => ({ ...v, [card.voiceKey]: e.target.value }))}
              >
                {card.options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm">
              Интонация
              <select
                className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                value={voice[card.moodKey]}
                onChange={(e) => setVoice((v) => ({ ...v, [card.moodKey]: e.target.value }))}
              >
                {(roles.length ? roles : [{ id: "good", label: "Радостный" }]).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm">
              Темп {Number(voice[card.speedKey]).toFixed(2)}
              <input
                type="range"
                min="0.9"
                max="1.4"
                step="0.01"
                value={voice[card.speedKey]}
                onChange={(e) => setVoice((v) => ({ ...v, [card.speedKey]: Number(e.target.value) }))}
                className="mt-3 block w-full"
              />
            </label>
            <label className="mt-4 block text-sm">
              Громкость {Math.round(Number(voice[card.volumeKey]) * 100)}%
              <input
                type="range"
                min="0.45"
                max="1"
                step="0.05"
                value={voice[card.volumeKey]}
                onChange={(e) => setVoice((v) => ({ ...v, [card.volumeKey]: Number(e.target.value) }))}
                className="mt-3 block w-full"
              />
            </label>
            <label className="mt-4 block text-sm">
              Фраза для прослушивания
              <textarea
                rows={3}
                className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
                value={voice[card.sampleKey]}
                onChange={(e) => setVoice((v) => ({ ...v, [card.sampleKey]: e.target.value }))}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="flex flex-col rounded-[1.8rem] bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="font-display text-xl">Как они говорят вместе</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            Пауза внутри фразы {Number(voice.pause).toFixed(2)}
            <input type="range" min="0" max="0.4" step="0.02" value={voice.pause} onChange={(e) => setVoice((v) => ({ ...v, pause: Number(e.target.value) }))} className="mt-3 block w-full" />
          </label>
          <label className="text-sm">
            Пауза между Олегом и Ольгой {Number(voice.turnGap).toFixed(2)} с
            <input type="range" min="0" max="0.7" step="0.02" value={voice.turnGap} onChange={(e) => setVoice((v) => ({ ...v, turnGap: Number(e.target.value) }))} className="mt-3 block w-full" />
          </label>
        </div>
        {playing ? <p className="mt-4 text-sm font-semibold text-primary">Играет: {playing}</p> : null}
        <AdminSaveBar>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setVoice({ ...DEFAULT_VOICE }); setMsg("Сброшено к заводским. Нажмите «Сохранить», чтобы применить."); }}>
            Сбросить
          </Button>
          <Button type="button" onClick={() => void listen("both")}>
            Прослушать обоих
          </Button>
          {playing ? (
            <Button type="button" variant="secondary" onClick={stopPreview}>
              Стоп
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await adminSaveVoice({ data: { token: token(), ...voice } });
              setBusy(false);
              if (!res.ok) setMsg(res.error || "Ошибка");
              else {
                setVoice({ ...DEFAULT_VOICE, ...res.settings });
                setMsg("Голоса сохранены");
              }
            }}
          >
            Сохранить
          </Button>
        </AdminSaveBar>
        {msg ? <p className="mt-2 text-right text-sm text-primary">{msg}</p> : null}
      </div>
    </div>
  );
}
