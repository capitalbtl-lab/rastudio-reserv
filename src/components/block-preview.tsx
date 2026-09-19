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

function Cell({ src, className, imgClass }: { src: string; className?: string; imgClass?: string }) {
  return (
    <div className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}>
      <Pic src={src} className={imgClass} />
    </div>
  );
}

function Mosaic({ shots, cols }: { shots: string[]; cols: number }) {
  return (
    <div className="grid h-full gap-px bg-black/10" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {shots.map((src) => (
        <Cell key={src} src={src} />
      ))}
    </div>
  );
}

function Hero({ shots }: { shots: [string, string, string] }) {
  return (
    <div className="grid h-full grid-cols-5 grid-rows-2 gap-px bg-black">
      <Cell src={shots[0]} className="col-span-3 row-span-2" />
      <Cell src={shots[1]} className="col-span-2" />
      <Cell src={shots[2]} className="col-span-2" />
    </div>
  );
}

function inner(typeId: string) {
  switch (typeId) {
    case "hero":
      return <Hero shots={[ART, SCULPT, ROBOT]} />;
    case "course-hero":
      return <Hero shots={[ROBOT, ART, CODE]} />;
    case "ticker":
      return (
        <div className="flex h-full">
          {[ART, ROBOT, CODE, SCULPT, SCIENCE].map((src) => (
            <Cell key={src} src={src} className="h-full w-[32%] shrink-0" />
          ))}
        </div>
      );
    case "robot":
    case "video-grid":
    case "video":
      return (
        <div className="relative h-full">
          <Pic src={typeId === "robot" ? ROBOT : CODE} />
          <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-7 place-items-center rounded-full bg-white/88 backdrop-blur-sm">
              <span className="ml-0.5 size-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-black/80" />
            </span>
          </span>
        </div>
      );
    case "ages":
      return <Pic src={MC} />;
    case "schools":
      return <Mosaic shots={[ART, ROBOT, CODE, SCULPT]} cols={2} />;
    case "catalog":
    case "related":
      return <Mosaic shots={COURSE} cols={4} />;
    case "about":
    case "two-col":
      return (
        <div className="grid h-full grid-cols-2 gap-px bg-black/10">
          <Cell src={TEACHER} imgClass="object-top" />
          <Cell src={ART} />
        </div>
      );
    case "custom":
      return <Pic src={SCIENCE} />;
    case "teachers":
    case "sell-program":
      return (
        <div className="grid h-full grid-cols-4 gap-px bg-black/10">
          {FACE.map((src) => (
            <Cell key={src} src={src} imgClass="object-top" />
          ))}
        </div>
      );
    case "reviews":
    case "page-reviews":
      return <Pic src={TEACHER} className="object-top" />;
    case "stories":
      return <Mosaic shots={[MC, ART, ROBOT]} cols={3} />;
    case "branches":
      return <Mosaic shots={[ART, CODE, ROBOT]} cols={3} />;
    case "trial":
    case "trial-form":
    case "convert-aside":
      return <Pic src={ART} />;
    case "buttons":
      return <Pic src={MC} />;
    case "convert-band":
      return <Mosaic shots={[ROBOT, CODE, ART]} cols={3} />;
    case "course-story":
    case "heading":
    case "rich-text":
      return <Pic src={ART} />;
    case "why":
    case "sell-why":
      return <Mosaic shots={[ART, ROBOT, CODE]} cols={3} />;
    case "program":
      return <Pic src={SCIENCE} />;
    case "gallery":
      return <Mosaic shots={[ART, SCULPT, ROBOT, CODE, SCIENCE, MC]} cols={3} />;
    case "image":
      return <Pic src={ART} />;
    case "school-courses":
      return (
        <div className="grid h-full grid-cols-3 gap-px bg-black/10">
          {[ART, ROBOT, CODE].map((src) => (
            <Cell key={src} src={src} />
          ))}
        </div>
      );
    case "trajectory":
      return <Mosaic shots={[ART, ROBOT, CODE]} cols={3} />;
    case "schedule":
      return <Pic src={CODE} />;
    default:
      return <Pic src={ART} />;
  }
}

export function BlockPreview({ typeId }: { typeId: string }) {
  return (
    <div className="relative h-32 w-full overflow-hidden bg-black/[0.04]" aria-hidden>
      <div className="pointer-events-none h-full w-full select-none">{inner(typeId)}</div>
    </div>
  );
}
