"use client";

import { cn } from "@/lib/utils";

const ART = "/media/home/shot-art.jpg";
const SCULPT = "/media/home/shot-sculpt.jpg";
const ROBOT = "/media/home/shot-robot.jpg";
const CODE = "/media/home/shot-code.jpg";
const SCIENCE = "/media/home/shot-science.jpg";
const MC = "/media/home/shot-mc.jpg";
const TEACHER = "/media/home/shot-teacher.jpg";
const FACE = ["/media/courses/team/01.jpg", "/media/courses/team/02.jpg", "/media/courses/team/03.jpg", "/media/courses/team/04.jpg"];
const COURSE = ["/courses/akadem-art.jpg", "/courses/robot-10-14.jpg", "/courses/python.jpg", "/courses/blender.jpg"];

function Pic({ src, className }: { src: string; className?: string }) {
  return <img src={src} alt="" loading="lazy" decoding="async" className={cn("h-full w-full object-cover", className)} />;
}

function Line({ w, tone = "white" }: { w: string; tone?: "white" | "ink" | "muted" | "blue" }) {
  const fill =
    tone === "ink" ? "bg-black/80" : tone === "muted" ? "bg-black/25" : tone === "blue" ? "bg-primary" : "bg-white/80";
  return <span className={cn("block h-[3px] rounded-full", fill)} style={{ width: w }} />;
}

function Play() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="grid size-8 place-items-center rounded-full bg-white/92 shadow-[0_8px_20px_-8px_rgba(0,0,0,.55)]">
        <span className="ml-0.5 size-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-[#205edc]" />
      </span>
    </span>
  );
}

function HeroMini({ shots }: { shots: [string, string, string] }) {
  return (
    <div className="flex h-full bg-[#11141c]">
      <div
        className="flex w-[44%] flex-col justify-center gap-1.5 px-2.5"
        style={{ background: "radial-gradient(90% 80% at 0% -20%, rgba(32,94,220,.32), transparent 58%)" }}
      >
        <Line w="38%" />
        <Line w="92%" />
        <Line w="74%" />
        <span className="mt-1 h-2.5 w-11 rounded-full bg-primary" />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-2 gap-[3px] p-[3px]">
        <div className="relative row-span-2 overflow-hidden rounded-[6px]">
          <Pic src={shots[0]} />
        </div>
        <div className="relative overflow-hidden rounded-[6px]">
          <Pic src={shots[1]} />
        </div>
        <div className="relative overflow-hidden rounded-[6px]">
          <Pic src={shots[2]} />
        </div>
      </div>
    </div>
  );
}

function SplitMini({ photo, dark }: { photo: string; dark?: boolean }) {
  return (
    <div className={cn("grid h-full grid-cols-2", dark ? "bg-[#11141c]" : "bg-[#eef1f6]")}>
      <div className="flex flex-col justify-center gap-1.5 px-2.5">
        <Line w="40%" tone={dark ? "white" : "muted"} />
        <Line w="88%" tone={dark ? "white" : "ink"} />
        <Line w="70%" tone={dark ? "white" : "muted"} />
        <span className={cn("mt-1 h-2.5 w-10 rounded-full", dark ? "bg-white/90" : "bg-primary")} />
      </div>
      <div className="relative m-1 overflow-hidden rounded-[8px]">
        <Pic src={photo} />
      </div>
    </div>
  );
}

function GridMini({ shots, cols = 4 }: { shots: string[]; cols?: number }) {
  return (
    <div className="grid h-full gap-[3px] bg-white p-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {shots.map((src) => (
        <div key={src} className="relative overflow-hidden rounded-[6px]">
          <Pic src={src} />
          <span className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
      ))}
    </div>
  );
}

function VideoMini({ src }: { src: string }) {
  return (
    <div className="relative h-full">
      <Pic src={src} />
      <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
      <Play />
    </div>
  );
}

function FacesMini({ shots }: { shots: string[] }) {
  return (
    <div className="flex h-full gap-[3px] bg-[#eef1f6] p-[3px]">
      {shots.map((src) => (
        <div key={src} className="relative min-w-0 flex-1 overflow-hidden rounded-[8px]">
          <Pic src={src} className="object-top" />
        </div>
      ))}
    </div>
  );
}

function inner(typeId: string) {
  switch (typeId) {
    case "hero":
      return <HeroMini shots={[ART, SCULPT, ROBOT]} />;
    case "course-hero":
      return <HeroMini shots={[ROBOT, ART, CODE]} />;
    case "ticker":
      return (
        <div className="flex h-full items-center gap-2 overflow-hidden bg-[#11141c] px-2">
          {[ART, ROBOT, CODE, SCULPT, SCIENCE].map((src) => (
            <span key={src} className="flex shrink-0 items-center gap-1.5">
              <span className="size-1 rounded-full bg-primary" />
              <span className="size-7 overflow-hidden rounded-full ring-1 ring-white/15">
                <Pic src={src} />
              </span>
            </span>
          ))}
        </div>
      );
    case "robot":
      return <VideoMini src={ROBOT} />;
    case "video-grid":
    case "video":
      return <VideoMini src={CODE} />;
    case "ages":
      return (
        <div className="relative h-full">
          <Pic src={MC} />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <span className="absolute inset-x-2 bottom-2 flex gap-1">
            {["5–6", "7–9", "10–14"].map((a) => (
              <span key={a} className="rounded-full bg-white/95 px-2 py-0.5 text-[0.52rem] font-semibold text-black/80">
                {a}
              </span>
            ))}
          </span>
        </div>
      );
    case "schools":
      return <GridMini shots={[ART, ROBOT, CODE, SCULPT]} cols={2} />;
    case "catalog":
    case "related":
      return <GridMini shots={COURSE} />;
    case "about":
    case "two-col":
      return <SplitMini photo={TEACHER} />;
    case "custom":
      return <SplitMini photo={SCIENCE} dark />;
    case "teachers":
    case "sell-program":
      return <FacesMini shots={FACE} />;
    case "reviews":
    case "page-reviews":
      return (
        <div className="relative h-full">
          <Pic src={TEACHER} />
          <span className="absolute inset-0 bg-black/45" />
          <span className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 flex-col gap-1">
            <Line w="22%" />
            <Line w="100%" />
            <Line w="78%" />
          </span>
        </div>
      );
    case "stories":
      return <GridMini shots={[MC, ART, ROBOT]} cols={3} />;
    case "branches":
      return (
        <div className="grid h-full grid-cols-3 gap-[3px] bg-[#11141c] p-[3px]">
          {[ART, CODE, ROBOT].map((src) => (
            <div key={src} className="relative overflow-hidden rounded-[8px]">
              <Pic src={src} />
              <span className="absolute inset-0 bg-gradient-to-t from-[#11141c] via-black/20 to-transparent" />
            </div>
          ))}
        </div>
      );
    case "trial":
    case "trial-form":
    case "convert-aside":
      return (
        <div className="relative h-full">
          <Pic src={ART} />
          <span className="absolute inset-0 bg-black/40" />
          <span className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5">
            <Line w="54%" />
            <span className="h-3 w-16 rounded-full bg-primary" />
          </span>
        </div>
      );
    case "buttons":
      return (
        <div className="relative h-full">
          <Pic src={MC} />
          <span className="absolute inset-0 bg-black/35" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="h-4 w-20 rounded-full bg-primary shadow-[0_8px_18px_-8px_rgba(32,94,220,.9)]" />
          </span>
        </div>
      );
    case "convert-band":
      return (
        <div className="grid h-full grid-cols-3 gap-[3px] bg-white p-[3px]">
          {[ROBOT, CODE, ART].map((src) => (
            <div key={src} className="relative overflow-hidden rounded-[8px] bg-[#eef1f6]">
              <Pic src={src} className="h-[62%] object-cover" />
              <span className="absolute inset-x-1.5 bottom-1.5 h-2 rounded-full bg-primary/90" />
            </div>
          ))}
        </div>
      );
    case "course-story":
    case "heading":
    case "rich-text":
      return (
        <div className="relative h-full bg-[#f4f6fa]">
          <Pic src={ART} className="opacity-25" />
          <span className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
            <Line w="36%" tone="muted" />
            <Line w="88%" tone="ink" />
            <Line w="70%" tone="muted" />
          </span>
        </div>
      );
    case "why":
    case "sell-why":
      return (
        <div className="grid h-full grid-cols-3 gap-[3px] bg-white p-[3px]">
          {[ART, ROBOT, CODE].map((src, i) => (
            <div key={src} className="relative overflow-hidden rounded-[8px]">
              <Pic src={src} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute left-1.5 top-1 text-[0.7rem] font-semibold text-white/90">0{i + 1}</span>
            </div>
          ))}
        </div>
      );
    case "program":
      return (
        <div className="relative h-full">
          <Pic src={SCIENCE} />
          <span className="absolute inset-0 bg-black/40" />
          <span className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-4 overflow-hidden rounded-md bg-white/90">
                <span className="block h-full w-1 bg-primary" />
              </span>
            ))}
          </span>
        </div>
      );
    case "gallery":
      return <GridMini shots={[ART, SCULPT, ROBOT, CODE, SCIENCE, MC]} cols={3} />;
    case "image":
      return <Pic src={ART} />;
    case "school-courses":
      return (
        <div className="flex h-full flex-col gap-[3px] bg-white p-[3px]">
          {[ART, ROBOT, CODE].map((src) => (
            <div key={src} className="flex min-h-0 flex-1 overflow-hidden rounded-[8px] bg-[#eef1f6]">
              <span className="relative h-full w-[38%] shrink-0">
                <Pic src={src} />
              </span>
              <span className="flex flex-1 flex-col justify-center gap-1 px-2">
                <Line w="70%" tone="ink" />
                <Line w="44%" tone="muted" />
              </span>
            </div>
          ))}
        </div>
      );
    case "trajectory":
      return (
        <div className="relative h-full">
          <Pic src={ROBOT} />
          <span className="absolute inset-0 bg-black/40" />
          <span className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {[ART, CODE, SCIENCE].map((src, i) => (
              <span key={src} className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-md ring-1 ring-white/25">
                <Pic src={src} />
                {i < 2 ? <span className="absolute -right-1.5 top-1/2 z-10 size-2 -translate-y-1/2 rounded-full bg-primary" /> : null}
              </span>
            ))}
          </span>
        </div>
      );
    case "schedule":
      return (
        <div className="relative h-full">
          <Pic src={CODE} />
          <span className="absolute inset-0 bg-black/45" />
          <span className="absolute inset-2 grid grid-cols-3 grid-rows-3 gap-[3px]">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={cn("rounded-[4px]", i === 4 ? "bg-primary" : "bg-white/80")} />
            ))}
          </span>
        </div>
      );
    default:
      return <SplitMini photo={ART} />;
  }
}

export function BlockPreview({ typeId }: { typeId: string }) {
  return (
    <div
      className="relative mt-1 overflow-hidden rounded-xl bg-[#11141c] shadow-[0_10px_24px_-16px_rgba(15,23,42,.55)] ring-1 ring-black/10"
      aria-hidden
    >
      <div className="pointer-events-none h-[6.75rem] w-full select-none">{inner(typeId)}</div>
    </div>
  );
}
