"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { CRM_STAGE_COLORS, LEAD_STAGES, mergeStages, pinUnsorted, type LeadStage } from "@/data/crm-leads-stages";
import { FUNNEL_AUTO_DEFAULT, type FunnelAuto } from "@/data/funnel-auto-core";
import { CRM_BRANCH } from "@/data/ids";
import { cn } from "@/lib/utils";
import { CRM_ACTORS, actorLabel, actorOf, type CrmActorsState } from "@/data/crm-actors";
import { CACHE_KIND_META, type CacheKind, type CachePolicy } from "@/data/crm-cache-policy-core";
import { exportOpLabel, type CrmExportOp } from "@/data/crm-export-queue-core";
import { ALFA_LINK_MODES, ALFA_PULL_CH, ALFA_PUSH_CH, ALFA_PIPE_CH, ALFA_SYNC_DEFAULT, type AlfaLinkMode, type AlfaPullCh, type AlfaPushCh, type AlfaPipeCh } from "@/data/crm-alfa-link-core";
import { journalChunks, clampGrain, type Grain } from "@/data/crm-journal-periods";
import { keepAlfa, peopleLessonsLine, peopleStudentAction, peopleStudentBadge, peopleStudentHint, PEOPLE_PACK } from "@/data/crm-people-line";
import { STEP_LOAD, type HistLoadTab } from "@/data/crm-history-load-guide";
import { RECHECK_DAY_OPTS, clampRecheckDays, groupJournalGreen, type RecheckDays } from "@/data/crm-inbound-core";
import { POLICY_FACTORY, planDateFrom, planFromIdOf, planFromIdToRecheckDays, type CrmSyncPolicy } from "@/data/crm-sync-policy-core";
import { HistoryPlanModal } from "@/components/admin-history-plan";

function scrollRoot(from: HTMLElement | null): HTMLElement | Window {
  let n = from?.parentElement || null;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return window;
}

function lockTabY(el: HTMLElement | null, prevTop: number) {
  if (!el) return;
  const dy = el.getBoundingClientRect().top - prevTop;
  if (Math.abs(dy) < 1) return;
  const root = scrollRoot(el);
  if (root === window) window.scrollBy(0, dy);
  else (root as HTMLElement).scrollTop += dy;
}

export const CRM_SYNC_MIN_KEY = "ra_crm_sync_min";

export function crmSyncMinutes() {
  if (typeof window === "undefined") return 10;
  const n = Number(localStorage.getItem(CRM_SYNC_MIN_KEY) || 10);
  return Number.isFinite(n) ? Math.max(2, Math.min(60, n)) : 10;
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const BTN_LOAD =
  "inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-border)] hover:bg-primary-hover disabled:opacity-50";
const BTN_LOAD_SM =
  "inline-flex h-8 items-center justify-center truncate rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50";
const BTN_GHOST =
  "inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-black/10 hover:bg-primary/5 hover:ring-primary/25";
const BTN_GHOST_SM =
  "inline-flex h-8 items-center justify-center shrink-0 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10 hover:bg-primary/5 disabled:opacity-40";
const BTN_RED =
  "inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-semibold text-white shadow-[var(--shadow-border)] hover:bg-red-700 disabled:opacity-50";

function HintI({ text }: { text: string }) {
  return (
    <span className="group/hi relative inline-flex shrink-0 self-center p-0.5">
      <span
        tabIndex={0}
        className="flex h-[11px] w-[11px] cursor-help items-center justify-center rounded-full bg-black/40 text-[8px] font-bold leading-none text-white"
        aria-label="Подсказка"
      >
        i
      </span>
      <span className="invisible absolute left-0 top-[calc(100%+6px)] z-[90] max-h-[min(22rem,70vh)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-zinc-900 px-3.5 py-3 text-left text-[0.78rem] font-normal leading-[1.45] text-white opacity-0 shadow-xl group-hover/hi:visible group-hover/hi:opacity-100 group-focus-within/hi:visible group-focus-within/hi:opacity-100">
        {text}
      </span>
    </span>
  );
}

function withHint(node: ReactNode, text: string) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {node}
      <HintI text={text} />
    </span>
  );
}

function BtnCluster({
  tone,
  children,
}: {
  tone: "red" | "sky";
  children: ReactNode;
}) {
  const cls = tone === "red" ? "bg-red-50 ring-red-200" : "bg-sky-50 ring-sky-300";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 overflow-visible rounded-[1.35rem] p-1.5 ring-1", cls)}>
      {children}
    </span>
  );
}

function LoadGuideModal({ tab, onClose }: { tab: HistLoadTab; onClose: () => void }) {
  const g = STEP_LOAD[tab];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const Block = ({ title, items }: { title: string; items: string[] }) =>
    items.length ? (
      <section className="mt-4">
        <h4 className="text-[0.78rem] font-bold uppercase tracking-wide text-zinc-500">{title}</h4>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[0.86rem] leading-snug">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-guide-title"
        className="max-h-[min(90vh,52rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="load-guide-title" className="font-display text-[1.2rem] leading-tight">
              {g.title}
            </p>
            <p className="mt-1 text-[0.86rem] leading-snug text-muted">{g.goal}</p>
          </div>
          <button type="button" className={BTN_GHOST_SM} onClick={onClose} aria-label="Закрыть">
            Закрыть
          </button>
        </div>
        <section className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <h4 className="text-[0.72rem] font-bold uppercase tracking-wide text-amber-900">Простыми словами</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[0.92rem] leading-snug">
            {g.plain.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {tab === "groups" ? <li>Красная ходит порцией «Квартал / Полугодие / Год». Синяя ходит ± месяц / ± три / ± шесть от сегодня.</li> : null}
            {tab === "money" ? <li>Грузим платежи по id. Не уроки. Не остаток — это шаг 5.</li> : null}
          </ul>
        </section>
        {g.alfa.map((a) => (
          <section key={a.api} className="mt-4 rounded-xl bg-zinc-50 p-3 ring-1 ring-black/8">
            <h4 className="text-[0.72rem] font-bold uppercase tracking-wide text-zinc-500">Из Alfa</h4>
            <p className="mt-1 font-mono text-[0.72rem] leading-snug text-zinc-800">{a.api}</p>
            <p className="mt-1 text-[0.86rem] leading-snug">{a.apiHint}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[0.86rem] leading-snug">
              {a.fields.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        ))}
        {g.disk.map((d) => (
          <section key={d.file} className="mt-3 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200">
            <h4 className="text-[0.72rem] font-bold uppercase tracking-wide text-emerald-800">На диск</h4>
            <p className="mt-1 font-mono text-[0.72rem] leading-snug">{d.file}</p>
            <p className="mt-1 text-[0.86rem] leading-snug">{d.fileHint}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[0.86rem] leading-snug">
              {d.fields.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        ))}
        <Block title="Кто читает" items={g.readers} />
        <Block title="Не качаем этим шагом" items={g.skip} />
        <Block title="Закон" items={g.law} />
      </div>
    </div>
  );
}

function LoadGuideBtn({ tab, onOpen }: { tab: HistLoadTab; onOpen: (t: HistLoadTab) => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full bg-black/40 text-[8px] font-bold leading-none text-white hover:bg-black/60"
      aria-label={`Что загружает ${STEP_LOAD[tab].title}`}
      title="Что загружаем и куда"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(tab);
      }}
    >
      i
    </button>
  );
}

const HINT = {
  disk: "Это не загрузка из Alfa. Кнопка только показывает, что уже лежит у нас на сервере: люди и группы. Alfa при этом не вызывается и ничего там не меняется. Если список пустой — подождите пару секунд и нажмите ещё раз: ответ иногда приходит не с первого раза. Пока списка нет, красную «Загрузить по одному» лучше не жать: программе некого ставить в очередь. Когда список на экране, повторно жать не нужно. Все шаги и пульт читают этот же диск.",
  plan: "Пульт — не вторая очередь. Тумблер включает слоты. Кнопка — перепроверка: сначала дырки слева, потом все справа. «1 год» и «2 года» — год и два, не месяц. Чип лидов режет только этот прогон. Ночная карточка берёт те же годы. «Стоп» на ленте шага. В Alfa не пишет.",
  roster: "Красная кнопка спрашивает у Alfa состав одной группы (кто записан сейчас) и записывает людей к нам на диск. Одна группа, потом пауза ровно 5 секунд, быстрее нельзя. Если карточки человека ещё не было — создаёт. Кто выбыл из группы, помечается «не в этой группе», саму карточку не удаляем. Журнал занятий, касса и домашка этим шагом не качаются. В Alfa ничего не создаёт и не меняет. После состава цифра «Сейчас ходят» считается по этим людям. Это основа шагов 2–5.",
  rosterRecheck: "Синяя ещё раз спрашивает состав этой группы в Alfa: допишет новых, снимет выбывших. Нужна, если в Alfa состав уже изменился, а у нас старый. Между группами пауза 5 секунд. Журнал и кассу не трогает. В Alfa ничего не пишет.",
  rosterWho: "Кто считается «своим» после состава. В живых группах на шаг 2 едут и ученики, и лиды — календарь один: кто есть в составе, у того качаем журнал. Галка «лиды»: если снять, шаг 1 их не подчёркивает, но шаг 2 всё равно качает журнал. «Архив в живой группе» оставляет тех, кто ходит, хотя карточка уже архивная. «Был на занятии» сужает набор, только если журнал уже на диске. Касса сверки лидов не сравнивает, пока человек не стал клиентом. «Запомнить» пишет это на диск. Пульт эту галку не затирает.",
  ungrouped: "Люди из Alfa без живой группы: не «сейчас ходят» и не рабочий архив. Красная качает только их личный календарь, по одному, пауза 5 секунд. Состав группы не спрашивает — группы нет. Номер группы сама не выдумывает. В Alfa не пишет.",
  loadOnePeople: "Красная очередь по людям слева. Один человек, пауза 5 секунд, следующий. Смотрит набор номеров уроков в Alfa, не «сколько строчек». Нет чужих номеров — карточка уходит вправо. Есть номера, которых нет у нас — дописывает, карточка жёлтая. Сколько лет назад смотреть — список в этой же красной рамке (синяя рамка сюда не лезет). «Стоп» после текущего человека. Вкладку можно закрыть. В Alfa ничего не пишет. Архивных клиентов красная берёт только из рабочего набора шага 2 (год или два), не всех бывших с 2015.",
  years: "Только красные кнопки этого шага: «Загрузить по одному», на карточке «Загрузить календарь» и «Добрать». Стоит в красной рамке. Синяя рамка этот список не читает. «Вся история» всегда с 2015, этот список ей тоже не указ. Пауза между детьми всегда 5 секунд. По умолчанию «с начала · 2015» — весь журнал. Короче окно — если человек ходит недавно, меньше работы. У архивных клиентов здесь только «1 год» или «2 года». В Alfa ничего не отправляет.",
  probe: "Спрашивает у Alfa, сколько уникальных номеров занятий у этого человека по филиалам, с 2015. Сами строки уроков не качает. Списки в красной и синей рамках не читает. Если Alfa не ответила — старый счёт не обнуляем. Набор номеров разный — жёлтая. Сошлись — вправо. В Alfa не пишет.",
  recheckCal: "Синяя кнопка этой карточки. Окно дат — список в синей рамке сверху, не красная. Сравнивает номера уроков только в этом окне. Новые дописывает, пропавшие в окне снимает. Что старше окна — не трогает. Свои ещё не отправленные уроки не снимает. В Alfa не пишет.",
  recheckOnePeople: "Синяя очередь, пять волн. Сначала жёлтые слева целиком (чип дат не режет), потом зелёные справа окном с чипа, снова дырки слева, кто позеленел — ещё раз тем же окном, оставшиеся дырки слева. Пустую волну пропускаем. После пятой — стоп, даже если слева ещё жёлтые. Пауза между заходами: ± неделя и ± две — 2 с, месяц — 2,5 с, три месяца — 3, полгода — 4, три года / семь лет / с 2015 — 5 с. Саму перепись паузой не ускоряем. «Стоп» после текущего. В Alfa не пишет.",
  recheckWindow: "Только синие кнопки в этой рамке, и только волны справа. «± неделя / две / месяц / три / шесть» — обе стороны от сегодня. «За 3 года», «за 7 лет», «с начала · 2015» — назад и месяц вперёд. Короткое окно старше себя не ищет и с диска не стирает. Слева полная перепись лишнее снимает везде. Перепись не дошла — лишнее не снимаем. Пауза: неделя и две — 2 с, месяц — 2,5 с, три — 3, шесть — 4, длинные — 5 с. Красная рамка это окно не читает. В Alfa не пишет.",
  slowFill: "Берёт всех слева: и розовых (счёт ещё не спрашивали), и жёлтых. Списки лет и месяцев сверху не читает. Сам идёт месяц за месяцем назад до 2015. На одного человека может уйти до 10 минут, курсор не сбрасывает — если оборвалось, продолжит с того же места. Потом пауза 5 секунд и следующий. Кто добрался — вправо. Правых (зелёных) не берёт. Вкладку можно закрыть. В Alfa не пишет.",
  stop: "Останавливает текущую очередь — и кнопки шага, и пульт, очередь одна. Человек или группа, который уже ушёл в Alfa, свой запрос допишет. Следующий не стартует. Уже записанное на диск не откатывается: это пауза, не «отмена». После стопа красную можно нажать снова — пойдёт со следующих, кто ещё слева. Если кнопка серая, сейчас никто не грузится. В Alfa ничего не удаляет. Можно отойти и продолжить позже.",
  fullHist: "Только для жёлтой карточки. Та же красная загрузка, что «Добрать», но всегда с 1 января 2015 — список лет в красной рамке не читает. После шага смотрим набор номеров уроков. Это не синяя перепроверка. В Alfa не пишет.",
  resetHist: "Только для жёлтой. Стирает занятия этого ученика у нас на диске и ставит счёт Alfa в ноль. Сама загрузку не начинает — дальше жмите «Добрать». Старое число на карточке не держим. Свои ещё не отправленные уроки не трогает. Группу и кассу не трогает. В Alfa ничего не пишет.",
  resetPay: "Стирает платежи этого ученика у нас на диске и пометку «касса загружена». Сама загрузку не начинает — дальше «Загрузить кассу». Свои ещё не отправленные платежи не трогает. Календарь занятий не трогает. В Alfa ничего не пишет.",
  loadCal: "Красная загрузка календаря этой карточки. Сколько лет назад — список в красной рамке, не синяя. Сверяет набор номеров уроков, дописывает дырки. Если карточка давно жёлтая — надёжнее «Загрузить всю историю» (всегда с 2015). В Alfa не пишет.",
  hole: "Галка на жёлтой карточке: в Alfa есть номера уроков, которых нет у нас. Сама ничего не качает и журнал не закрывает. С этой галкой человека пускают к шагам 3–5, даже если календарь дырявый. Снять можно только руками. У кого набор номеров сошёлся, галки нет.",
  loadOneGroups: "Красная очередь порций: группа + кусок зерна. Одна порция, пауза 5 с, потом следующая. Спрашивает номера этого куска, добирает недостающие, лишнее не снимает. Лишнее порцию не повторяет — карточка жёлтая. Пустые куски — только вне срока группы, не «что уже на диске». Список кончился — стоп. Зелёный — весь журнал: перепись дошла, дырок нет, лишнего нет. Тема и ДЗ кнопку перепроверки не подменяют. Чип синей не читает. В Alfa не пишет.",
  grain: "Только красная рамка шага 3. Квартал / полугодие / год — размер порции, не «с 2015». Год — у молодых. Пустые куски вне уроков в очередь не ставим. Синяя зерно не читает. В Alfa ничего не отправляет.",
  archPupils: "Смотрит карточки людей выбранной колонки: «сейчас ходят» или рабочий архив — в одном прогоне не смешивает. Собирает номера групп, где они когда-то числились. Живые группы из списка выкидывает. Остальные появятся как архивные — чтобы старый остаток на карточке сошёлся. Идёт по одной группе, пауза 5 секунд. Журнал явок сама не качает — только список групп. Дальше красная «по одному» на виде «Архивные группы». В Alfa ничего не создаёт.",
  archAll: "Тянет из Alfa архивные группы филиала, не только те, что есть у ваших учеников. Поэтому программа спрашивает подтверждение. Живое расписание не трогает. Журнал явок не качает — появится только список групп. Один филиал, пауза 5 секунд. Если нужен архив только ваших людей — кнопка «Архив групп учеников» уже и спокойнее. В Alfa ничего не пишет.",
  life: "Спрашивает Alfa, с какого по какое число у группы реально был журнал. Чтобы не грузить курс за десять лет, если он шёл полгода. Срок пишется на карточку группы у нас. Шаблон группы в Alfa не меняет. Одна группа, пауза 5 секунд. Если срок не нашли — группа «без срока», тогда видимые кварталы грузите руками. После сроков красная берёт только подходящие порции. Это подготовка, не загрузка явок.",
  school: "Фильтр списка на экране: одна школа или все сразу. Счётчик «загрузка завершена» считается только по видимым. Красная «по одному» идёт по этому же списку, скрытые школы не трогает. Сама кнопка ничего не качает. Если школу не выбрать — очередь по всем, это дольше. Уже скачанные явки фильтр не стирает.",
  loadAttend: "Читает явки этой порции группы из Alfa: кто был, кто пропуск, кто опоздал. Другие кварталы не затирает. Если оборвалось — карточка квартала жёлтая, нажмите ещё раз, допишет. В Alfa журнал не проводит и оценки не ставит. Тема и домашка — отдельная кнопка, только после зелёных явок. Без явок детали грузить нельзя: не к чему привязать.",
  loadDetails: "После зелёных явок добирает тему урока, домашнее задание, комментарий педагога и таблицу учеников. Это не явки и не касса. Alfa только читается. Если темы в Alfa нет, помечаем «смотрели», чтобы не крутить вечно. Другие кварталы не трогает. Пока явки не зелёные — будет «Сначала явки».",
  loadOneMoney: "Красная очередь шага 4: касса, по одному человеку. Берём платежи по номеру платежа, не «сколько строчек». Журнал занятий не качаем. Товары из кассы (тип 2 и 9) не грузим — они ломают шапку уроков. Сколько лет назад — список в этой красной рамке. В живых группах те же люди, что шаги 1–2, включая лидов из состава. «Касса загружена» значит: страницы дочитали, даже если платежей ноль. Сошлась ли сумма с шапкой Alfa — это шаг 5. В Alfa оплату не создаёт. Пауза 5 секунд. «Стоп» после текущего.",
  yearsMoney: "Только красные кнопки шага 4. «С начала · 2015» — платежи с 1 января 2015. «7 / 3 / 1 год» — с этой даты по сегодня. У архивных клиентов здесь только год или два, как на шаге 2. Синяя рамка этот список не читает: у неё своё окно. В Alfa ничего не отправляет.",
  loadPay: "Красная касса этой карточки. Платежи и абонементы из Alfa на диск, по номеру платежа. Товары не берём. Журнал занятий не качает. Годы в рамке режут, с какой даты читать. Один и тот же платёж дважды не пишем. Когда страницы кончились — карточка вправо. В Alfa платёж не проводит.",
  recheckPay: "Синяя касса этой карточки. Ещё раз читает все страницы и все нужные виды платежей по номеру. Курсор не сбрасывает. Товары по-прежнему не берём. Журнал не качает. Окно дат кассу не режет. Сумма против шапки — шаг 5. В Alfa не пишет.",
  recheckOneGroups: "Синяя очередь групп, пять волн. 1/3/5 — жёлтые целиком, чип не режет, лишнее снимает везде. 2 — все, кто сейчас зелёный, окном с чипа. 4 — только кто стал зелёным в волне 3, тем же окном. Кто прошёл 2 и остался зелёным — в 3–5 не входит. Пустую пропускаем, 6-й нет. Пауза по чипу и слева: неделя/две — 2 с, месяц — 2,5 с, 3 мес — 3 с, 6 мес — 4 с, 3 года / 7 лет / 2015 — 5 с. 8 отказов — эту группу этой кнопкой не берём. «Стоп» после текущей. В Alfa не пишет.",
  recheckOneMoney: "Синяя очередь кассы. Сначала справа, потом недочитанные слева, кто дочитался — снова справа. Сумма — шаг 5. Журнал не качает. Пауза от 1 до 5 секунд. «Стоп» после текущего. В Alfa не пишет.",
  tabRoster: "Шаг 1. Сначала узнаём, кто числится в группе. Без этого шага программа не знает, кого ставить в календарь и кассу. Красная читает состав одной группы из Alfa и пишет людей к нам. Выбывших не удаляет — только «уже не в этой группе». Журнал, деньги и домашку не качает. Живые и архивные группы — две таблетки на этом же шаге. Школа сверху сужает очередь. Пульт «1–5» тоже начинает отсюда. В Alfa ничего не меняет.",
  tabStudents: "Шаг 2. Личный календарь одного ребёнка: все его уроки из всех групп, одним списком. Смотрим набор номеров уроков, не «244 против 254». Красная рамка — загрузить и сколько лет. Синяя — перепроверить кусок дат. Жёлтая — в Alfa есть номера, которых нет у нас. «Сейчас ходят» — люди из живых групп шага 1, ученики и лиды. «Архивные клиенты» — только те, кто когда-то был клиентом; архивных лидов сюда не берём. Год или два, не с 2015 всем скопом. В Alfa не пишем.",
  tabGroups: "Шаг 3. Журнал одной группы: все уроки этой группы, кто был. Не дневник ребёнка. Цвет — вся группа сейчас: только жёлтый и зелёный. Зелёный: перепись всего журнала дошла, дырок нет нигде, лишнего нет. Не «порция чистая» и не «3/8». Чип цвет не сужает. Карточка — группа. Красная очередь — порции. Синяя — группы. Тема и ДЗ цвет не меняют. Живые и архивные группы — две таблетки, не архив людей. В Alfa журнал не проводим.",
  tabMoney: "Шаг 4. Касса: платежи по номеру, не уроки и не «остаток на карточке». Товары (тип 2 и 9) не грузим — ломают шапку. Те же люди, что шаги 1–2. «Касса загружена» — страницы дочитали. Сошлась ли сумма — шаг 5. Архивных берём тем же набором, что шаг 2. В Alfa оплату не создаём.",
  tabAudit: "Шаг 5. Сверка остатка. Вправо только если три цифры рядом: «Клиенты» на сайте, шапка Alfa и наша касса — с точностью около рубля. Лид с пустой лентой: нули, шапка balance, 0=0 — вправо. Рабочий архив — отдельная таблетка, после календаря и кассы. Слева — сегмент и что поправить. Цифру из Alfa в файл не записываем. В Alfa не пишем.",
  auditAll: "Красная проходит текущих клиентов по одному. Лидов пропускает. Между людьми пауза 5 секунд. Сравнивает число в «Клиентах» с шапкой Alfa (общий остаток, не остаток одного абонемента). Если не сошлось — догружает журнал или кассу только этого номера. Цифру Alfa в кассу не записывает. «Стоп» после текущего. Архивных — соседняя таблетка, тем же набором шага 2.",
  auditRecheck: "Ещё раз сверяет только этого человека с шапкой Alfa. Чужих не трогает. Нужна, если он слева с причиной или вы только что правили его кассу. После совпадения уйдёт вправо, даже если есть непроведённые уроки с ценой. Если снова «показ» — это как рисует страница «Клиенты», не его личная дыра. В Alfa ничего не сохраняет.",
  scopeLive: "Люди в живых группах после состава шага 1. Не «все клиенты Alfa». Красная очередь и сверка идут только по этому списку. Архивных эта таблетка не трогает. Цифра на кнопке — сколько таких людей. Переключение само ничего не качает. Для календаря, кассы и сверки это один и тот же переключатель.",
  scopeArch: "Рабочий архив: бывшие клиенты (когда-то ходили как клиент), не архивные лиды. Набор один на шаги 2, 4 и 5. Фильтры только на шаге 2: ФИО, возраст, были группы, ходили за год или два. Красная загрузка — за год или два, не всех с 2015. Пока набор не посчитали — «Посчитать отбор» на шаге 2.",
  archCount: "Считает рабочий набор только с нашего диска, в Alfa не ходит. В набор — бывшие клиенты. Кто был лидом и сразу ушёл в архив, не клиентом — не входит. Фильтры: ФИО, возраст, были группы, ходили за год или два. Шаги 4 и 5 этот набор наследуют и здесь его не меняют.",
  archCatalog: "Дописывает карточки архива с диска по одной, пауза 5 секунд. Календарь и кассу эта кнопка не грузит. Телефон и слово «тест» на диск не пишем. Кто записался — сразу слева. При сбое Alfa ждёт 5 секунд и повторяет. «Стоп» после текущей. В Alfa не пишет.",
  scopeLiveGroups: "Группы, которые идут по расписанию сейчас. Красная «по одному» и счётчики считают только их. Архивные на этом виде скрыты, их явки сами не качаются. Школа выше по-прежнему фильтрует список. Это вид экрана, не загрузка. В Alfa ничего не пишет.",
  scopeArchGroups: "Группы, которых уже нет в живом расписании. Их явки нужны, чтобы на карточке ученика сошёлся старый остаток. Список появляется после «Архив групп учеников» или «Загрузить архивные группы». Красная очередь на этом виде идёт по архиву. В Alfa группу не восстанавливает. Если список пустой — сначала подтяните архив, потом грузите кварталы как у живых.",
} as const;


function FillBar({ pct, run, done, warn }: { pct: number; run?: boolean; done?: boolean; warn?: boolean }) {
  const w = run ? Math.max(18, Math.min(100, pct)) : Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-primary/12 ring-1 ring-primary/20">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", run ? "ra-progress-run" : warn ? "bg-sky-500" : done ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

type ServerJob = {
  id?: string;
  running?: boolean;
  stop?: boolean;
  mode?: string;
  kind?: string;
  cur?: string;
  n?: number;
  total?: number;
  msg?: string;
  waits?: number;
  next?: string;
  workerSilent?: boolean;
  fill?: { groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string; customerId?: number } | null;
};

function stoppedLine(job: { n?: number; total?: number }) {
  const n = Number(job.n) || 0;
  const total = Number(job.total) || n;
  return `Остановили · прошло ${n} из ${total}.`;
}

function jobFitsTab(job: ServerJob | null | undefined, tab?: string): boolean {
  if (!tab) return true;
  const mode = String(job?.mode || "");
  const kind = String(job?.kind || "");
  if (mode === "catalog" || mode === "count") return tab === "students" || tab === "money";
  if (mode === "audit" || kind === "audit") return tab === "audit";
  if (kind === "balance" || mode === "balance") return tab === "money";
  if (mode === "roster" || mode === "roster-recheck") return tab === "roster";
  if (
    mode === "groups" ||
    mode === "groups-recheck" ||
    mode === "group-one" ||
    mode === "details" ||
    mode === "life" ||
    mode === "archives" ||
    mode === "archivesPupils"
  )
    return tab === "groups";
  if (
    mode === "people" ||
    mode === "people-recheck" ||
    mode === "people-slow" ||
    mode === "person" ||
    mode === "probe" ||
    kind === "students"
  )
    return tab === "students";
  return false;
}

function ServerJobStrip({ job, note, tab }: { job?: ServerJob | null; note?: string; tab?: string }) {
  const stopped = Boolean(job?.stop);
  const run = Boolean(job?.running) && !stopped;
  const mine = run || jobFitsTab(job, tab);
  const n = Number(job?.n) || 0;
  const total = Number(job?.total) || 0;
  const waits = Number(job?.waits) || 0;
  const cur = String(job?.cur || "").trim();
  const next = String(job?.next || "").trim();
  const msg = !mine ? "" : stopped && job ? stoppedLine(job) : String(job?.msg || "").trim();
  const noteText = mine ? String(note || "").trim() : "";
  const pct = total > 0 ? Math.min(100, Math.round((n / Math.max(total, 1)) * 100)) : run ? 12 : 0;
  const extra = [
    total ? `${n}/${total}` : n ? `прошло ${n}` : "",
    run && waits ? `пауза ${waits}/8` : "",
    run && next && !cur.includes(next) ? `дальше ${next}` : "",
    run && job?.workerSilent ? "процесс истории молчит, подхватываем" : "",
    run && noteText && !cur.includes(noteText) && !noteText.includes(cur) ? noteText : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const title = run ? `На сервере: ${cur || "работаем"}` : msg || noteText || "Сервер свободен";
  return (
    <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-full bg-black/5 px-4 py-1.5">
      <p className={cn("truncate text-sm leading-none", run || msg ? "font-semibold" : noteText ? "" : "text-muted")}>{title}</p>
      {run && extra ? <p className="truncate text-[0.72rem] leading-none text-muted">{extra}</p> : null}
      {run ? (
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-primary/15">
          <div className="h-full rounded-full bg-primary ra-progress-run" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.2rem] bg-white p-4 ring-1 ring-black/8 md:p-5">
      <h3 className="font-display text-[1.2rem] leading-tight">{title}</h3>
      {hint ? <p className="mt-1 text-[0.82rem] text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const CRM_SET_TABS = [
  { id: "people", label: "Люди и роли" },
  { id: "alfa", label: "Фон с AlfaCRM" },
  { id: "history", label: "История из Alfa" },
  { id: "queue", label: "Очередь" },
  { id: "funnel", label: "Воронка" },
  { id: "cache", label: "Кэш сайта" },
  { id: "branches", label: "Филиалы" },
] as const;
type CrmSetTab = (typeof CRM_SET_TABS)[number]["id"];
type HistTab = "roster" | "groups" | "students" | "money" | "audit";
const HIST_TABS: { id: HistTab; label: string }[] = [
  { id: "roster", label: "Шаг 1 · Группы и состав" },
  { id: "students", label: "Шаг 2 · Календарь ученика" },
  { id: "groups", label: "Шаг 3 · Занятия в группах" },
  { id: "money", label: "Шаг 4 · Деньги на карточке" },
  { id: "audit", label: "Шаг 5 · Сверка остатка" },
];
const PEOPLE_LOAD_GAP_MS = 5000;
const CATALOG_GAP_MS = 5000;
const PEOPLE_FROM_OPTS = [
  { id: "2015", label: "с начала · 2015" },
  { id: "7", label: "7 лет" },
  { id: "3", label: "3 года" },
  { id: "2", label: "2 года" },
  { id: "1", label: "1 год" },
] as const;
function peopleDateFrom(id: string) {
  if (id === "2015") return "2015-01-01";
  const years = id === "1" ? 1 : id === "2" ? 2 : id === "3" ? 3 : 7;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function YearsSelect({
  value,
  disabled,
  onChange,
  hint = HINT.years,
  small,
  tag = "годы",
  archiveOnly,
}: {
  value: (typeof PEOPLE_FROM_OPTS)[number]["id"];
  disabled?: boolean;
  onChange: (id: (typeof PEOPLE_FROM_OPTS)[number]["id"]) => void;
  hint?: string;
  small?: boolean;
  tag?: string;
  archiveOnly?: boolean;
}) {
  const opts = archiveOnly ? PEOPLE_FROM_OPTS.filter((o) => o.id === "1" || o.id === "2") : PEOPLE_FROM_OPTS;
  return withHint(
    <label className={cn("inline-flex items-center gap-2 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10", small ? "h-8" : "h-10")}>
      {tag ? <span className="text-muted">{tag}</span> : null}
      <select
        className="bg-transparent font-semibold outline-none"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as (typeof PEOPLE_FROM_OPTS)[number]["id"])}
      >
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>,
    hint,
  );
}

function RecheckDaysSelect({
  value,
  disabled,
  onChange,
  small,
  tag = "",
}: {
  value: RecheckDays;
  disabled?: boolean;
  onChange: (n: RecheckDays) => void;
  small?: boolean;
  tag?: string;
}) {
  return withHint(
    <label className={cn("inline-flex items-center gap-2 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10", small ? "h-8" : "h-10")}>
      {tag ? <span className="text-muted">{tag}</span> : null}
      <select
        className="bg-transparent font-semibold outline-none"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clampRecheckDays(e.target.value))}
      >
        {RECHECK_DAY_OPTS.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
      </select>
    </label>,
    HINT.recheckWindow,
  );
}

function GrainSelect({
  value,
  disabled,
  onChange,
  small,
}: {
  value: Grain;
  disabled?: boolean;
  onChange: (g: Grain) => void;
  small?: boolean;
}) {
  return withHint(
    <label className={cn("inline-flex items-center gap-2 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10", small ? "h-8" : "h-10")}>
      <span className="text-muted">годы</span>
      <select
        className="bg-transparent font-semibold outline-none"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Grain)}
      >
        <option value="quarter">Квартал</option>
        <option value="half">Полугодие</option>
        <option value="year">Год (молодые)</option>
      </select>
    </label>,
    HINT.grain,
  );
}

type StudentHit = {
  cid: number;
  branchId: number;
  name: string;
  groups: string[];
  lessons: number;
  pays?: number;
  paysOk?: boolean;
  paysMore?: boolean;
  paysScanned?: boolean;
  paysEmpty?: boolean;
  cashRows?: number;
  cashPaysN?: number;
  cashRefundN?: number;
  cashCorrN?: number;
  cashGoodsN?: number;
  cashPaysSum?: number;
  cashRefundSum?: number;
  cashCorrSum?: number;
  cashGoodsSum?: number;
  rechecked?: boolean;
  paysRechecked?: boolean;
  done: boolean;
  ok: boolean;
  alfa?: number;
  short?: boolean;
  holeN?: number;
  extraN?: number;
  holeIds?: number[];
  extraIds?: number[];
  loadLessonsDisk?: number;
  loadLessonsAlfa?: number;
  loadPaysN?: number;
  loadDupsN?: number;
  recheckLessonsDisk?: number;
  recheckLessonsAlfa?: number;
  recheckPaysN?: number;
  recheckDupsN?: number;
  dups?: boolean;
  holeApproved?: boolean;
};

type PeopleRow = {
  cid: number;
  branchId: number;
  name: string;
  groups: string[];
  lessons: number;
  alfa?: number;
  short?: boolean;
  holeN?: number;
  extraN?: number;
  dups?: boolean;
  holeApproved?: boolean;
  journal?: boolean;
  pays?: boolean;
  paysMore?: boolean;
  paysScanned?: boolean;
  paysEmpty?: boolean;
  cashRows?: number;
  cashPaySum?: number;
  cashWriteoff?: number;
  cashRemain?: number;
  cashHeader?: number | null;
  rechecked?: boolean;
  paysRechecked?: boolean;
  extra?: string;
  at?: string;
  alfaRole?: "лид" | "клиент" | "архив";
};

type MissPack = {
  total: number;
  more?: number;
  items: { id?: number; name: string; extra?: string; groupId?: number; branchId?: number; school?: string; archived?: boolean }[];
};

type FillPart = { key: string; label: string; from?: string; to?: string; done?: boolean; weak?: boolean; empty?: boolean; rechecked?: boolean; lessons?: number; err?: string; at?: string; needDetails?: number; conducted?: number };

type FillRow = {
  groupId?: number;
  branchId?: number;
  name: string;
  school?: string;
  extra?: string;
  archived?: boolean;
  lessons?: number;
  done?: number;
  total?: number;
  next?: string;
  nextKey?: string;
  from?: string;
  weight?: string;
  err?: string;
  complete?: boolean;
  censusOk?: boolean;
  holeN?: number;
  extraN?: number;
  green?: boolean;
  age?: string;
  ageLabel?: string;
  life?: string;
  source?: string;
  parts?: FillPart[];
  pupilN?: number;
  roster?: string;
};

function ruLessons(n: number) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} занятие`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} занятия`;
  return `${n} занятий`;
}

function ruAt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function packGrain(parts: FillPart[] | undefined, grain: Grain) {
  const list = parts || [];
  const byKey = new Map(list.map((p) => [p.key, p]));
  const have = new Set(list.map((p) => p.key));
  return journalChunks(grain)
    .filter((c) => c.keys.some((k) => have.has(k)))
    .map((c) => {
      const kids = c.keys.map((k) => byKey.get(k)).filter(Boolean) as FillPart[];
      const present = c.keys.filter((k) => have.has(k));
      const done = present.every((k) => byKey.get(k)?.done);
      const weak = present.some((k) => byKey.get(k)?.weak);
      const rechecked = present.length > 0 && present.every((k) => byKey.get(k)?.rechecked);
      const lessons = kids.reduce((s, p) => s + (p.lessons || 0), 0);
      const needDetails = kids.reduce((s, p) => s + (p.needDetails || 0), 0);
      const conducted = kids.reduce((s, p) => s + (p.conducted || 0), 0);
      const at = kids.map((p) => p.at).filter(Boolean).sort().at(-1) || "";
      const err = kids.find((p) => p.err)?.err || "";
      return { key: c.key, label: c.label, from: c.from, to: c.to, done, weak, rechecked, lessons, err, at, needDetails, conducted };
    });
}

function CheckLine({ on, text }: { on: boolean; text: string }) {
  return (
    <span className={cn("block", on ? "text-emerald-900" : "text-muted")}>
      {on ? "☑ " : "☐ "}
      {text}
    </span>
  );
}

function pairCount(before?: number, after?: number, now?: number) {
  const pick = (n?: number) => (n != null && Number.isFinite(Number(n)) ? Math.max(0, Number(n) || 0) : null);
  const left = pick(before) ?? pick(now);
  const right = pick(after) ?? pick(now);
  const a = left == null ? "—" : String(left);
  const b = right == null ? "—" : String(right);
  return `до ${a} → после ${b}`;
}

function rubShort(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return ` · ${Math.round(Number(n))} ₽`;
}

const DETAIL_FIELDS = ["домашнее задание", "тема", "комментарий", "таблица учеников"] as const;

function DetailsFields({ on, extra }: { on: boolean; extra?: string }) {
  return (
    <>
      {DETAIL_FIELDS.map((t, i) => (
        <CheckLine key={t} on={on} text={i === DETAIL_FIELDS.length - 1 && extra ? `${t} · ${extra}` : t} />
      ))}
    </>
  );
}

function fillFinished(chunks: FillPart[]) {
  return chunks.length > 0 && chunks.every((c) => c.done && !c.weak);
}

function fillRechecked(chunks: FillPart[]) {
  return chunks.length > 0 && chunks.every((c) => c.rechecked);
}

function fillNeedsRecheck(chunks: FillPart[]) {
  return fillFinished(chunks) && !fillRechecked(chunks);
}

function fillFinishedRow(row: FillRow, grain: Grain) {
  void grain;
  return groupJournalGreen(row);
}

function nextRecheckPart(row: FillRow, grain: Grain) {
  const chunks = packGrain(row.parts, clampGrain(row.age, grain));
  const hole = chunks.find((c) => !c.done || c.weak);
  if (hole) return hole;
  const unverified = chunks.find((c) => !c.rechecked);
  if (unverified) return unverified;
  return [...chunks].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))[0] || chunks[0] || null;
}

function nextWizard(chunks: FillPart[]) {
  const load = chunks.find((c) => !c.empty && (!c.done || c.weak));
  if (load) {
    return {
      kind: "load" as const,
      part: load,
      step: `Шаг 1 · загрузить явки · ${load.label}`,
      btn: load.weak ? `Загрузить ещё раз ${load.label}` : `Загрузить ${load.label}`,
    };
  }
  const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
  return {
    kind: "recheck" as const,
    part: chunks[0] || null,
    step: detailsLeft > 0 ? `явки на месте · без темы/ДЗ ${detailsLeft}` : "Все явки, тема, ДЗ, комментарий и таблица учеников на месте",
    btn: "Перепроверить",
  };
}

function fillGid(r: { branchId?: number; groupId?: number }) {
  return `${r.branchId}-${r.groupId}`;
}

function byFillName(a: FillRow, b: FillRow) {
  return a.name.localeCompare(b.name, "ru") || (a.groupId || 0) - (b.groupId || 0);
}

function pageWithPinned<T>(list: T[], page: number, size: number, isPin: (row: T) => boolean) {
  const pages = Math.max(1, Math.ceil(list.length / size) || 1);
  const start = Math.min(page, pages - 1) * size;
  const slice = list.slice(start, start + size);
  const extra = list.filter((row) => isPin(row) && !slice.includes(row));
  return extra.length ? extra.concat(slice) : slice;
}

/** Сейчас обрабатываем — вверх. Под ним очередь. Остальные ниже, по имени. */
function orderActiveQueue<T>(list: T[], isCurrent: (r: T) => boolean, inQueue: (r: T) => boolean, tie: (a: T, b: T) => number) {
  const cur: T[] = [];
  const queued: T[] = [];
  const rest: T[] = [];
  for (const r of list) {
    if (isCurrent(r)) cur.push(r);
    else if (inQueue(r)) queued.push(r);
    else rest.push(r);
  }
  queued.sort(tie);
  rest.sort(tie);
  return cur.concat(queued, rest);
}

function GroupFillList({
  rows,
  school,
  busy,
  loading,
  grain,
  archived,
  onLoad,
  onRecheck,
  onRecheckAll,
  onStop,
  onDetails,
  onGrain,
}: {
  rows: FillRow[];
  school: string;
  busy?: boolean;
  loading?: { groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string };
  grain: Grain;
  archived?: boolean;
  onLoad: (row: FillRow, part: FillPart, recheck?: boolean) => void;
  onRecheck: (row: FillRow, part: FillPart) => void;
  onRecheckAll: (row: FillRow) => void;
  onStop?: () => void;
  onDetails: (row: FillRow, part?: FillPart) => void;
  onGrain?: (g: Grain) => void;
}) {
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const colLock = useRef<Record<string, boolean>>({});
  const scoped = rows.filter((r) => {
    if (archived) {
      if (!r.archived) return false;
    } else if (r.archived) return false;
    if (school && r.school !== school) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || String(r.school || "").toLowerCase().includes(q) || String(r.groupId || "").includes(q);
  });
  const isPinned = (r: FillRow) => {
    if (open && fillGid(r) === open) return true;
    if (loading && loading.groupId === r.groupId && loading.branchId === r.branchId) return true;
    return false;
  };
  const lockedId = loading?.groupId && loading?.branchId != null ? `${loading.branchId}-${loading.groupId}` : "";
  const finishedOf = (r: FillRow) => {
    const id = fillGid(r);
    const now = fillFinishedRow(r, grain);
    if (lockedId && id === lockedId) {
      if (colLock.current[id] == null) colLock.current[id] = now;
      return colLock.current[id];
    }
    colLock.current[id] = now;
    return now;
  };
  const needRows = orderActiveQueue(
    scoped.filter((r) => !finishedOf(r)),
    (r) => Boolean(loading && loading.groupId === r.groupId && loading.branchId === r.branchId),
    () => true,
    byFillName,
  );
  const doneRows = orderActiveQueue(
    scoped.filter((r) => finishedOf(r)),
    (r) => Boolean(loading && loading.groupId === r.groupId && loading.branchId === r.branchId),
    () => false,
    byFillName,
  );
  const nNeed = needRows.length;
  const nDone = doneRows.length;
  const pagesNeed = Math.max(1, Math.ceil(nNeed / pageSize) || 1);
  const pagesDone = Math.max(1, Math.ceil(nDone / pageSize) || 1);
  const safeNeed = Math.min(pageNeed, pagesNeed - 1);
  const safeDone = Math.min(pageDone, pagesDone - 1);
  const listNeed = pageWithPinned(needRows, safeNeed, pageSize, isPinned);
  const listDone = pageWithPinned(doneRows, safeDone, pageSize, isPinned);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [q, school, pageSize, archived]);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [loading?.groupId, loading?.branchId, loading?.periodKey]);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("crm-journal-page") || 20);
      if (n === 10 || n === 20 || n === 30 || n === 100) setPageSize(n);
    } catch {
      /* */
    }
  }, []);
  function pickPageSize(n: number) {
    setPageSize(n);
    setPageNeed(0);
    setPageDone(0);
    try {
      localStorage.setItem("crm-journal-page", String(n));
    } catch {
      /* */
    }
  }
  function toggleOpen(id: string) {
    setOpen((cur) => (cur === id ? "" : id));
  }
  function pager(page: number, pages: number, onPage: (n: number) => void) {
    if (pages <= 1) return null;
    return (
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Назад
        </button>
        {Array.from({ length: pages }, (_, i) => i).map((i) => (
          <button key={i} type="button" className={cn("h-8 min-w-8 rounded-full px-2 font-semibold", i === page ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onPage(i)}>
            {i + 1}
          </button>
        ))}
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Дальше
        </button>
      </span>
    );
  }
  function renderGroup(row: FillRow) {
          const id = `${row.branchId}-${row.groupId}`;
          const useGrain = clampGrain(row.age, grain);
          const chunks = packGrain(row.parts, useGrain);
          const doneN = chunks.filter((c) => c.done).length;
          const total = chunks.length;
          const pct = total > 0 ? Math.min(100, Math.round((doneN / total) * 100)) : 0;
          const active = loading && loading.groupId === row.groupId && loading.branchId === row.branchId;
          const full = fillFinished(chunks);
          const green = groupJournalGreen(row);
          const shown = open === id;
          const wiz = nextWizard(chunks);
          const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
          const loadKind = active ? loading?.kind || "group" : "";
          const loadLabel = active ? loading?.label || chunks.find((c) => c.key === loading?.periodKey)?.label || wiz.part?.label || "" : "";
          return (
            <li key={id} data-gid={id} className={cn("rounded-2xl p-3 ring-1", green ? "bg-white ring-emerald-300" : active ? "bg-white ring-primary" : "bg-white ring-black/8")}>
              <div className="flex items-start gap-2">
                <button type="button" className="min-w-0 flex-1 text-left font-medium leading-snug" onClick={() => toggleOpen(id)} title={row.name}>
                  {row.name}
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-semibold leading-none ring-1 ring-black/20 hover:bg-black/5"
                  aria-expanded={shown}
                  aria-label={shown ? "свернуть" : "развернуть"}
                  onClick={() => toggleOpen(id)}
                >
                  {shown ? "−" : "+"}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums text-fg" title={`группа ${Number(row.groupId) || ""}`}>
                  №{Number(row.groupId) || "—"}
                </span>
                    {row.archived ? (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[0.72rem] font-semibold text-zinc-800">архив</span>
                    ) : null}
                    {row.archived && row.pupilN ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.72rem] font-semibold text-violet-900">с карточек учеников · {row.pupilN}</span>
                    ) : null}
                    {row.ageLabel ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.72rem] font-semibold",
                          row.age === "young" ? "bg-sky-100 text-sky-900" : row.age === "old" ? "bg-zinc-200 text-zinc-800" : row.age === "mid" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900",
                        )}
                      >
                        {row.ageLabel}
                      </span>
                    ) : null}
                    {green ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">загрузка завершена</span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.72rem] font-semibold text-rose-900">
                        требуют загрузки
                      </span>
                    )}
                    {detailsLeft > 0 ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.72rem] font-semibold text-violet-900">без темы/ДЗ · {detailsLeft}</span>
                    ) : null}
              </div>
              <FillBar pct={pct} run={active} done={green} warn={false} />
              <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
                  {[row.life ? `срок ${row.life}` : "", row.from].filter(Boolean).join(" · ")}
                  {row.archived ? " · архив" : ""}
              </p>
              <p className="mt-2 h-5 truncate text-[0.78rem] font-semibold">{active ? `загрузка · ${loadLabel}` : wiz.step}</p>
              <div className="mt-1 flex min-h-8 flex-wrap items-center gap-2">
                {withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && loadKind !== "details" && "ra-progress-run")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (wiz.kind === "load" && wiz.part) onLoad(row, wiz.part, Boolean(wiz.part.done || wiz.part.weak));
                    else onRecheckAll(row);
                  }}
                >
                  {wiz.btn}
                </button>,
                HINT.loadAttend,
                )}
                {detailsLeft > 0
                  ? withHint(
                      <button
                        type="button"
                        disabled={busy && !active}
                        className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && loadKind === "details" && "ra-progress-run")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDetails(row);
                        }}
                      >
                        {`Тема, ДЗ, комментарий, таблица · ${detailsLeft}`}
                      </button>,
                      HINT.loadDetails,
                    )
                  : null}
                {onGrain ? <GrainSelect value={grain} disabled={busy} onChange={onGrain} small /> : null}
                {withHint(
                <button
                  type="button"
                  disabled={!active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop?.();
                  }}
                >
                  Стоп
                </button>,
                HINT.stop,
                )}
              </div>
              {shown ? (
                <div className="mt-2 grid items-start gap-1 sm:grid-cols-2">
                  {chunks.map((c) => {
                    const spinJ = active && loadKind !== "details" && loading?.periodKey === c.key;
                    const spinD = active && loadKind === "details" && (!loading?.periodKey || loading.periodKey === c.key);
                    const loaded = Boolean(c.done);
                    const verified = Boolean(c.rechecked);
                    const detailsOk = loaded && !(c.needDetails || 0);
                    const noHw = loaded && (c.conducted || 0) === 0 && !(c.needDetails || 0);
                    const status = spinJ || spinD ? "загрузка…" : detailsOk && (verified || loaded) ? "готово" : loaded ? "отмечено" : "";
                    return (
                      <div
                        key={c.key}
                        className={cn(
                          "flex min-h-[17.5rem] flex-col rounded-xl px-2.5 py-2 ring-1",
                          c.weak ? "bg-amber-50 ring-amber-300" : loaded ? "bg-emerald-50 ring-emerald-200" : spinJ || spinD ? "bg-primary/8 ring-primary" : "bg-white ring-black/10",
                        )}
                      >
                        <p className="font-medium text-sm">{c.label}</p>
                        <p className="h-4 text-[0.72rem] font-semibold text-black">{status}</p>
                        <div className="text-[0.72rem] leading-snug">
                          <CheckLine on={loaded} text={`${c.label} загружен`} />
                          <CheckLine on={verified} text={`${c.label} перепроверен`} />
                          <CheckLine on={verified} text="в этом квартале дубликатов нет" />
                          <span className="mt-1 block font-medium text-muted">по каждому уроку:</span>
                          <DetailsFields
                            on={detailsOk}
                            extra={noHw ? "грузить нечего" : !detailsOk && c.needDetails ? `осталось ${c.needDetails}` : undefined}
                          />
                        </div>
                        <div className="mt-auto pt-1 text-[0.72rem] leading-4 text-muted">
                          <p>
                            {c.weak ? "пакет оборвался" : c.err && !c.done ? c.err : c.lessons ? ruLessons(c.lessons) : loaded ? "занятий за квартал нет" : "ещё не загружали"}
                          </p>
                          <p>{c.at ? ruAt(c.at) : "\u00a0"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {withHint(
                          <button
                            type="button"
                            disabled={busy && !spinJ}
                            className={cn(
                              "h-8 w-fit rounded-full px-4 text-[0.78rem] font-semibold disabled:opacity-50",
                              spinJ ? "ra-progress-run text-white" : !loaded || c.weak ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-white text-fg ring-1 ring-black/10 hover:bg-primary/5",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoad(row, c, Boolean(loaded || c.weak));
                            }}
                          >
                            {spinJ ? "загрузка…" : !loaded || c.weak ? `Загрузить явки · ${c.label}` : "Перепроверить"}
                          </button>,
                          HINT.loadAttend,
                          )}
                          {withHint(
                          <button
                            type="button"
                            disabled={!loaded || detailsOk || noHw || (busy && !spinD)}
                            className={cn(
                              "h-8 w-fit rounded-full px-4 text-[0.78rem] font-semibold disabled:opacity-40",
                              spinD
                                ? "ra-progress-run text-white"
                                : detailsOk || noHw
                                  ? "bg-white text-muted ring-1 ring-black/10"
                                  : loaded
                                    ? "bg-primary/12 text-primary ring-1 ring-primary/35 hover:bg-primary hover:text-white"
                                    : "bg-white text-muted ring-1 ring-black/10",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDetails(row, c);
                            }}
                          >
                            {spinD
                              ? "загрузка…"
                              : detailsOk || noHw
                                ? "готово"
                                : loaded
                                  ? `Загрузить детали · ${c.needDetails || 0}`
                                  : "Сначала явки"}
                          </button>,
                          HINT.loadDetails,
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
  }

  if (!scoped.length) return <p className="mt-3 text-sm text-muted">{archived ? "Нет архивных групп в этом фильтре." : "Нет живых групп в этом фильтре."}</p>;
  return (
    <div className="mt-3">
      <input
        className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        placeholder="Найти группу…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.78rem]">
        <span className="text-muted">На странице</span>
        {([10, 20, 30, 100] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={cn("h-8 rounded-full px-3 font-semibold", pageSize === n ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
            onClick={() => pickPageSize(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-rose-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-rose-900">Требуют загрузки данных · {nNeed}</h4>
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Ещё не жали «Загрузить явки» по всем кварталам срока. Это не пропуск в списке — их {nNeed} из {scoped.length}.</p>
          {listNeed.length ? <ul className="mt-2 space-y-2 p-0.5 [overflow-anchor:none]">{listNeed.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Все группы этой школы уже загружены.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Загрузка данных завершена · {nDone} из {scoped.length}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Все обработанные группы этой школы. Если группа справа — кварталы срока сверены, пропуска нет. Пока {nDone} из {scoped.length}.</p>
          {listDone.length ? <ul className="mt-2 space-y-2 p-0.5 [overflow-anchor:none]">{listDone.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Пока ни одна группа не загружена до конца.</p>}
        </section>
      </div>
    </div>
  );
}

function peopleId(r: PeopleRow) {
  return String(r.cid);
}

function byPeopleName(a: PeopleRow, b: PeopleRow) {
  return a.name.localeCompare(b.name, "ru") || a.cid - b.cid;
}

function peopleNeedCashLoad(row: PeopleRow) {
  return !peopleFinished(row, "balance");
}

function peopleFinished(row: PeopleRow, kind: "students" | "balance") {
  if (kind === "balance") return Boolean(row.paysScanned || row.pays);
  if (row.short && row.holeApproved) return true;
  if (row.short) return false;
  return Boolean(row.journal);
}

function peopleQueue(rows: PeopleRow[], kind: "students" | "balance", recheck: boolean) {
  const needLoad = rows.filter((r) => (kind === "balance" ? peopleNeedCashLoad(r) : !peopleFinished(r, kind)));
  const needRecheck = rows.filter((r) => {
    if (!peopleFinished(r, kind)) return false;
    if (kind === "students" && r.short && r.holeApproved) return false;
    return r.dups || (kind === "balance" ? !r.paysRechecked : !r.rechecked);
  });
  if (recheck) return needRecheck.length ? needRecheck : rows.filter((r) => peopleFinished(r, kind) && !(kind === "students" && r.short && r.holeApproved));
  return needLoad;
}

function peopleNeedsRecheck(row: PeopleRow, kind: "students" | "balance") {
  if (kind === "students" && row.short && row.holeApproved) return false;
  if (!peopleFinished(row, kind)) return false;
  if (row.dups) return true;
  return kind === "balance" ? !row.paysRechecked : !row.rechecked;
}

function peopleHoleOk(row: PeopleRow) {
  return Boolean(row.short && row.holeApproved);
}

function confirmHole(row: PeopleRow, on: boolean, alfa?: number) {
  const line = peopleLessonsLine({ disk: row.lessons, alfa: alfa ?? row.alfa, hole: row.holeN, extra: row.extraN, holeIds: row.holeIds, extraIds: row.extraIds, at: row.at }).line || `№${row.cid}`;
  const ask = on
    ? `${line}\nжурнал не закроется, снять только вручную.`
    : `${line}\nснять отметку? карточка вернётся в «требуют».`;
  return window.confirm(ask);
}

function patchHoleApproved(
  side:
    | { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number }
    | undefined,
  cid: number,
  holeApproved: boolean,
) {
  if (!side?.people?.length) return side;
  const people = side.people.map((p) => (p.cid === cid ? { ...p, holeApproved } : p));
  return { ...side, people };
}

function auditFail(codes?: string[]) {
  return Boolean(codes?.includes("нет ответа"));
}

function moneyCloseUi(a?: number, b?: number) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= 1;
}

type AuditSegIn = {
  seen?: boolean;
  codes?: string[];
  clients?: number;
  alfaMoney?: number;
  cash?: number;
  alfaRole?: string;
  extra?: string;
  status?: string;
  study?: number;
  funnel?: string;
  leadStatus?: number;
  headerStamped?: number;
};

function rowMatched(r: AuditSegIn) {
  if (!r.seen || auditFail(r.codes)) return false;
  const codes = r.codes || [];
  if (codes.includes("нет id") || codes.includes("нет роли") || codes.includes("нет сверки") || codes.includes("нет balance")) return false;
  if (!Number.isFinite(r.alfaMoney as number)) return false;
  if (!moneyCloseUi(r.clients, r.alfaMoney) || !moneyCloseUi(r.cash, r.alfaMoney)) return false;
  const zero = moneyCloseUi(r.clients, 0) && moneyCloseUi(r.cash, 0);
  if (zero && (r.codes || []).includes("snap") && !(r.codes || []).includes("ok")) return false;
  if ((r.codes || []).includes("лид") && !(r.codes || []).includes("ok")) return false;
  return true;
}

const AUDIT_WORD: Record<string, string> = {
  ok: "Совпало",
  lessons: "Занятия не сошлись",
  pays: "Оплаты не сошлись",
  snap: "Касса не дочитана",
  src: "Журнал ≠ календарь",
  ctt: "Спутали с абонементом",
  formula: "Показ в Клиентах",
  status: "Урок ещё не проведён",
  dup: "Дубли занятий",
  branch: "Другой филиал",
  goods: "Товар в ленте, не в остатке",
  "refund-goods": "Возврат товара",
  corr: "Нет корректировки",
  "corr-goods": "Корректировка как товар",
  wo: "Списаний больше шапки",
  wo0: "Нулевые списания",
  unknown: "Не разобрали",
  "нет ответа": "Нет ответа Alfa",
  "нет id": "id не найден",
  "нет balance": "нет balance",
  "нет роли": "Нет роли на досье",
  "нет сверки": "Сверки нет",
  лид: "Лид в Альфе",
  архив: "Архив в Альфе",
};

type AuditSeg = { id: string; label: string; rec: string };

function auditSeg(r: AuditSegIn): AuditSeg {
  const codes = r.codes || [];
  const extra = String(r.extra || "");
  if (!r.seen) {
    return { id: "wait", label: "Не сверяли", rec: "Сверить всех текущих или на карточке «Перепроверить»." };
  }
  if (codes.includes("нет id") || extra === "id не найден") {
    return { id: "no-id", label: "id не найден", rec: "В Alfa нет карточки с этим id. Это не «цифры не сошлись» и не «касса меньше шапки»." };
  }
  if (codes.includes("нет balance") || extra === "нет balance") {
    return { id: "no-balance", label: "нет balance", rec: "Досье есть, поля balance нет. Шапку не с чем сверять." };
  }
  if (codes.includes("нет роли") || /нет роли на досье/.test(extra) || extra === "не разобрали") {
    return { id: "no-role", label: "Нет роли на досье", rec: "Роль не разобрали, шапку не зовём. Это не «касса меньше шапки»." };
  }
  if (codes.includes("нет сверки") || /кассы нет|нет А|не в наборе шага 2, не сверяем|сверки нет/.test(extra)) {
    return {
      id: "no-sverka",
      label: "Сверки нет",
      rec: /нет А/.test(extra)
        ? "Касса не закрыта шагом 4. Шапку не зовём."
        : /кассы нет/.test(extra)
          ? "У лида нет живой кассы — шапку не сверяем."
          : "Не в наборе сверки. Шапку не зовём.",
    };
  }
  if (auditFail(codes)) {
    return { id: "fail", label: "Нет ответа Alfa", rec: "Клиент есть, Alfa не ответила. «Перепроверить». Если снова тишина — обрыв или 429, не бан." };
  }
  if (rowMatched(r)) {
    return { id: "ok", label: "Совпало", rec: "Клиенты, шапка и касса сходятся ±1 ₽. Трогать не нужно." };
  }
  const header = Number.isFinite(r.alfaMoney as number) && moneyCloseUi(r.clients, r.alfaMoney);
  const cashHi = Number.isFinite(r.alfaMoney as number) && (Number(r.cash) || 0) > (Number(r.alfaMoney) || 0) + 1;
  const cashLo = Number.isFinite(r.alfaMoney as number) && (Number(r.cash) || 0) < (Number(r.alfaMoney) || 0) - 1;
  const goods = codes.includes("goods") || codes.includes("product") || codes.includes("refund-goods");
  if (goods) {
    return { id: "goods", label: "Товар в ленте, не в остатке", rec: "Платёж «Продажа товара» не влияет на остаток клиента. В формуле и шапке товара нет." };
  }
  if (header && cashHi) {
    if (codes.includes("lessons") || codes.includes("wo") || codes.includes("status")) {
      return { id: "cash-hi", label: "Касса больше шапки", rec: "На диске мало списаний. Шаг 2: календарь этого человека «Перепроверить». Шапку не подгонять." };
    }
    if (codes.includes("snap")) {
      return { id: "snap", label: "Касса не дочитана", rec: "Шаг 4: касса «Перепроверить» с начала. Потом снова шаг 5." };
    }
    return { id: "cash-hi", label: "Касса больше шапки", rec: "Сначала шаг 2 (календарь), затем шаг 4 (касса). Шапку не трогать." };
  }
  if (header && cashLo) {
    if (codes.includes("status") && !codes.includes("pays") && !codes.includes("snap")) {
      return { id: "status", label: "Урок ещё не проведён", rec: "В календаре цена, урок не проведён. Alfa ещё не списала. Ждать занятие, в Alfa не писать." };
    }
    return { id: "cash-lo", label: "Касса меньше шапки", rec: "Не все оплаты на диске. Шаг 4: загрузить / перепроверить кассу. Затем снова сверка." };
  }
  if (codes.includes("ctt")) {
    return { id: "ctt", label: "Спутали с абонементом", rec: "Сравнивали rest абонемента с общей шапкой. «Перепроверить» на шаге 5 — в Клиентах должна быть шапка, не rest." };
  }
  if (codes.includes("src") || codes.includes("formula")) {
    return { id: "show", label: "Показ в Клиентах", rec: "«Перепроверить» на шаге 5: заново поставит шапку в карточку. Журнал и кассу не качать." };
  }
  if (codes.includes("snap") || codes.includes("pays")) {
    return { id: "snap", label: "Касса не дочитана", rec: "Шаг 4 дочитать кассу, потом шаг 5." };
  }
  if (codes.includes("lessons") || codes.includes("wo")) {
    return { id: "cash-hi", label: "Касса больше шапки", rec: "Шаг 2 перепроверить календарь, потом шаг 5. Шапку не трогать." };
  }
  return { id: "money", label: "Цифры не сошлись", rec: "«Перепроверить» на шаге 5. Если касса пустая — шаг 4. Если занятий мало — шаг 2." };
}

const AUDIT_REASON_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ok", label: "Совпало" },
  { id: "cash-hi", label: "Касса больше шапки" },
  { id: "cash-lo", label: "Касса меньше шапки" },
  { id: "goods", label: "Товар в ленте, не в остатке" },
  { id: "no-sverka", label: "Сверки нет" },
  { id: "no-role", label: "Нет роли на досье" },
  { id: "no-id", label: "id не найден" },
  { id: "no-balance", label: "нет balance" },
  { id: "snap", label: "Касса не дочитана" },
  { id: "show", label: "Показ в Клиентах" },
  { id: "ctt", label: "Спутали с абонементом" },
  { id: "status", label: "Урок ещё не проведён" },
  { id: "money", label: "Цифры не сошлись" },
  { id: "fail", label: "Нет ответа Alfa" },
  { id: "wait", label: "Не сверяли" },
];

const AUDIT_SEG_ORDER = ["lead", "arch", ...AUDIT_REASON_CHIPS.map((c) => c.id).filter((id) => id !== "all" && id !== "ok")];

const AUDIT_ROLES: { id: "all" | "клиент" | "лид" | "архив"; label: string }[] = [
  { id: "all", label: "Все роли" },
  { id: "клиент", label: "Клиенты" },
  { id: "лид", label: "Лиды" },
  { id: "архив", label: "Архив" },
];

const AUDIT_ROLE_HEAD: Record<"клиент" | "лид" | "архив" | "нет", { label: string; rec: string }> = {
  клиент: { label: "Клиенты", rec: "Ученики в Альфе. Сверяем шапку и кассу." },
  лид: { label: "Лиды", rec: "В Альфе лид. Пустая лента — нули. Формула 0 и шапка 0 — Совпало." },
  архив: { label: "Архив", rec: "В Альфе архив. Как текущего не сверять." },
  нет: { label: "Нет ответа Alfa", rec: "Alfa не подтвердила роль. Это не клиент, пока не ответит. Смотрите карточку в Альфе — часто лид или архив." },
};

function auditRole(r: AuditSegIn): "лид" | "клиент" | "архив" {
  const codes = r.codes || [];
  const extra = String(r.extra || "");
  if (codes.includes("архив") || /Архив в Альфе/.test(extra) || r.alfaRole === "архив" || r.status === "архив" || Number(r.study) === 2) return "архив";
  if (codes.includes("лид") || /Лид в Альфе/.test(extra) || r.alfaRole === "лид" || Number(r.study) === 0 || String(r.funnel || "") === "1") return "лид";
  return "клиент";
}

function auditCodeWords(codes?: string[]) {
  return [...new Set((codes || []).filter((c) => c && c !== "ok").map((c) => AUDIT_WORD[c] || c))];
}

function auditReasonHit(r: AuditSegIn, id: string) {
  if (id === "all") return true;
  return auditSeg(r).id === id;
}

function rubAudit(n?: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "не собрали";
  const v = Math.round(x);
  if (v > 0) return `+${v} ₽`;
  return `${v} ₽`;
}

function auditFormulaSigned(n: number) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+${v}`;
  if (v < 0) return `\u2212${Math.abs(v)}`;
  return "0";
}

function alfaFormulaCalc(row: {
  seen?: boolean;
  woSum?: number;
  alfaSplitOk?: boolean;
  alfaPaysSum?: number;
  alfaCorrSum?: number;
  alfaGoodsSum?: number;
  alfaWoSum?: number;
  alfaWoOk?: boolean;
  cashPaysSum?: number;
  cashCorrSum?: number;
  cashGoodsSum?: number;
}) {
  if (!row.seen || !row.alfaSplitOk || !row.alfaWoOk) return "ещё не снимали";
  const pay = Number(row.alfaPaysSum) || 0;
  const corr = Number(row.alfaCorrSum) || 0;
  const wo = Number(row.alfaWoSum) || 0;
  const n = pay + corr - wo;
  const bits = [auditFormulaSigned(pay)];
  if (wo) bits.push(`\u2212${Math.round(Math.abs(wo))}`);
  if (corr) bits.push(`${corr > 0 ? "+" : "\u2212"}${Math.round(Math.abs(corr))}`);
  return `${bits.join(" ")} = ${auditFormulaSigned(n)} \u20BD`;
}

function patchPeopleSide(
  side:
    | { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number }
    | undefined,
  hit: StudentHit,
) {
  if (!side?.people?.length) return side;
  const people = side.people.map((p) => {
    if (p.cid !== hit.cid) return p;
    const short = Boolean(hit.short);
    const disk = Number(hit.lessons) || p.lessons;
    const journal = !short && Boolean(hit.ok);
    const alfa = hit.alfa != null ? keepAlfa(p.alfa, hit.alfa) : p.alfa;
    let dups = hit.dups != null ? Boolean(hit.dups) : Boolean(p.dups);
    if (short) dups = false;
    const pays = hit.paysOk != null ? Boolean(hit.paysOk) : p.pays;
    const paysScanned = hit.paysScanned != null ? Boolean(hit.paysScanned) : p.paysScanned;
    const paysEmpty = hit.paysEmpty != null ? Boolean(hit.paysEmpty) : p.paysEmpty;
    const cashRows = hit.cashRows != null ? Number(hit.cashRows) || 0 : p.cashRows;
    const rechecked = hit.rechecked != null ? Boolean(hit.rechecked) : p.rechecked;
    const paysRechecked = hit.paysRechecked != null ? Boolean(hit.paysRechecked) : p.paysRechecked;
    const extra = hit.paysMore
      ? `касса: ещё страницы, нажмите снова`
      : peopleLessonsLine({ disk, alfa, hole: hit.holeN ?? p.holeN, extra: hit.extraN ?? p.extraN, holeIds: hit.holeIds ?? p.holeIds, extraIds: hit.extraIds ?? p.extraIds }).line || p.extra;
    return {
      ...p,
      lessons: disk,
      alfa,
      short,
      dups,
      holeN: hit.holeN != null ? Number(hit.holeN) : p.holeN,
      extraN: hit.extraN != null ? Number(hit.extraN) : p.extraN,
      holeApproved: hit.holeApproved != null ? Boolean(hit.holeApproved) : p.holeApproved,
      journal,
      pays,
      paysScanned,
      paysEmpty,
      cashRows,
      paysMore: Boolean(hit.paysMore),
      rechecked,
      paysRechecked,
      extra,
    };
  });
  return {
    ...side,
    people,
    journalDone: people.filter((r) => r.journal).length,
    cardDone: people.filter((r) => r.pays || r.paysScanned).length,
  };
}

function mergePeopleSide<T extends { total?: number; people?: PeopleRow[] }>(cur?: T, res?: T): T | undefined {
  if (!res && !cur) return res;
  const resPeople = res?.people || [];
  const curPeople = cur?.people || [];
  const people = resPeople.length ? resPeople : curPeople;
  const total = Number(res?.total) > 0 ? Number(res.total) : people.length || Number(cur?.total) || 0;
  return { ...(cur as T), ...(res as T), people, total };
}

function applyJobStatus<T extends {
  progress?: {
    live?: { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number };
    archive?: { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number };
    groups?: { rows?: FillRow[]; [k: string]: unknown };
    ungrouped?: { total?: number; items?: { cid?: number; branchId?: number; name?: string }[]; more?: number };
  };
  students?: { live?: number; archive?: number; all?: number };
  lastStudents?: { study?: string; rows?: StudentHit[] } | null;
  lastAudit?: unknown;
  lastArchiveCatalog?: unknown;
  lastLife?: unknown;
  lastArchives?: unknown;
  lastArchivesPupils?: unknown;
  job?: unknown;
}>(cur: T | null, res: T & { groupRow?: FillRow | null }): T {
  const hit = res.lastStudents?.rows?.[0];
  const studyKey = res.lastStudents?.study === "2" ? "archive" : "live";
  const base = cur || res;
  let progress = {
    ...base.progress,
    ...res.progress,
    live: mergePeopleSide(base.progress?.live, res.progress?.live),
    archive: mergePeopleSide(base.progress?.archive, res.progress?.archive),
    groups: res.progress?.groups || base.progress?.groups,
    ungrouped: res.progress?.ungrouped || base.progress?.ungrouped,
  };
  if (hit) {
    progress = {
      ...progress,
      [studyKey]: patchPeopleSide(progress[studyKey], hit),
    };
  }
  const row = res.groupRow;
  if (row && progress.groups && Array.isArray(progress.groups.rows)) {
    const rows = progress.groups.rows.map((r) => (r.groupId === row.groupId && (!row.branchId || r.branchId === row.branchId) ? { ...r, ...row } : r));
    progress = { ...progress, groups: { ...progress.groups, rows } };
  }
  return {
    ...base,
    ...res,
    progress,
    lastStudents: res.lastStudents ?? base.lastStudents,
    lastAudit: res.lastAudit
      ? {
          ...(res.lastAudit as object),
          rows: Array.isArray((res.lastAudit as { rows?: unknown }).rows)
            ? [...((res.lastAudit as { rows: unknown[] }).rows)]
            : (res.lastAudit as { rows?: unknown }).rows,
        }
      : base.lastAudit,
    lastArchiveCatalog: res.lastArchiveCatalog ?? base.lastArchiveCatalog,
    lastLife: res.lastLife ?? base.lastLife,
    lastArchives: res.lastArchives ?? base.lastArchives,
    lastArchivesPupils: res.lastArchivesPupils ?? base.lastArchivesPupils,
    job: res.job ?? base.job,
    planLog: (res as { planLog?: unknown }).planLog ?? (base as { planLog?: unknown }).planLog,
    historyWorker: (res as { historyWorker?: unknown }).historyWorker ?? (base as { historyWorker?: unknown }).historyWorker,
  };
}

function ScopePills({
  value,
  onChange,
  live,
  arch,
  hintLive,
  hintArch,
  middle,
}: {
  value: "live" | "archive";
  onChange: (v: "live" | "archive") => void;
  live: string;
  arch: string;
  hintLive: string;
  hintArch: string;
  middle?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {withHint(
        <button type="button" className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", value === "live" ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onChange("live")}>
          {live}
        </button>,
        hintLive,
      )}
      {middle}
      {withHint(
        <button type="button" className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", value === "archive" ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onChange("archive")}>
          {arch}
        </button>,
        hintArch,
      )}
    </div>
  );
}

function PeopleFillList({
  rows,
  kind,
  busy,
  loadingCid,
  onLoad,
  onRecheck,
  onFullHistory,
  onResetHistory,
  onHole,
  onStop,
  years,
  windowSel,
}: {
  rows: PeopleRow[];
  kind: "students" | "balance";
  busy?: boolean;
  loadingCid?: number;
  onLoad: (row: PeopleRow) => void;
  onRecheck: (row: PeopleRow) => void;
  onFullHistory?: (row: PeopleRow) => void;
  onResetHistory?: (row: PeopleRow) => void;
  onHole?: (row: PeopleRow, on: boolean) => void;
  onStop?: () => void;
  years?: ReactNode;
  windowSel?: ReactNode;
}) {
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const colLock = useRef<Record<string, boolean>>({});
  const packMemo = useRef<Record<number, { before: number; plus?: number; active?: boolean }>>({});
  const alfaKeep = useRef<Record<number, number>>({});
  const scoped = rows.filter((r) => {
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || String(r.cid).includes(q) || (r.groups || []).some((g) => g.toLowerCase().includes(q));
  });
  const isPinned = (r: PeopleRow) => peopleId(r) === open || r.cid === loadingCid;
  const finishedOf = (r: PeopleRow) => {
    const id = peopleId(r);
    const now = peopleFinished(r, kind);
    if (loadingCid && r.cid === loadingCid) {
      if (colLock.current[id] == null) colLock.current[id] = now;
      return colLock.current[id];
    }
    colLock.current[id] = now;
    return now;
  };
  const needRows = orderActiveQueue(
    scoped.filter((r) => !finishedOf(r) || peopleHoleOk(r)),
    (r) => r.cid === loadingCid,
    () => true,
    byPeopleName,
  );
  const doneRows = orderActiveQueue(
    scoped.filter((r) => finishedOf(r) && !peopleHoleOk(r)),
    (r) => r.cid === loadingCid,
    (r) => peopleNeedsRecheck(r, kind),
    byPeopleName,
  );
  const nNeed = needRows.length;
  const nDone = doneRows.length;
  const nApproved = kind === "students" ? needRows.filter((r) => peopleHoleOk(r)).length : 0;
  const nComplete = nDone;
  const pagesNeed = Math.max(1, Math.ceil(nNeed / pageSize) || 1);
  const pagesDone = Math.max(1, Math.ceil(nDone / pageSize) || 1);
  const safeNeed = Math.min(pageNeed, pagesNeed - 1);
  const safeDone = Math.min(pageDone, pagesDone - 1);
  const listNeed = pageWithPinned(needRows, safeNeed, pageSize, isPinned);
  const listDone = pageWithPinned(doneRows, safeDone, pageSize, isPinned);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [q, pageSize, kind]);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [loadingCid]);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("crm-journal-page") || 20);
      if (n === 10 || n === 20 || n === 30 || n === 100) setPageSize(n);
    } catch {
      /* */
    }
  }, []);
  useEffect(() => {
    if (loadingCid) {
      const row = rows.find((r) => r.cid === loadingCid);
      const disk = Number(row?.lessons) || 0;
      const cur = packMemo.current[loadingCid];
      if (!cur || !cur.active) {
        packMemo.current[loadingCid] = { before: disk, active: true };
      } else {
        cur.plus = Math.max(0, disk - cur.before);
      }
    } else {
      for (const st of Object.values(packMemo.current)) {
        if (st.active) st.active = false;
      }
    }
  }, [loadingCid, rows]);
  function pickPageSize(n: number) {
    setPageSize(n);
    setPageNeed(0);
    setPageDone(0);
    try {
      localStorage.setItem("crm-journal-page", String(n));
    } catch {
      /* */
    }
  }
  function pager(page: number, pages: number, onPage: (n: number) => void) {
    if (pages <= 1) return null;
    return (
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Назад
        </button>
        {Array.from({ length: pages }, (_, i) => i).map((i) => (
          <button key={i} type="button" className={cn("h-8 min-w-8 rounded-full px-2 font-semibold", i === page ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onPage(i)}>
            {i + 1}
          </button>
        ))}
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Дальше
        </button>
      </span>
    );
  }
  function renderPerson(row: PeopleRow) {
    const id = peopleId(row);
    const full = peopleFinished(row, kind);
    const needsRecheck = peopleNeedsRecheck(row, kind);
    const short = Boolean(row.short);
    const approved = kind === "students" && peopleHoleOk(row);
    const canHole = kind === "students" && short && Boolean(onHole);
    const dups = Boolean(row.dups);
    const active = loadingCid === row.cid;
    const shown = open === id;
    const pct = full && !dups && !approved ? 100 : short || dups || approved || row.lessons ? 50 : 0;
    if (row.alfa != null && Number.isFinite(Number(row.alfa))) {
      if (Number(row.alfa) === 0 || (Boolean(row.short) && Number(row.lessons) === 0)) alfaKeep.current[row.cid] = Number(row.alfa);
      else alfaKeep.current[row.cid] = keepAlfa(alfaKeep.current[row.cid], row.alfa) as number;
    }
    const alfaShown = alfaKeep.current[row.cid] ?? row.alfa;
    const packSt = packMemo.current[row.cid];
    const plus = packSt?.active ? Math.max(0, (Number(row.lessons) || 0) - packSt.before) : packSt && packSt.plus != null ? packSt.plus : undefined;
    const nums =
      kind === "students"
        ? peopleLessonsLine({ disk: row.lessons, alfa: alfaShown, hole: row.holeN, extra: row.extraN, holeIds: row.holeIds, extraIds: row.extraIds, pack: PEOPLE_PACK, plus, at: row.at, running: active })
        : null;
    const numsHint = peopleStudentHint({ short, dups, holeApproved: approved, lineHint: nums?.hint || "" });
    const act = kind === "balance" ? (full ? "recheck" : "load") : peopleStudentAction({ short, dups, journal: Boolean(row.journal), holeApproved: approved });
    const badge = peopleStudentBadge({ approved, short, dups, full, needsRecheck });
    const step = active
      ? `загрузка · ${row.name}`
      : short
        ? nums
          ? numsHint || "добрать"
          : "добрать"
        : dups
        ? nums
          ? numsHint
          : "лишние id · снять"
        : full
        ? kind === "balance"
          ? "Касса на месте"
          : nums
            ? nums.hint || "Календарь на месте"
            : "Календарь на месте"
        : kind === "balance"
          ? row.paysMore
            ? "касса: ещё страницы, нажмите снова"
            : "Загрузить кассу"
          : "Шаг 1 · загрузить календарь";
    const btn = kind === "balance"
      ? full ? "Перепроверить" : "Загрузить кассу"
      : act === "recheck" ? "Перепроверить" : act === "dobrat" ? "Добрать" : "Загрузить календарь";
    return (
      <li key={id} className={cn("rounded-2xl p-3 ring-1", approved || short || dups ? "bg-amber-50 ring-amber-400" : needsRecheck ? "bg-sky-50 ring-sky-400" : full ? "bg-white ring-emerald-300" : active ? "bg-white ring-primary" : "bg-white ring-black/8")}>
        <div className="flex items-center gap-2">
          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen((cur) => (cur === id ? "" : id))} title={row.name}>
            {row.name}
          </button>
          <span className="flex shrink-0 items-center gap-1.5">
            {canHole
              ? withHint(
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-amber-600"
                    checked={approved}
                    aria-label={approved ? "дырка принята" : "одобрить дырку"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const on = e.target.checked;
                      e.target.checked = approved;
                      if (!confirmHole(row, on, alfaShown)) return;
                      onHole?.(row, on);
                    }}
                  />,
                  HINT.hole,
                )
              : null}
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums">№{row.cid}</span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {badge === "approved" ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950" title="Журнал не сошёлся. Допущен к следующим шагам. Снять отметку вручную.">
                Одобрен
              </span>
            ) : badge === "short" ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950">в Alfa больше</span>
            ) : badge === "dups" ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950">на диске больше · есть дубли</span>
            ) : badge === "recheck" ? (
              <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[0.72rem] font-semibold text-sky-950">есть неперепроверенные данные</span>
            ) : badge === "done" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">загрузка завершена</span>
            ) : (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.72rem] font-semibold text-rose-900">требуют загрузки</span>
            )}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-semibold leading-none ring-1 ring-black/20 hover:bg-black/5"
            aria-expanded={shown}
            aria-label={shown ? "свернуть" : "развернуть"}
            onClick={() => setOpen((cur) => (cur === id ? "" : id))}
          >
            {shown ? "−" : "+"}
          </button>
        </div>
        <FillBar pct={pct} run={active} done={full && !needsRecheck && !dups && !approved} warn={needsRecheck || short || dups || approved} />
        <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
          {(row.groups || []).slice(0, 2).join(" · ") || "групп на карточке нет"}
        </p>
        {nums ? (
          <>
            <p className="mt-2 text-[0.78rem] font-semibold tabular-nums leading-snug">
              {active ? `загрузка · ` : ""}
              {nums.line}
              {numsHint ? ` · ${numsHint}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 h-5 truncate text-[0.78rem] font-semibold">{step}</p>
        )}
        <div className="mt-1 flex min-h-8 flex-wrap items-center gap-2">
          {withHint(
          <button
            type="button"
            disabled={busy && !active}
            className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && "ra-progress-run")}
            onClick={(e) => {
              e.stopPropagation();
              if (kind === "balance" ? full : act === "recheck") onRecheck(row);
              else onLoad(row);
            }}
          >
            {btn}
          </button>,
          (kind === "balance" ? full : act === "recheck") ? (kind === "balance" ? HINT.recheckPay : HINT.recheckCal) : kind === "balance" ? HINT.loadPay : HINT.loadCal,
          )}
          {kind === "balance" ? (full ? windowSel : years) : act === "recheck" ? windowSel : years}
          {short && onFullHistory
            ? withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullHistory(row);
                  }}
                >
                  Загрузить всю историю
                </button>,
                HINT.fullHist,
              )
            : null}
          {short && kind === "students" && onResetHistory
            ? withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`№${row.cid}: стереть занятия с диска и обнулить счёт Alfa? Качку не стартуем — потом «Добрать».`)) return;
                    onResetHistory(row);
                  }}
                >
                  С нуля
                </button>,
                HINT.resetHist,
              )
            : null}
          {kind === "balance" && onResetHistory
            ? withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`№${row.cid}: стереть платежи с диска и снять «касса загружена»? Качку не стартуем — потом «Загрузить кассу».`)) return;
                    onResetHistory(row);
                  }}
                >
                  С нуля
                </button>,
                HINT.resetPay,
              )
            : null}
          {approved && onHole
            ? withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirmHole(row, false, alfaShown)) return;
                    onHole(row, false);
                  }}
                >
                  Снять отметку
                </button>,
                HINT.hole,
              )
            : null}
          {withHint(
          <button
            type="button"
            disabled={!active}
            className={BTN_GHOST_SM}
            onClick={(e) => {
              e.stopPropagation();
              onStop?.();
            }}
          >
            Стоп
          </button>,
          HINT.stop,
          )}
        </div>
        {shown ? (
          <div className="mt-2 rounded-xl bg-white px-2.5 py-2 text-[0.72rem] leading-snug ring-1 ring-black/10">
            {kind === "balance" ? (
              <>
                <CheckLine
                  on={Boolean(row.journal) && !short}
                  text={`календарь загружен · диск ${row.loadLessonsDisk ?? row.lessons} · Alfa ${row.loadLessonsAlfa ?? row.alfa ?? "—"}`}
                />
                <CheckLine
                  on={Boolean(row.rechecked) && !dups}
                  text={`календарь перепроверен · диск ${pairCount(row.loadLessonsDisk, row.recheckLessonsDisk, row.lessons)} · Alfa ${pairCount(row.loadLessonsAlfa, row.recheckLessonsAlfa, row.alfa)}`}
                />
                <CheckLine
                  on={Boolean(row.rechecked) && !dups && !short}
                  text={`дубликатов нет · лишних ${pairCount(row.loadDupsN, row.recheckDupsN, row.extraN ?? 0)}`}
                />
                <CheckLine
                  on={Boolean(row.journal) && !short}
                  text={`списания занятий · ${row.cashWriteoff != null ? rubAudit(-Math.abs(Number(row.cashWriteoff) || 0)) : "нет журнала"}`}
                />
                <CheckLine
                  on={Boolean(row.pays)}
                  text={`касса загружена${row.pays ? "" : " · нет А"} · платежей ${row.cashPaysN ?? 0} (${rubAudit(row.cashPaysSum)}) · возвратов ${row.cashRefundN ?? 0} (${rubAudit(row.cashRefundSum)}) · корректировок ${row.cashCorrN ?? 0} (${rubAudit(row.cashCorrSum)}) · товаров ${row.cashGoodsN ?? 0} (${rubAudit(row.cashGoodsSum)})`}
                />
                <CheckLine
                  on={Boolean(row.paysRechecked)}
                  text={`касса перепроверена · строк ${pairCount(row.loadPaysN, row.recheckPaysN, row.cashRows)}`}
                />
              </>
            ) : (
              <>
                <CheckLine on={Boolean(row.journal) && !short} text="календарь загружен" />
                <CheckLine on={Boolean(row.rechecked) && !dups} text="календарь перепроверен" />
                <CheckLine on={row.holeN != null || row.extraN != null} text={nums ? nums.line : "набор id ещё не сверяли"} />
                <CheckLine on={Boolean(row.rechecked) && !dups && !short} text="дубликатов нет" />
                <CheckLine
                  on={Boolean(row.journal) && !short}
                  text={`списания занятий · ${row.cashWriteoff != null ? rubAudit(-Math.abs(Number(row.cashWriteoff) || 0)) : "нет журнала"}`}
                />
              </>
            )}
            <p className="mt-1 text-muted">{row.lessons ? ruLessons(row.lessons) : "занятий на диске нет"}{row.at ? ` · ${ruAt(row.at)}` : ""}</p>
          </div>
        ) : null}
      </li>
    );
  }
  return (
    <div className="mt-3">
      <input
        className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        placeholder="Найти ученика…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.78rem]">
        <span className="text-muted">На странице</span>
        {([10, 20, 30, 100] as const).map((n) => (
          <button key={n} type="button" className={cn("h-8 rounded-full px-3 font-semibold", pageSize === n ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => pickPageSize(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-rose-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-rose-900">Требуют загрузки данных · {nNeed}</h4>
            {kind === "students" && nApproved ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950">Одобрен · {nApproved}</span>
            ) : null}
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">{kind === "balance" ? "Кассы ещё нет — ученик здесь." : "Личный календарь ещё неполный — ученик здесь. Галка «одобрить» — не «Добрать», журнал не закроется."}</p>
          {listNeed.length ? <ul className="mt-2 space-y-2 p-0.5 [overflow-anchor:none]">{listNeed.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Все ученики этого списка уже загружены.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Загрузка данных завершена · {nComplete}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">{kind === "balance" ? "Касса на месте. Перепроверить — сверка с Alfa." : "Календарь на месте. Перепроверить — сверка с Alfa."}</p>
          {listDone.length ? <ul className="mt-2 space-y-2 p-0.5 [overflow-anchor:none]">{listDone.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Пока ни один ученик не загружен до конца.</p>}
        </section>
      </div>
    </div>
  );
}

type AuditUiRow = {
  cid: number;
  branchId: number;
  name: string;
  groups: string[];
  clients?: number;
  alfaMoney?: number;
  cash?: number;
  codes?: string[];
  extra?: string;
  at?: string;
  seen?: boolean;
  alfaRole?: "лид" | "клиент" | "архив";
  status?: string;
  study?: number;
  funnel?: string;
  leadStatus?: number;
  cashPaysN?: number;
  cashRefundN?: number;
  cashCorrN?: number;
  cashGoodsN?: number;
  cashPaysSum?: number;
  cashRefundSum?: number;
  cashCorrSum?: number;
  cashGoodsSum?: number;
  alfaPaysN?: number;
  alfaCorrN?: number;
  alfaGoodsN?: number;
  alfaPaysSum?: number;
  alfaCorrSum?: number;
  alfaGoodsSum?: number;
  alfaSplitOk?: boolean;
  alfaWoSum?: number;
  alfaWoN?: number;
  alfaWoOk?: boolean;
  woSum?: number;
  woN?: number;
  headerStamped?: number;
};

function asAuditRow(
  r: { cid: number; branchId: number; name: string; groups?: string[]; alfaRole?: "лид" | "клиент" | "архив"; status?: string; study?: number; funnel?: string; leadStatus?: number; cashPaysN?: number;
  cashRefundN?: number; cashCorrN?: number; cashGoodsN?: number; cashPaysSum?: number;
  cashRefundSum?: number; cashCorrSum?: number; cashGoodsSum?: number },
  h?: { clients?: number; alfa?: number; cash?: number; codes?: string[]; extra?: string; at?: string; alfaPaysN?: number; alfaCorrN?: number; alfaGoodsN?: number; alfaPaysSum?: number; alfaCorrSum?: number; alfaGoodsSum?: number; alfaSplitOk?: boolean; alfaWoSum?: number; alfaWoN?: number; alfaWoOk?: boolean; woSum?: number; woN?: number; headerStamped?: number },
): AuditUiRow {
  const codes = h?.codes;
  return {
    cid: r.cid,
    branchId: r.branchId,
    name: r.name,
    groups: r.groups || [],
    clients: h?.clients,
    alfaMoney: h?.alfa,
    cash: h?.cash,
    codes,
    extra: h?.extra,
    at: h?.at,
    seen: Boolean(h),
    cashPaysN: r.cashPaysN,
    cashRefundN: r.cashRefundN,
    cashCorrN: r.cashCorrN,
    cashGoodsN: r.cashGoodsN,
    cashPaysSum: r.cashPaysSum,
    cashRefundSum: r.cashRefundSum,
    cashCorrSum: r.cashCorrSum,
    cashGoodsSum: r.cashGoodsSum,
    alfaPaysN: h?.alfaPaysN,
    alfaCorrN: h?.alfaCorrN,
    alfaGoodsN: h?.alfaGoodsN,
    alfaPaysSum: h?.alfaPaysSum,
    alfaCorrSum: h?.alfaCorrSum,
    alfaGoodsSum: h?.alfaGoodsSum,
    alfaSplitOk: h?.alfaSplitOk,
    alfaWoSum: h?.alfaWoSum,
    alfaWoN: h?.alfaWoN,
    alfaWoOk: h?.alfaWoOk,
    woSum: h?.woSum,
    woN: h?.woN,
    headerStamped: h?.headerStamped,
    alfaRole: (codes || []).includes("лид") ? "лид" : (codes || []).includes("архив") ? "архив" : r.alfaRole,
    status: r.status,
    study: r.study,
    funnel: r.funnel,
    leadStatus: r.leadStatus,
  };
}

function alfaRoleLabel(role?: string) {
  if (role === "лид") return "лид в Альфе";
  if (role === "архив") return "архив в Альфе";
  if (role === "клиент") return "клиент в Альфе";
  return "";
}

function AuditFillList({
  rows,
  busy,
  loadingCid,
  onRecheck,
}: {
  rows: AuditUiRow[];
  busy?: boolean;
  loadingCid?: number;
  onRecheck: (row: AuditUiRow) => void;
}) {
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");
  const [role, setRole] = useState<"all" | "клиент" | "лид" | "архив">("all");
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const named = rows.filter((r) => {
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || String(r.cid).includes(q) || (r.groups || []).some((g) => g.toLowerCase().includes(q));
  });
  const hasClients = rows.some((r) => auditRole(r) === "клиент");
  const inWork = (r: AuditUiRow) => {
    const who = auditRole(r);
    if (role === "all" && who === "архив" && hasClients) return false;
    return role === "all" || who === role;
  };
  const reasonN = (id: string) => named.filter((r) => inWork(r) && auditReasonHit(r, id)).length;
  const roleN = (id: typeof role) => named.filter((r) => id === "all" || auditRole(r) === id).length;
  const scoped = named.filter((r) => inWork(r) && auditReasonHit(r, reason));
  const isPinned = (r: AuditUiRow) => String(r.cid) === open || r.cid === loadingCid;
  const doneOf = (r: AuditUiRow) => (role === "архив" ? true : rowMatched(r));
  const failOf = (r: AuditUiRow) => Boolean(r.seen && auditFail(r.codes));
  const byName = (a: AuditUiRow, b: AuditUiRow) => a.name.localeCompare(b.name, "ru") || a.cid - b.cid;
  const bySeg = (a: AuditUiRow, b: AuditUiRow) => {
    const ia = AUDIT_SEG_ORDER.indexOf(auditSeg(a).id);
    const ib = AUDIT_SEG_ORDER.indexOf(auditSeg(b).id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || byName(a, b);
  };
  const roleRank = (r: AuditUiRow) => ["лид", "архив", "клиент"].indexOf(auditRole(r));
  const byLeft = (a: AuditUiRow, b: AuditUiRow) => {
    if (role === "all") {
      const d = roleRank(a) - roleRank(b);
      if (d) return d;
    }
    return bySeg(a, b);
  };
  const needRows = orderActiveQueue(
    scoped.filter((r) => !doneOf(r)),
    (r) => r.cid === loadingCid,
    () => true,
    byLeft,
  );
  const doneRows = orderActiveQueue(
    scoped.filter((r) => doneOf(r)),
    (r) => r.cid === loadingCid,
    () => false,
    byName,
  );
  const nNeed = needRows.length;
  const nDone = doneRows.length;
  const pagesNeed = Math.max(1, Math.ceil(nNeed / pageSize) || 1);
  const pagesDone = Math.max(1, Math.ceil(nDone / pageSize) || 1);
  const safeNeed = Math.min(pageNeed, pagesNeed - 1);
  const safeDone = Math.min(pageDone, pagesDone - 1);
  const listNeed = pageWithPinned(needRows, safeNeed, pageSize, isPinned);
  const listDone = pageWithPinned(doneRows, safeDone, pageSize, isPinned);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [q, pageSize, reason, role]);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [loadingCid]);
  function pickPageSize(n: number) {
    setPageSize(n);
    setPageNeed(0);
    setPageDone(0);
  }
  function pager(page: number, pages: number, onPage: (n: number) => void) {
    if (pages <= 1) return null;
    return (
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Назад
        </button>
        {Array.from({ length: pages }, (_, i) => i).map((i) => (
          <button key={i} type="button" className={cn("h-8 min-w-8 rounded-full px-2 font-semibold", i === page ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onPage(i)}>
            {i + 1}
          </button>
        ))}
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Дальше
        </button>
      </span>
    );
  }
  function renderPerson(row: AuditUiRow) {
    const id = String(row.cid);
    const full = doneOf(row);
    const fail = failOf(row);
    const active = loadingCid === row.cid;
    const shown = open === id;
    const seg = auditSeg(row);
    const primary = seg.label;
    const who = auditRole(row);
    const roleWord = alfaRoleLabel(who);
    const rest = auditCodeWords(row.codes).filter((w) => w !== primary && w !== "Лид в Альфе" && w !== "Архив в Альфе");
    const codes = row.codes || [];
    const miss =
      codes.includes("нет id") ? "id не найден"
      : codes.includes("нет balance") ? "нет balance"
      : codes.includes("нет ответа") ? "Alfa не ответила"
      : "";
    const money = !row.seen
      ? "ещё не сверяли"
      : who === "лид" && !full
        ? miss || "лента пустая, считаем нули"
        : miss
          ? `Клиенты ${rubAudit(row.clients)} · касса ${rubAudit(row.cash)} · ${miss}`
          : `Клиенты ${rubAudit(row.clients)} · Alfa ${rubAudit(row.alfaMoney)} · касса ${rubAudit(row.cash)}`;
    const recOnCard = role === "all";
    return (
      <li
        key={id}
        className={cn(
          "rounded-2xl bg-white px-4 py-3 ring-1",
          !row.seen ? "ring-black/8" : full ? "ring-emerald-200" : fail ? "ring-rose-200" : "ring-amber-200",
        )}
      >
        <div className="flex items-center gap-3">
          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium leading-tight" onClick={() => setOpen((cur) => (cur === id ? "" : id))} title={row.name}>
            {row.name}
          </button>
          <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold", full ? "bg-emerald-100 text-emerald-900" : fail || !row.seen ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-950")}>
            {primary}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-semibold leading-none text-muted ring-1 ring-black/10 hover:bg-black/5"
            aria-expanded={shown}
            aria-label={shown ? "свернуть" : "развернуть"}
            onClick={() => setOpen((cur) => (cur === id ? "" : id))}
          >
            {shown ? "−" : "+"}
          </button>
        </div>
        <p className="mt-1 truncate text-[0.72rem] leading-snug text-muted">
          №{row.cid}
          {roleWord ? ` · ${roleWord}` : ""}
          {` · ${money}`}
        </p>
        {full || !recOnCard ? null : <p className="mt-1 text-[0.78rem] leading-snug">{seg.rec}</p>}
        {shown ? (
          <div className="mt-3 border-t border-black/5 pt-3">
            {recOnCard ? null : <p className="text-[0.78rem] leading-snug font-medium">{seg.rec}</p>}
            {rest.length ? <p className="text-[0.72rem] leading-snug text-muted">{rest.join(" · ")}</p> : null}
            <p className="text-[0.72rem] text-muted">{(row.groups || []).slice(0, 3).join(" · ") || "групп на карточке нет"}</p>
            <table className="mt-2 w-full text-left text-[0.72rem] leading-snug">
              <thead>
                <tr className="text-muted">
                  <th className="py-0.5 font-medium">Откуда</th>
                  <th className="py-0.5 font-medium">Касса (строки шага 4)</th>
                  <th className="py-0.5 font-medium">Alfa</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>платежи</td>
                  <td>{row.cashPaysN ?? 0} ({rubAudit(row.cashPaysSum)})</td>
                  <td>{row.alfaSplitOk ? `${row.alfaPaysN ?? 0} (${rubAudit(row.alfaPaysSum)})` : "ещё не снимали"}</td>
                </tr>
                <tr>
                  <td>списания занятий</td>
                  <td>{row.seen ? `${row.woN ?? "—"} (${row.woSum != null && Number.isFinite(row.woSum) ? rubAudit(-Math.abs(Number(row.woSum))) : "не собрали"})` : "ещё не снимали"}</td>
                  <td>{row.alfaWoOk ? `${row.alfaWoN ?? 0} (${row.alfaWoSum != null && Number.isFinite(row.alfaWoSum) ? rubAudit(-Math.abs(Number(row.alfaWoSum))) : "не собрали"})` : "ещё не снимали"}</td>
                </tr>
                <tr>
                  <td>корректировки</td>
                  <td>{row.cashCorrN ?? 0} ({rubAudit(row.cashCorrSum)})</td>
                  <td>{row.alfaSplitOk ? `${row.alfaCorrN ?? 0} (${rubAudit(row.alfaCorrSum)})` : "ещё не снимали"}</td>
                </tr>
                <tr>
                  <td>товары</td>
                  <td>{row.cashGoodsN ?? 0} ({rubAudit(row.cashGoodsSum ? -Math.abs(Number(row.cashGoodsSum)) : 0)})</td>
                  <td>{row.alfaSplitOk ? `${row.alfaGoodsN ?? 0} (${rubAudit(row.alfaGoodsSum ? -Math.abs(Number(row.alfaGoodsSum)) : 0)})` : "ещё не снимали"}</td>
                </tr>
                <tr>
                  <td>Клиенты / формула</td>
                  <td>{rubAudit(row.clients)}</td>
                  <td className="whitespace-normal">{alfaFormulaCalc(row)}</td>
                </tr>
                <tr>
                  <td>шапка / итог</td>
                  <td>{Number.isFinite(row.headerStamped as number) ? rubAudit(row.headerStamped) : "ещё не снимали"}</td>
                  <td>{row.seen ? (fail ? "нет ответа" : miss ? miss : Number.isFinite(row.alfaMoney as number) ? rubAudit(row.alfaMoney) : "ещё не снимали") : "ещё не снимали"}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[0.72rem] text-muted">
              Касса — диск шага 4. Alfa — живой pay/index и lesson/index при «Перепроверить», без записи на диск. Товар в ленте, в шапку Alfa не входит. Шапка — Customer.balance.
              {row.extra ? ` ${row.extra}.` : ""}
            </p>
            <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2">
              {withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && "ra-progress-run")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRecheck(row);
                  }}
                >
                  Перепроверить
                </button>,
                HINT.auditRecheck,
              )}
            </div>
          </div>
        ) : null}
      </li>
    );
  }
  return (
    <div className="mt-3 [overflow-anchor:none]">
      <input
        className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        placeholder="Найти ученика…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {AUDIT_ROLES.map((c) => {
          const n = roleN(c.id);
          const on = role === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", on ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
              onClick={() => setRole(c.id)}
            >
              {c.label} · {n}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {AUDIT_REASON_CHIPS.filter((c) => c.id === "all" || reasonN(c.id) > 0).map((c) => {
          const n = reasonN(c.id);
          const on = reason === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", on ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
              onClick={() => setReason(c.id)}
            >
              {c.label} · {n}
            </button>
          );
        })}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.78rem]">
          <span className="text-muted">На странице</span>
          {([10, 20, 30, 100] as const).map((n) => (
            <button key={n} type="button" className={cn("h-8 rounded-full px-3 font-semibold", pageSize === n ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => pickPageSize(n)}>
              {n}
            </button>
          ))}
        </span>
      </div>
      <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-2">
        <section className="flex h-[32rem] flex-col rounded-2xl bg-white/70 p-3 ring-1 ring-rose-200">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-rose-900">Не совпало · {nNeed}</h4>
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 shrink-0 text-[0.72rem] text-muted">Сегмент и что сделать — на карточке. Справа только когда Клиенты = шапка = касса.</p>
          {listNeed.length ? (
            <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5 [overflow-anchor:none]">
              {listNeed.map((row, i) => {
                const prev = i > 0 ? listNeed[i - 1] : null;
                const byRole = role === "all";
                const g = byRole ? AUDIT_ROLE_HEAD[auditRole(row)] : auditSeg(row);
                const gid = byRole ? auditRole(row) : auditSeg(row).id;
                const prevId = prev ? (byRole ? auditRole(prev) : auditSeg(prev).id) : "";
                const n = needRows.filter((x) => (byRole ? auditRole(x) : auditSeg(x).id) === gid).length;
                return (
                  <Fragment key={row.cid}>
                    {gid !== prevId ? (
                      <li className="list-none space-y-0.5 pt-2">
                        <p className="text-[0.78rem] font-semibold text-rose-900">
                          {g.label} · {n}
                        </p>
                        <p className="text-[0.72rem] leading-snug text-muted">{g.rec}</p>
                      </li>
                    ) : null}
                    {renderPerson(row)}
                  </Fragment>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {role !== "all"
                ? `В роли «${AUDIT_ROLE_HEAD[role].label}» в «Не совпало» никого.`
                : reason === "ok"
                  ? "В этом фильтре слева никого."
                  : reason === "all"
                    ? "Не совпало пусто — все сверенные совпали."
                    : "В этом сегменте никого нет."}
            </p>
          )}
        </section>
        <section className="flex h-[32rem] flex-col rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">{role === "архив" ? "Архив" : "Совпало"} · {nDone}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 shrink-0 text-[0.72rem] text-muted">{role === "архив" ? "В Альфе архив. Шапку не сверяем." : "Клиенты = шапка Alfa = касса ±1 ₽. Трогать не нужно."}</p>
          {listDone.length ? (
            <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5 [overflow-anchor:none]">{listDone.map(renderPerson)}</ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {role !== "all"
                ? `В роли «${AUDIT_ROLE_HEAD[role].label}» совпавших нет.`
                : reason !== "all" && reason !== "ok"
                  ? "В этом фильтре совпавших нет."
                  : "Пока никого не сверяли — справа пусто."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function MissList({
  pack,
  empty,
  onGroup,
}: {
  pack?: MissPack;
  empty: string;
  onGroup?: (row: MissPack["items"][number]) => void;
}) {
  if (!pack || !pack.total) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <div className="mt-2">
      <ul className="max-h-48 space-y-0.5 overflow-auto text-sm">
        {pack.items.map((row) => {
          const gid = Number(row.groupId) || 0;
          return (
            <li key={`${gid || row.id}:${row.branchId || 0}:${row.name}`}>
              {gid && onGroup ? (
                <button type="button" className="w-full rounded-lg px-2 py-1 text-left hover:bg-black/5" onClick={() => onGroup(row)}>
                  <span className="font-medium">{row.name}</span>
                  {row.school ? <span className="ml-1.5 text-[0.72rem] text-muted">{row.school}</span> : null}
                  {row.extra ? <span className="ml-1.5 text-[0.72rem] text-rose-800">{row.extra}</span> : null}
                </button>
              ) : (
                <span className="block px-2 py-1">
                  <span className="font-medium">{row.name}</span>
                  {row.extra ? <span className="ml-1.5 text-[0.72rem] text-rose-800">{row.extra}</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pack.more ? <p className="mt-1 px-2 text-[0.72rem] text-muted">и ещё {pack.more} — после загрузки список станет короче</p> : null}
    </div>
  );
}

function StudentPackView({
  rows,
  cur,
  n,
  total,
  running,
  busy,
  onRecheck,
}: {
  rows: StudentHit[];
  cur?: string;
  n?: number;
  total?: number;
  running?: boolean;
  busy?: boolean;
  onRecheck: (row: StudentHit) => void;
}) {
  const ok = rows.filter((r) => r.ok);
  const miss = rows.filter((r) => !r.ok);
  return (
    <div className="mt-3">
      <p className="h-6 truncate text-sm font-semibold">
        {running ? `Сейчас ${n}/${total} · ${cur || "…"}` : rows.length ? `Пакет · ${ok.length} записаны · ${miss.length} не попали в выдачу` : "\u00a0"}
      </p>
      <div className="mt-2 grid min-h-[9rem] gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white/80 p-2 ring-1 ring-emerald-200">
          <p className="text-[0.78rem] font-semibold text-emerald-900">В этом пакете загружены · {ok.length}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {ok.length ? (
              ok.map((r) => (
                <li key={r.cid} className="truncate">
                  <span className="font-medium">{r.name}</span>
                  {r.groups?.[0] ? <span className="ml-1 text-[0.72rem] text-muted">{r.groups[0]}</span> : null}
                  <span className="ml-1 text-[0.72rem] text-muted">{r.lessons} зан.</span>
                </li>
              ))
            ) : (
              <li className="text-muted">пока никого</li>
            )}
          </ul>
        </div>
        <div className="rounded-xl bg-white/80 p-2 ring-1 ring-rose-200">
          <p className="text-[0.78rem] font-semibold text-rose-900">Не попали в выдачу · {miss.length}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {miss.length ? (
              miss.map((r, i) => (
                <li key={r.cid || i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.name}</span>
                    {r.groups?.[0] ? <span className="ml-1 text-[0.72rem] text-muted">{r.groups[0]}</span> : null}
                    <span className="ml-1 text-[0.72rem] text-rose-800">{r.done ? "Alfa пусто" : "обрыв"}</span>
                  </span>
                  {r.cid ? (
                    <button type="button" className={BTN_GHOST_SM} disabled={busy} onClick={() => onRecheck(r)}>
                      Перепроверить
                    </button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-muted">все из пакета записались</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ done, total, run, loading }: { done: number; total: number; run?: boolean; loading?: boolean }) {
  const left = Math.max(0, total - done);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="mt-2">
      <p className="font-display text-xl tabular-nums leading-none">
        {total <= 0 ? (
          <span className="font-semibold text-muted">{loading ? "загружаю список…" : "нет на диске"}</span>
        ) : (
          <>
            <span className="font-semibold text-primary">{done} загрузка завершена</span>
            <span className="mx-2 text-muted">·</span>
            <span className={left ? "font-semibold text-rose-800" : "text-muted"}>{left ? `${left} требуют загрузки` : "всё есть"}</span>
          </>
        )}
      </p>
      <FillBar pct={pct} run={run} done={!left && total > 0} />
    </div>
  );
}

export function AdminCrmSettings() {
  const [stages, setStages] = useState<LeadStage[]>(LEAD_STAGES);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("#1a7bb9");
  const [syncMin, setSyncMin] = useState(10);
  const [auto, setAuto] = useState<FunnelAuto>(FUNNEL_AUTO_DEFAULT);
  const [cache, setCache] = useState<CachePolicy | null>(null);
  const [actors, setActors] = useState<CrmActorsState | null>(null);
  const [humanName, setHumanName] = useState("Администратор");
  const [alfaMode, setAlfaMode] = useState<AlfaLinkMode>("linked");
  const [pull, setPull] = useState(ALFA_SYNC_DEFAULT.pull);
  const [push, setPush] = useState(ALFA_SYNC_DEFAULT.push);
  const [pipe, setPipe] = useState(ALFA_SYNC_DEFAULT.pipe);
  const [payDays, setPayDays] = useState(ALFA_SYNC_DEFAULT.payDays);
  const [queue, setQueue] = useState<{
    pending?: number;
    lastNote?: string;
    overlayNext?: number;
    overlayTotal?: number;
    busy?: boolean;
    exportPending?: number;
    exportBusy?: boolean;
    exportNote?: string;
    jobs?: { op: string; entityId: number; actor?: string; tries?: number }[];
  } | null>(null);
  const [journal, setJournal] = useState<{
    note?: string;
    at?: string;
    extra?: string;
    error?: string;
    more?: boolean;
    groups?: { groupId: number; branchId: number; name: string; school: string; taken?: number; archived?: boolean }[];
    schools?: { name: string; groups: number }[];
    journalNext?: number;
    journalTotal?: number;
    lessonsNext?: number;
    lessonsTotal?: number;
    students?: { all: number; live: number; archive: number };
    linked?: boolean;
    progress?: {
      groups?: { total: number; done: number; periods?: number; miss?: MissPack; doneList?: MissPack; rows?: FillRow[] };
      live?: { total: number; journalDone: number; cardDone: number; missJournal?: MissPack; missCard?: MissPack; people?: PeopleRow[] };
      archive?: { total: number; journalDone: number; cardDone: number; missJournal?: MissPack; missCard?: MissPack; people?: PeopleRow[] };
      ungrouped?: { total?: number; items?: { cid?: number; branchId?: number; name?: string }[]; more?: number };
    };
    lastLife?: {
      at?: string;
      school?: string;
      total: number;
      young: number;
      mid: number;
      old: number;
      unknown: number;
      youngNames?: string[];
      midNames?: string[];
      oldNames?: string[];
      unknownNames?: string[];
      probed?: number;
      left?: number;
    } | null;
    lastArchives?: { at?: string; added: number; total: number; branch: string; more: boolean; names?: string[] } | null;
    lastArchivesPupils?: {
      at?: string;
      study?: string;
      clients: number;
      uniqueIds: number;
      live: number;
      need: number;
      already: number;
      added: number;
      left: number;
      more: boolean;
      names?: string[];
      missing?: number[];
    } | null;
    lastStudents?: { at?: string; study?: string; who?: string; n?: number; total?: number; rows?: StudentHit[] } | null;
    lastArchivePolicy?: {
      at?: string;
      disk: number;
      clients?: number;
      leadsSkip?: number;
      fioOk: number;
      noDob: number;
      adult: number;
      hadGroups?: number;
      working: number;
      hidden: number;
      kept?: number;
    } | null;
    lastArchiveCatalog?: {
      at?: string;
      more?: boolean;
      branch?: string;
      page?: number;
      step?: string;
      wrote?: boolean;
      cid?: number;
      name?: string;
      sessionWrote?: number;
      sessionSkip?: number;
      disk?: number;
    } | null;
    lastAudit?: {
      at?: string;
      idx?: number;
      scanned: number;
      ok: number;
      hole: number;
      show: number;
      fail: number;
      rows: {
        cid: number;
        branchId: number;
        name: string;
        clients: number;
        alfa: number;
        cash: number;
        codes: string[];
        repaired?: boolean;
        at?: string;
        extra?: string;
      }[];
    } | null;
    rosterPolicy?: { leads?: boolean; archiveInLive?: boolean; attendDays?: number };
    planLog?: { at?: string; kind?: string; text?: string; who?: string; cid?: number; mode?: string; reason?: string; src?: string }[];
    historyWorker?: { at?: string; silent?: boolean };
    job?: {
      running?: boolean;
      stop?: boolean;
      mode?: string;
      kind?: string;
      cur?: string;
      n?: number;
      total?: number;
      msg?: string;
      fill?: { groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string; customerId?: number } | null;
    };
  } | null>(null);
  const [journalLoading, setJournalLoading] = useState(true);
  const [journalSchool, setJournalSchool] = useState("");
  const [journalGrain, setJournalGrain] = useState<Grain>("quarter");
  const [peopleFromId, setPeopleFromId] = useState<(typeof PEOPLE_FROM_OPTS)[number]["id"]>("2015");
  const [peopleRecheckDays, setPeopleRecheckDays] = useState<RecheckDays>(32);
  const [groupsRecheckDays, setGroupsRecheckDays] = useState<RecheckDays>(32);
  const [moneyRecheckDays, setMoneyRecheckDays] = useState<RecheckDays>(32);
  const [moneyFromId, setMoneyFromId] = useState<(typeof PEOPLE_FROM_OPTS)[number]["id"]>("2015");
  const [archAgeFrom, setArchAgeFrom] = useState("");
  const [archAgeTo, setArchAgeTo] = useState("");
  const [archNoDob, setArchNoDob] = useState(false);
  const [archNeedFio, setArchNeedFio] = useState(false);
  const [archNeedGroups, setArchNeedGroups] = useState(false);
  const [archAttendYears, setArchAttendYears] = useState<0 | 1 | 2>(1);
  const [crmTab, setCrmTab] = useState<CrmSetTab>("history");
  const [syncPolicy, setSyncPolicy] = useState<CrmSyncPolicy>(POLICY_FACTORY);
  const [histTab, setHistTab] = useState<HistTab>("roster");
  const [loadGuide, setLoadGuide] = useState<HistTab | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const crmTabsRef = useRef<HTMLDivElement>(null);
  const histTabsRef = useRef<HTMLDivElement>(null);
  const tabLockY = useRef<number | null>(null);
  const tabLockKind = useRef<"crm" | "hist" | null>(null);
  const [openMiss, setOpenMiss] = useState<"g" | "j1" | "j2" | "c1" | "c2" | "">("");
  const [fillLoading, setFillLoading] = useState<{ groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string; customerId?: number } | null>(null);
  const holdFill = useRef(false);
  const startedJobId = useRef("");
  const stopSchool = useRef(false);
  const peopleLock = useRef(false);
  const [schoolRun, setSchoolRun] = useState<{ cur: string; n: number; total: number; waits?: number } | null>(null);
  const [groupArchived, setGroupArchived] = useState(false);
  const [peopleStudy, setPeopleStudy] = useState<"1" | "2">("1");
  const [rosterLeads, setRosterLeads] = useState(false);
  const [rosterArchLive, setRosterArchLive] = useState(true);
  const [rosterDays, setRosterDays] = useState(0);
  const [studentRun, setStudentRun] = useState<{
    kind: "students" | "balance";
    study: "1" | "2";
    n: number;
    total: number;
    cur: string;
    rows: StudentHit[];
  } | null>(null);
  const dragId = useRef(0);
  useEffect(() => {
    try {
      const s = localStorage.getItem("crm-journal-school") || "";
      const g = localStorage.getItem("crm-journal-grain") || "";
      const t = localStorage.getItem("crm-settings-tab") || "";
      const h = localStorage.getItem("crm-history-tab") || "";
      if (s) setJournalSchool(s);
      if (g === "quarter" || g === "half" || g === "year") setJournalGrain(g);
      const tab = t === "historyAuto" ? "history" : t;
      if (CRM_SET_TABS.some((x) => x.id === tab)) setCrmTab(tab as CrmSetTab);
      if (h === "roster" || h === "groups" || h === "students" || h === "money" || h === "audit") setHistTab(h);
    } catch {
      /* */
    }
  }, []);

  function pickCrmTab(v: CrmSetTab) {
    tabLockY.current = crmTabsRef.current?.getBoundingClientRect().top ?? null;
    tabLockKind.current = "crm";
    setCrmTab(v);
    try {
      localStorage.setItem("crm-settings-tab", v);
    } catch {
      /* */
    }
  }

  function pickHistTab(v: HistTab) {
    tabLockY.current = histTabsRef.current?.getBoundingClientRect().top ?? crmTabsRef.current?.getBoundingClientRect().top ?? null;
    tabLockKind.current = "hist";
    setHistTab(v);
    try {
      localStorage.setItem("crm-history-tab", v);
    } catch {
      /* */
    }
  }

  useLayoutEffect(() => {
    const y = tabLockY.current;
    const kind = tabLockKind.current;
    tabLockY.current = null;
    tabLockKind.current = null;
    if (y == null) return;
    lockTabY(kind === "hist" ? histTabsRef.current || crmTabsRef.current : crmTabsRef.current, y);
  }, [crmTab, histTab]);

  function pickJournalSchool(v: string) {
    setJournalSchool(v);
    try {
      localStorage.setItem("crm-journal-school", v);
    } catch {
      /* */
    }
  }

  function pickJournalGrain(v: Grain) {
    setJournalGrain(v);
    try {
      localStorage.setItem("crm-journal-grain", v);
    } catch {
      /* */
    }
  }

  function applyLink(link: {
    mode?: AlfaLinkMode;
    pull?: typeof pull;
    push?: typeof push;
    pipe?: typeof pipe;
    minutes?: number;
    payDays?: number;
  }) {
    setAlfaMode(link.mode === "offline" ? "offline" : "linked");
    if (link.pull) setPull({ ...ALFA_SYNC_DEFAULT.pull, ...link.pull });
    if (link.push) setPush({ ...ALFA_SYNC_DEFAULT.push, ...link.push });
    if (link.pipe) setPipe({ ...ALFA_SYNC_DEFAULT.pipe, ...link.pipe });
    if (link.minutes) {
      setSyncMin(link.minutes);
      try {
        localStorage.setItem(CRM_SYNC_MIN_KEY, String(link.minutes));
      } catch {
        /* */
      }
    }
    if (link.payDays) setPayDays(link.payDays);
  }

  useEffect(() => {
    setSyncMin(crmSyncMinutes());
    void loadStages();
    void loadAuto();
    void loadCache();
    void loadActors();
    void loadJournal();
    void loadSyncPolicy();
  }, []);

  useEffect(() => {
    if (crmTab !== "history") return;
    let on = true;
    let wasRun = Boolean(journal?.job?.running) && !journal?.job?.stop;
    let beats = 0;
    const tick = async () => {
      if (!on) return;
      try {
        const res = (await adminSchedule({
          data: { token: token(), action: "journalPull", kind: "jobStatus" } as never,
        })) as typeof journal & { groupRow?: FillRow | null };
        if (!on || !res) return;
        const incoming = res.job as ServerJob | undefined;
        setJournal((cur) => {
          const next = applyJobStatus(cur, res as NonNullable<typeof journal> & { groupRow?: FillRow | null });
          if (stopSchool.current && incoming?.running && !incoming.stop) {
            return { ...next, job: { ...(next.job as ServerJob | undefined), running: false, stop: true, cur: "", fill: null, msg: incoming.msg || "Останавливаем…" } };
          }
          return next;
        });
        paintJob(incoming, "poll");
        const live = Boolean(res.job?.running) && !res.job?.stop;
        if (wasRun && !live) void loadJournal();
        wasRun = live;
        beats += 1;
        if (beats % 4 === 0) void loadSyncPolicy();
      } catch {
        /* фон на сервере, экран догонит следующим тактом */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 1200);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [crmTab]);

  async function loadAuto() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "funnelAutoGet" } as never,
      })) as { ok?: boolean; rules?: FunnelAuto };
      if (res.ok && res.rules) setAuto(res.rules);
    } catch {
      /* defaults */
    }
  }

  async function saveAuto(next: FunnelAuto) {
    setAuto(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "funnelAutoSave", funnelAuto: next } as never,
    })) as { ok?: boolean; rules?: FunnelAuto; error?: string };
    if (res.ok && res.rules) {
      setAuto(res.rules);
      setMsg("Автоматизация записана.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить автоматизацию.");
  }

  async function loadCache() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "cachePolicyGet" } as never,
      })) as { ok?: boolean; policy?: CachePolicy; queue?: typeof queue; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number } };
      if (res.ok && res.policy) setCache(res.policy);
      if (res.ok && res.queue) setQueue(res.queue);
      if (res.ok && res.alfaLink) applyLink(res.alfaLink);
    } catch {
      /* defaults */
    }
  }

  async function saveCache(next: CachePolicy) {
    setCache(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "cachePolicySave", cachePolicy: next } as never,
    })) as { ok?: boolean; policy?: CachePolicy; error?: string };
    if (res.ok && res.policy) {
      setCache(res.policy);
      setMsg("Кэш сайта записан.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить кэш.");
  }

  async function loadSyncPolicy() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "syncPolicyGet" } as never,
      })) as { ok?: boolean; policy?: CrmSyncPolicy };
      if (res.ok && res.policy) setSyncPolicy(res.policy);
    } catch {
      /* завод */
    }
  }

  async function saveSyncPolicy(next: CrmSyncPolicy) {
    setSyncPolicy(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "syncPolicySave", policy: next } as never,
    })) as { ok?: boolean; policy?: CrmSyncPolicy; error?: string };
    if (res.ok && res.policy) {
      setSyncPolicy(res.policy);
      setMsg(next.planEnabled ? "Пульт записан. Синхронизация расписания включена." : "Пульт записан. Синхронизация расписания выкл.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить пульт.");
    await loadSyncPolicy();
  }

  async function loadActors() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "actorsGet" } as never,
      })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"] };
      if (res.ok) {
        setActors({
          humanName: res.humanName || "Администратор",
          actors: res.actors?.length ? res.actors : CRM_ACTORS,
        });
        setHumanName(res.humanName || "Администратор");
      }
    } catch {
      setActors({ humanName: "Администратор", actors: CRM_ACTORS });
    }
  }

  async function saveActorsName() {
    const res = (await adminSchedule({
      data: { token: token(), action: "actorsSave", humanName } as never,
    })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"]; error?: string };
    if (res.ok) {
      setActors({ humanName: res.humanName || humanName, actors: res.actors?.length ? res.actors : CRM_ACTORS });
      setMsg("Роли записаны.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить роли.");
  }

  async function saveAlfaMode(mode: AlfaLinkMode) {
    setAlfaMode(mode);
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "alfaLinkSave", alfaLink: { mode, pull, push, pipe, minutes: syncMin, payDays } } as never,
      })) as { ok?: boolean; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }; error?: string };
      if (!res.ok) {
        setMsg(res.error || "Не удалось сменить связь с Alfa.");
        return;
      }
      if (res.alfaLink) applyLink(res.alfaLink);
      setMsg(mode === "offline" ? "Без AlfaCRM: очередь копит, в CRM не уходит. Ольга пишет на диск." : "Фон с AlfaCRM: очередь выгружает по включённым каналам. Запуск пакетов — вкладка «Очередь».");
      await loadCache();
    } finally {
      setBusy(false);
    }
  }

  async function saveSync(next: { pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }) {
    if (next.pull) setPull(next.pull);
    if (next.push) setPush(next.push);
    if (next.pipe) setPipe(next.pipe);
    if (next.minutes) setSyncMin(next.minutes);
    if (next.payDays) setPayDays(next.payDays);
    const res = (await adminSchedule({
      data: {
        token: token(),
        action: "alfaLinkSave",
        alfaLink: {
          mode: alfaMode,
          pull: next.pull || pull,
          push: next.push || push,
          pipe: next.pipe || pipe,
          minutes: next.minutes || syncMin,
          payDays: next.payDays || payDays,
        },
      } as never,
    })) as { ok?: boolean; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }; error?: string };
    if (!res.ok) {
      setMsg(res.error || "Не удалось сохранить каналы Alfa.");
      return;
    }
    if (res.alfaLink) applyLink(res.alfaLink);
    setMsg("Каналы фона с Alfa записаны. Ольга по-прежнему пишет на диск.");
  }

  async function tickQueue(force: boolean) {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "crmQueueTick", force } as never,
      })) as { ok?: boolean; extra?: string; queue?: typeof queue; error?: string; live?: number };
      if (res.queue) setQueue(res.queue);
      setMsg(res.error || res.extra || (res.ok ? `Пакет прошёл${res.live != null ? `, живых ${res.live}` : ""}` : "Очередь не ответила."));
      await loadCache();
    } finally {
      setBusy(false);
    }
  }

  function applyRosterPolicy(pol?: { leads?: boolean; archiveInLive?: boolean; attendDays?: number }) {
    if (!pol) return;
    setRosterLeads(Boolean(pol.leads));
    setRosterArchLive(pol.archiveInLive !== false);
    const days = Number(pol.attendDays) || 0;
    setRosterDays(days === 15 || days === 30 || days === 150 ? days : 0);
  }

  async function loadJournal() {
    setJournalLoading(true);
    try {
      const res = (await Promise.race([
        adminSchedule({
          data: { token: token(), action: "journalPull" } as never,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Список не пришёл за 20 с — нажмите ещё раз.")), 20000)),
      ])) as typeof journal;
      if (res) {
        applyRosterPolicy(res.rosterPolicy);
        setJournal((cur) => {
          if (!cur) return res;
          const jobLive = Boolean(res.job?.running || cur.job?.running || holdFill.current);
          return {
            ...cur,
            ...res,
            progress: {
              ...cur.progress,
              ...res.progress,
              live: jobLive || !(res.progress?.live?.people || []).length
                ? mergePeopleSide(cur.progress?.live, res.progress?.live)
                : res.progress?.live,
              archive: jobLive || !(res.progress?.archive?.people || []).length
                ? mergePeopleSide(cur.progress?.archive, res.progress?.archive)
                : res.progress?.archive,
              groups: res.progress?.groups || cur.progress?.groups,
            },
            job: holdFill.current && cur.job?.running && !res.job?.running ? cur.job : res.job || cur.job,
          };
        });
        paintJob(res.job, "load");
        return res;
      }
      setMsg("Список учеников не пришёл.");
      return null;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Список учеников не пришёл. Обновите вкладку.");
      return null;
    } finally {
      setJournalLoading(false);
    }
  }

  async function runJournal(opts: {
    kind: "group" | "school" | "students" | "balance" | "life" | "details" | "archives" | "archivesPupils" | "archiveCount" | "archiveCatalog" | "archiveAdd" | "audit" | "jobStart" | "jobStop" | "jobStatus" | "roster" | "rosterPolicy";
    study?: "1" | "2" | "all";
    school?: string;
    groupId?: number;
    branchId?: number;
    periodKey?: string;
    periodLabel?: string;
    grain?: Grain;
    recheck?: boolean;
    customerId?: number;
    probe?: boolean;
    dateFrom?: string;
    recheckDays?: number;
    jobMode?: string;
    take?: number;
    name?: string;
    peopleKind?: "students" | "balance";
    jobItems?: { cid?: number; branchId?: number; name?: string; groupId?: number; periodKey?: string; periodLabel?: string }[];
    archived?: boolean;
  }) {
    setBusy(true);
    if (opts.kind === "group" || opts.kind === "details") {
      setFillLoading({ groupId: opts.groupId || 0, branchId: opts.branchId || 0, periodKey: opts.periodKey || "", label: opts.periodLabel || "", kind: opts.kind });
    } else if (opts.kind === "life" || opts.kind === "archives" || opts.kind === "archivesPupils" || opts.kind === "archiveCount" || opts.kind === "archiveCatalog" || opts.kind === "archiveAdd") {
      setFillLoading({ kind: opts.kind });
    } else if ((opts.kind === "students" || opts.kind === "balance" || opts.kind === "audit") && !holdFill.current) {
      setFillLoading({ kind: opts.kind, label: opts.study === "2" ? "архивные" : "текущие" });
    }
    try {
      const res = (await Promise.race([
        adminSchedule({
          data: {
            token: token(),
            action: "journalPull",
            kind: opts.kind,
            school: opts.school || "",
            groupId: opts.groupId || 0,
            branchId: opts.branchId || 0,
            study: opts.study || "all",
            periodKey: opts.periodKey || "",
            grain: opts.grain || journalGrain,
            recheck: Boolean(opts.recheck),
            customerId: opts.customerId || 0,
            probe: Boolean(opts.probe),
            dateFrom: opts.dateFrom || "",
            recheckDays: opts.recheckDays || 0,
            jobMode: opts.jobMode || "",
            take: opts.take || 0,
            name: opts.name || "",
            peopleKind: opts.peopleKind || (opts.kind === "balance" ? "balance" : "students"),
            periodLabel: opts.periodLabel || "",
            jobItems: opts.jobItems || [],
            archived: Boolean(opts.archived),
          } as never,
        }),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error("Alfa не ответила за отведённое время — нажмите ещё раз.")),
            opts.kind === "jobStart" ||
            opts.kind === "jobStop" ||
            opts.kind === "archivesPupils" || opts.kind === "archives" || opts.kind === "archiveCount" || opts.kind === "archiveCatalog" || opts.kind === "archiveAdd" || opts.kind === "life" || opts.kind === "group" || opts.kind === "details" || opts.kind === "hydrateDisk" || opts.kind === "students" || opts.kind === "balance" || opts.kind === "audit" || opts.kind === "roster" || opts.kind === "rosterPolicy" ? 90000 : 25000,
          ),
        ),
      ])) as typeof journal & { ok?: boolean; periodLabel?: string; periodKey?: string; student?: StudentHit; extra?: string; more?: boolean; rosterPolicy?: { leads?: boolean; archiveInLive?: boolean; attendDays?: number } };
      if (res) {
        applyRosterPolicy(res.rosterPolicy);
        setJournal((cur) => {
          if (!cur) return res;
          const next = {
            ...cur,
            ...res,
            progress: {
              ...cur.progress,
              ...res.progress,
              live: mergePeopleSide(cur.progress?.live, res.progress?.live),
              archive: mergePeopleSide(cur.progress?.archive, res.progress?.archive),
              groups: res.progress?.groups || cur.progress?.groups,
            },
          };
          if (res.student && (opts.kind === "students" || opts.kind === "balance")) {
            const key = opts.study === "2" ? "archive" : "live";
            return {
              ...next,
              progress: {
                ...next.progress,
                [key]: patchPeopleSide(next.progress?.[key], res.student),
              },
            };
          }
          return next;
        });
      }
      setMsg(res?.error || res?.extra || (res?.ok ? "Записали на сайт." : "Журнал не ответил."));
      return res;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Журнал не ответил.");
      return null;
    } finally {
      if (!holdFill.current) {
        setBusy(false);
        setFillLoading(null);
      }
    }
  }

  async function pauseFive() {
    const until = Date.now() + PEOPLE_LOAD_GAP_MS;
    while (Date.now() < until && !stopSchool.current) await new Promise((r) => setTimeout(r, 200));
  }

  async function pauseCatalog() {
    const until = Date.now() + CATALOG_GAP_MS;
    while (Date.now() < until && !stopSchool.current) await new Promise((r) => setTimeout(r, 200));
  }

  function paintJob(job?: ServerJob | null, src?: "poll" | "load") {
    if (!job) return;
    const running = Boolean(job.running) && !job.stop;
    if (stopSchool.current && src === "poll" && running) return;
    if (running) {
      startedJobId.current = job.id || startedJobId.current || "live";
      holdFill.current = true;
      peopleLock.current = true;
      stopSchool.current = false;
      setBusy(true);
      setSchoolRun({ cur: job.cur || "", n: job.n || 0, total: job.total || 0, waits: job.waits || 0 });
      setFillLoading(job.fill || (job.cur ? { kind: job.kind || job.fill?.kind, label: job.cur, customerId: job.fill?.customerId } : null));
      if (job.msg) setMsg(job.msg);
      return;
    }
    if (holdFill.current && startedJobId.current === "pending" && src === "poll") return;
    if (holdFill.current && startedJobId.current && startedJobId.current !== "pending" && job.id && job.id !== startedJobId.current && src === "poll") return;
    if (src === "load" && holdFill.current && startedJobId.current === "pending") return;
    startedJobId.current = "";
    holdFill.current = false;
    peopleLock.current = false;
    setBusy(false);
    setSchoolRun(null);
    setFillLoading(null);
    if (job.stop) setMsg(stoppedLine(job));
    else if (job.msg) setMsg(job.msg);
  }

  async function startHistJob(opts: {
    jobMode: string;
    peopleKind?: "students" | "balance";
    study?: "1" | "2";
    recheck?: boolean;
    dateFrom?: string;
    recheckDays?: number;
    grain?: Grain;
    school?: string;
    groupId?: number;
    branchId?: number;
    customerId?: number;
    take?: number;
    name?: string;
    probe?: boolean;
    periodKey?: string;
    periodLabel?: string;
    jobItems?: { cid?: number; branchId?: number; name?: string; groupId?: number; periodKey?: string; periodLabel?: string }[];
    archived?: boolean;
  }) {
    if (journal?.job?.running && !journal.job.stop && !stopSchool.current) {
      paintJob(journal.job);
      setMsg(journal.job.cur ? `Уже идёт: ${journal.job.cur}. Стоп — потом другая кнопка.` : "Уже идёт загрузка. Стоп — потом другая кнопка.");
      return { job: journal.job };
    }
    holdFill.current = true;
    startedJobId.current = "pending";
    peopleLock.current = true;
    stopSchool.current = false;
    setBusy(true);
    const res = await runJournal({
      kind: "jobStart",
      jobMode: opts.jobMode,
      peopleKind: opts.peopleKind,
      study: opts.study,
      recheck: opts.recheck,
      dateFrom: opts.dateFrom,
      recheckDays: opts.recheckDays,
      grain: opts.grain,
      school: opts.school,
      groupId: opts.groupId,
      branchId: opts.branchId,
      customerId: opts.customerId,
      take: opts.take,
      name: opts.name,
      probe: opts.probe,
      periodKey: opts.periodKey,
      periodLabel: opts.periodLabel,
      jobItems: opts.jobItems,
      archived: opts.archived,
    });
    const job = (res as { job?: Parameters<typeof paintJob>[0] })?.job;
    if (job?.running) {
      paintJob(job);
      return res;
    }
    if (job) {
      startedJobId.current = "";
      holdFill.current = false;
      peopleLock.current = false;
      setBusy(false);
      setFillLoading(null);
      if (job.msg) setMsg(job.msg);
      return res;
    }
    try {
      const st = (await adminSchedule({
        data: { token: token(), action: "journalPull", kind: "jobStatus" } as never,
      })) as { job?: Parameters<typeof paintJob>[0] };
      if (st?.job?.running) {
        paintJob(st.job);
        return st as typeof res;
      }
    } catch {
      /* старт мог не ответить, фон уже идёт */
    }
    holdFill.current = false;
    peopleLock.current = false;
    setBusy(false);
    setFillLoading(null);
    return res;
  }

  function requestStop() {
    stopSchool.current = true;
    holdFill.current = false;
    peopleLock.current = false;
    startedJobId.current = "";
    setBusy(false);
    setSchoolRun(null);
    setFillLoading(null);
    setMsg("Останавливаем…");
    setJournal((cur) =>
      cur
        ? {
            ...cur,
            job: {
              ...(cur.job as ServerJob | undefined),
              running: false,
              stop: true,
              cur: "",
              fill: null,
              msg: "Останавливаем…",
            },
          }
        : cur,
    );
    void runJournal({ kind: "jobStop" }).then((res) => paintJob((res as { job?: Parameters<typeof paintJob>[0] })?.job));
  }

  async function loadPerson(row: PeopleRow, kind: "students" | "balance", study: "1" | "2", recheck = false, dateFrom = "") {
    if (!row.cid) return;
    await startHistJob({
      jobMode: "person",
      peopleKind: kind,
      study,
      recheck,
      dateFrom: dateFrom || peopleDateFrom(kind === "balance" ? moneyFromId : peopleFromId),
      recheckDays: recheck ? (kind === "balance" ? moneyRecheckDays : peopleRecheckDays) : undefined,
      customerId: row.cid,
      branchId: row.branchId,
      name: row.name,
    });
  }

  async function resetPersonHistory(row: PeopleRow) {
    if (!row.cid) return;
    try {
      const res = (await adminSchedule({
        data: {
          token: token(),
          action: "journalPull",
          kind: "lessonsReset",
          customerId: row.cid,
          branchId: row.branchId,
        } as never,
      })) as { ok?: boolean; extra?: string; error?: string; student?: { lessons?: number; alfa?: number; short?: boolean } };
      if (res?.ok === false) {
        setMsg(res.error || res.extra || "Не сбросили диск");
        return;
      }
      if (res?.extra) setMsg(res.extra);
      const key = peopleStudy === "2" ? "archive" : "live";
      setJournal((cur) => {
        if (!cur) return cur;
        const side = cur.progress?.[key];
        if (!side) return cur;
        return {
          ...cur,
          progress: {
            ...cur.progress,
            [key]: {
              ...side,
              people: (side.people || []).map((p) =>
                p.cid === row.cid
                  ? {
                      ...p,
                      lessons: Number(res?.student?.lessons) || 0,
                      alfa: res?.student?.alfa,
                      short: true,
                      journal: false,
                      dups: false,
                    }
                  : p,
              ),
            },
          },
        };
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не сбросили диск");
      return;
    }
  }

  async function resetPersonPay(row: PeopleRow) {
    if (!row.cid) return;
    try {
      const res = (await adminSchedule({
        data: {
          token: token(),
          action: "journalPull",
          kind: "paysReset",
          customerId: row.cid,
          branchId: row.branchId,
        } as never,
      })) as { ok?: boolean; extra?: string; error?: string; student?: { cashRows?: number; pays?: number } };
      if (res?.ok === false) {
        setMsg(res.error || res.extra || "Не сбросили кассу");
        return;
      }
      if (res?.extra) setMsg(res.extra);
      const key = peopleStudy === "2" ? "archive" : "live";
      setJournal((cur) => {
        if (!cur) return cur;
        const side = cur.progress?.[key];
        if (!side) return cur;
        return {
          ...cur,
          progress: {
            ...cur.progress,
            [key]: {
              ...side,
              people: (side.people || []).map((p) =>
                p.cid === row.cid
                  ? {
                      ...p,
                      pays: false,
                      paysOk: false,
                      paysScanned: false,
                      paysEmpty: false,
                      paysMore: false,
                      paysRechecked: false,
                      cashRows: Number(res?.student?.cashRows) || 0,
                    }
                  : p,
              ),
            },
          },
        };
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не сбросили кассу");
      return;
    }
  }

  async function holeMark(row: PeopleRow, on: boolean) {
    if (!row.cid) return;
    try {
      const res = (await adminSchedule({
        data: {
          token: token(),
          action: "journalPull",
          kind: on ? "holeApprove" : "holeApproveClear",
          customerId: row.cid,
        } as never,
      })) as { ok?: boolean; extra?: string; error?: string; student?: { holeApproved?: boolean; short?: boolean } };
      if (res?.ok === false) {
        setMsg(res.error || res.extra || "Не записали отметку");
        return;
      }
      const approved = Boolean(res?.student?.holeApproved);
      const key = peopleStudy === "2" ? "archive" : "live";
      setJournal((cur) => {
        if (!cur) return cur;
        return {
          ...cur,
          progress: {
            ...cur.progress,
            [key]: patchHoleApproved(cur.progress?.[key], row.cid, approved),
          },
        };
      });
      if (res?.extra) setMsg(res.extra);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не записали отметку");
    }
  }

  async function recheckPeople(kind: "students" | "balance", study: "1" | "2", onlyRecheck = false) {
    const side = study === "2" ? journal?.progress?.archive : journal?.progress?.live;
    const people = (side?.people || []) as PeopleRow[];
    if (onlyRecheck) {
      if (!people.length) {
        setMsg("Список пуст. Сначала шаг 1.");
        return;
      }
      holdFill.current = true;
      setBusy(true);
      const res = await startHistJob({
        jobMode: "people-recheck",
        peopleKind: kind,
        study,
        recheck: true,
        dateFrom: peopleLoadFrom(kind),
        recheckDays: kind === "balance" ? moneyRecheckDays : peopleRecheckDays,
        jobItems: [],
      });
      const job = (res as { job?: { running?: boolean; msg?: string } } | null)?.job;
      if (job && !job.running) setMsg(job.msg || "Некого: справа пусто и слева нет жёлтых.");
      return;
    }
    const queue = peopleQueue(people, kind, false);
    if (!queue.length) {
      setMsg(
        kind === "balance"
          ? "Массовая касса этих уже спрашивала Alfa. Слева — пустой ответ или шапка не сошлась. Карточка «Загрузить кассу» — ещё раз."
          : "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.",
      );
      return;
    }
    holdFill.current = true;
    setBusy(true);
    setSchoolRun({ cur: queue[0].name, n: 0, total: queue.length });
    setFillLoading({ kind, label: queue[0].name, customerId: queue[0].cid });
    const res = await startHistJob({
      jobMode: "people",
      peopleKind: kind,
      study,
      recheck: false,
      dateFrom: peopleDateFrom(kind === "balance" ? moneyFromId : peopleFromId),
      jobItems: queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name })),
    });
    const job = (res as { job?: { running?: boolean; msg?: string; total?: number } } | null)?.job;
    if (job && !job.running && queue.length) {
      setMsg(job.msg || `Очередь с экрана: ${queue.length}. Нажмите ещё раз.`);
    }
  }

  async function slowFillPeople(study: "1" | "2") {
    const side = study === "2" ? journal?.progress?.archive : journal?.progress?.live;
    const people = (side?.people || []) as PeopleRow[];
    const queue = peopleQueue(people, "students", false);
    if (!queue.length) {
      setMsg("Некого добирать. Слева пусто.");
      return;
    }
    holdFill.current = true;
    setBusy(true);
    setSchoolRun({ cur: queue[0].name, n: 0, total: queue.length });
    setFillLoading({ kind: "students", label: queue[0].name, customerId: queue[0].cid });
    const res = await startHistJob({
      jobMode: "people-slow",
      peopleKind: "students",
      study,
      dateFrom: peopleLoadFrom("students"),
      jobItems: queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name })),
    });
    const job = (res as { job?: { running?: boolean; msg?: string; total?: number } } | null)?.job;
    if (job && !job.running && queue.length) {
      setMsg(job.msg || `Очередь добора: ${queue.length}. Нажмите ещё раз.`);
    }
  }

  function catalogHasMore() {
    const at = Date.parse(String(journal?.lastArchiveCatalog?.at || ""));
    return Boolean(journal?.lastArchiveCatalog?.more) && Boolean(at && Date.now() - at < 24 * 60 * 60 * 1000);
  }

  function catalogProgressNote(raw?: string) {
    return String(raw || "")
      .replace(/\s*·\s*на диске архивных\s+\d+\.?\s*/gi, " ")
      .replace(/\s*Кто записан\s*[—–-]\s*слева\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*·\s*$/g, "")
      .trim();
  }

  function catalogFilterJson() {
    const ageFrom = Number(archAgeFrom);
    const ageTo = Number(archAgeTo);
    return JSON.stringify({
      ageFrom: archAgeFrom !== "" && Number.isFinite(ageFrom) ? ageFrom : undefined,
      ageTo: archAgeTo !== "" && Number.isFinite(ageTo) ? ageTo : undefined,
      noDob: archNoDob,
      fio: archNeedFio,
      groups: archNeedGroups,
      attendYears: archAttendYears,
    });
  }

  function peopleLoadFrom(kind: "students" | "balance") {
    if (peopleStudy === "2") return peopleDateFrom(archAttendYears === 2 ? "2" : "1");
    return peopleDateFrom(kind === "balance" ? moneyFromId : peopleFromId);
  }

  function catalogOptsBar() {
    const chip = (on: boolean) =>
      cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold transition-colors", on ? "bg-black text-white" : "bg-white ring-1 ring-black/10 hover:bg-black/5");
    const bits = [
      archAgeFrom || archAgeTo ? `${archAgeFrom || "…"}–${archAgeTo || "…"} лет` : "",
      archNoDob ? "без д/р" : "",
      archNeedFio ? "ФИО" : "",
      archNeedGroups ? "группы" : "",
      archAttendYears === 2 ? "2 года" : archAttendYears === 1 ? "год" : "",
    ].filter(Boolean);
    return (
      <div className="w-full rounded-2xl bg-surface-2 px-3.5 py-3 ring-1 ring-black/10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-display text-[1.02rem] leading-none text-ink">Кого писать на диск</p>
          <p className="text-[0.72rem] text-muted">{bits.length ? bits.join(" · ") : "все с живым именем"}</p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-2.5 ring-1 ring-black/10">
            <span className="text-[0.72rem] text-muted">возраст</span>
            <input
              className="h-6 w-8 bg-transparent text-center text-[0.82rem] font-semibold outline-none placeholder:text-muted/60"
              inputMode="numeric"
              value={archAgeFrom}
              onChange={(e) => setArchAgeFrom(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="от"
              aria-label="Возраст от"
            />
            <span className="text-muted/50">–</span>
            <input
              className="h-6 w-8 bg-transparent text-center text-[0.82rem] font-semibold outline-none placeholder:text-muted/60"
              inputMode="numeric"
              value={archAgeTo}
              onChange={(e) => setArchAgeTo(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="до"
              aria-label="Возраст до"
            />
          </span>
          <button type="button" className={chip(archNoDob)} onClick={() => setArchNoDob((v) => !v)}>
            без д/р
          </button>
          <button type="button" className={chip(archNeedFio)} onClick={() => setArchNeedFio((v) => !v)}>
            только с ФИО
          </button>
          <button type="button" className={chip(archNeedGroups)} onClick={() => setArchNeedGroups((v) => !v)}>
            были группы
          </button>
          <button type="button" className={chip(archAttendYears === 1)} onClick={() => setArchAttendYears((v) => (v === 1 ? 0 : 1))}>
            за год
          </button>
          <button type="button" className={chip(archAttendYears === 2)} onClick={() => setArchAttendYears((v) => (v === 2 ? 0 : 2))}>
            за 2 года
          </button>
        </div>
        <p className="mt-2 text-[0.72rem] leading-snug text-muted">Телефон и «тест» не пишем. Кто записался — сразу слева.</p>
      </div>
    );
  }

  async function pullArchiveCatalog() {
    if (peopleLock.current && !journal?.job?.running) return;
    const more = catalogHasMore();
    const fromN = Number(archAgeFrom);
    const toN = Number(archAgeTo);
    if (archAgeFrom !== "" && archAgeTo !== "" && Number.isFinite(fromN) && Number.isFinite(toN) && fromN > toN) {
      setMsg("Возраст «от» больше, чем «до».");
      return;
    }
    if (!more) {
      if (
        !window.confirm(
          "Архив клиентов: по одной карточке, пауза 5 с. Календарь и касса не качаются. Без живого ФИО не пишем. Стоп — после текущей. Продолжить?",
        )
      )
        return;
    }
    await startHistJob({ jobMode: "catalog", school: catalogFilterJson(), probe: !more });
  }

  async function pullAudit(opts?: { customerId?: number; branchId?: number; name?: string }) {
    await startHistJob({
      jobMode: "audit",
      study: peopleStudy,
      customerId: opts?.customerId,
      branchId: opts?.branchId,
      name: opts?.name,
    });
  }

  async function probePeople(study: "1" | "2") {
    const side = study === "2" ? journal?.progress?.archive : journal?.progress?.live;
    const people = side?.people || [];
    const unseen = people.filter((r) => r.alfa == null);
    const seen = new Set(unseen.map((r) => r.cid));
    const queue = [...unseen, ...people.filter((r) => r.short && !seen.has(r.cid))];
    if (!queue.length) {
      setMsg("Некого сверять: список пуст или счёт уже есть.");
      return;
    }
    await startHistJob({
      jobMode: "probe",
      peopleKind: "students",
      study,
      jobItems: queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name })),
    });
  }

  async function recheckSchool() {
    holdFill.current = true;
    await startHistJob({ jobMode: "groups", grain: journalGrain, school: journalSchool, archived: groupArchived });
  }

  async function recheckGroupsOne() {
    await startHistJob({
      jobMode: "groups-recheck",
      grain: journalGrain,
      school: journalSchool,
      recheck: true,
      archived: groupArchived,
      recheckDays: groupsRecheckDays,
    });
  }

  async function saveRosterWho() {
    await runJournal({
      kind: "rosterPolicy",
      name: `leads=${rosterLeads ? 1 : 0}&arch=${rosterArchLive ? 1 : 0}&days=${rosterDays}`,
    });
  }

  async function loadRosterOne() {
    await startHistJob({ jobMode: "roster", school: journalSchool, archived: groupArchived, study: peopleStudy });
  }

  async function recheckRosterOne() {
    await startHistJob({ jobMode: "roster-recheck", school: journalSchool, archived: groupArchived, recheck: true, study: peopleStudy });
  }

  async function recheckGroup(row: FillRow) {
    await startHistJob({
      jobMode: "group-one",
      grain: journalGrain,
      groupId: Number(row.groupId) || 0,
      branchId: Number(row.branchId) || 0,
      name: row.name,
      recheck: true,
      recheckDays: groupsRecheckDays,
    });
  }

  async function loadStages() {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "leadsBoard", branchId: 2, force: false } as never,
      })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
      if (res.ok && Array.isArray(res.stages) && res.stages.length) {
        setStages(mergeStages(res.stages));
        setMsg("");
      } else if (res.error) setMsg(res.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось прочитать этапы.");
    } finally {
      setBusy(false);
    }
  }

  async function sortStages(ids: number[]) {
    const pinned = pinUnsorted(ids);
    const prev = stages;
    setStages((xs) => {
      const by = new Map(xs.map((s) => [s.id, s]));
      const next = pinned.map((id) => by.get(id)).filter((s): s is LeadStage => Boolean(s));
      for (const s of xs) if (!next.some((x) => x.id === s.id)) next.push(s);
      return next;
    });
    setMsg("Порядок на диске, Alfa в очереди.");
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSort", stageIds: pinned, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg("Порядок записан. Alfa догонит очередью.");
      return;
    }
    setStages(prev);
    setMsg(res.error || "Не записали порядок этапов.");
  }

  function shift(id: number, dir: -1 | 1) {
    if (id === 0) return;
    const ids = stages.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length || ids[j] === 0) return;
    const next = ids.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    void sortStages(next);
  }

  async function saveName(id: number, name: string) {
    const title = name.trim();
    setEditId(null);
    if (!title || id === 0) return;
    const prev = stages.find((s) => s.id === id)?.name;
    if (title === prev) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, name: title } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, name: title, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось переименовать этап.");
  }

  async function saveColor(id: number, color: string) {
    if (id === 0) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, color } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, color, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось сменить цвет.");
  }

  async function addStage() {
    const title = addName.trim();
    if (!title) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageCreate", name: title, color: addColor, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setAddName("");
      setMsg(`Этап «${title}» добавлен.`);
      return;
    }
    setMsg(res.error || "Не удалось создать этап.");
  }

  async function removeStage(id: number, name: string) {
    if (id === 0) return;
    if (!window.confirm(`Удалить этап «${name}» в AlfaCRM? Лиды с него уйдут в «Не разобрано».`)) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageDelete", stageId: id, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg(`Этап «${name}» удалён.`);
      return;
    }
    setMsg(res.error || "Не удалось удалить этап.");
  }

  function setMinutes(n: number) {
    const v = Math.max(2, Math.min(60, n));
    setSyncMin(v);
    try {
      localStorage.setItem(CRM_SYNC_MIN_KEY, String(v));
    } catch {
      /* */
    }
    void saveSync({ minutes: v });
  }

  const named = stages.filter((s) => s.id !== 0);
  const unsorted = stages.find((s) => s.id === 0) || LEAD_STAGES[0];

  return (
    <div className="space-y-4 pb-8 [overflow-anchor:none]">
      <div>
        <h2 className="font-display text-3xl">Настройка CRM</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Этапы, журнал и связь с Alfa — по вкладкам, не одной простынёй.
        </p>
      </div>
      <div ref={crmTabsRef} className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1 bg-[var(--color-bg)] px-1 py-2">
        {CRM_SET_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", crmTab === t.id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
            onClick={() => pickCrmTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[70vh]">
      {crmTab === "people" ? (
      <Card
        title="Люди и роли"
        hint="Кто пишет на диск. Alfa догоняет очередью и не меняет автора. Пароль кабинета один — сотрудник. Два ИИ без пароля: ассистент в админке, консультант на сайте. Очередь — пакеты cgi и выгрузка."
      >
        <ul className="space-y-2">
          {(actors?.actors || CRM_ACTORS).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {a.kind === "human" ? "человек" : a.kind === "ai" ? "ИИ" : "система"}
              </span>
              <div className="min-w-[12rem] flex-1">
                {a.id === "human" ? (
                  <label className="block text-sm font-semibold">
                    Сотрудник
                    <input
                      value={humanName}
                      onChange={(e) => setHumanName(e.target.value)}
                      onBlur={() => void saveActorsName()}
                      className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
                    />
                  </label>
                ) : (
                  <p className="text-sm font-semibold">{a.name}</p>
                )}
                <p className="mt-0.5 text-[0.75rem] text-muted">{a.hint}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.75rem] text-muted">Пароль входа тот же. Несколько сотрудников — следующим шагом, не смешивать с ИИ.</p>
      </Card>
      ) : null}

      {crmTab === "alfa" ? (
      <>
      <Card
        title="Фон с AlfaCRM"
        hint="Диск сайта — правда. Ольга и формы пишут сюда сразу. Ниже — что подгружать из Alfa, что выгружать обратно, и предохранители трубы (лимит, токен, повтор создания)."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {ALFA_LINK_MODES.map((m) => {
            const on = alfaMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => void saveAlfaMode(m.id)}
                className={cn(
                  "rounded-2xl px-4 py-3 text-left ring-1 transition",
                  on ? "bg-black text-white ring-black" : "bg-surface-2 ring-black/8 hover:bg-white",
                )}
              >
                <p className="text-sm font-semibold">{m.title}</p>
                <p className={cn("mt-1 text-[0.75rem] leading-snug", on ? "text-white/80" : "text-muted")}>{m.hint}</p>
              </button>
            );
          })}
        </div>
        <div className={cn("mt-4 grid gap-4 md:grid-cols-2", alfaMode === "offline" && "opacity-50")}>
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Подгружать из Alfa</p>
            <ul className="mt-2 space-y-1.5">
              {ALFA_PULL_CH.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={busy || alfaMode === "offline"}
                      checked={pull[c.id as AlfaPullCh]}
                      onChange={(e) => void saveSync({ pull: { ...pull, [c.id]: e.target.checked } })}
                    />
                    <span>
                      <span className="font-semibold">{c.title}</span>
                      <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Выгружать в Alfa</p>
            <ul className="mt-2 space-y-1.5">
              {ALFA_PUSH_CH.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={busy || alfaMode === "offline"}
                      checked={push[c.id as AlfaPushCh]}
                      onChange={(e) => void saveSync({ push: { ...push, [c.id]: e.target.checked } })}
                    />
                    <span>
                      <span className="font-semibold">{c.title}</span>
                      <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={cn("mt-4", alfaMode === "offline" && "opacity-50")}>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Труба в Alfa</p>
          <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
            {ALFA_PIPE_CH.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={busy || alfaMode === "offline"}
                    checked={pipe[c.id as AlfaPipeCh]}
                    onChange={(e) => void saveSync({ pipe: { ...pipe, [c.id]: e.target.checked } })}
                  />
                  <span>
                    <span className="font-semibold">{c.title}</span>
                    <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Сверять каждые
          <select
            className="h-9 rounded-full bg-surface-2 px-3 text-sm font-medium ring-1 ring-black/8"
            value={syncMin}
            disabled={busy || alfaMode === "offline"}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[2, 5, 10, 15, 30].map((n) => (
              <option key={n} value={n}>
                {n} мин
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Касса за
          <select
            className="h-9 rounded-full bg-surface-2 px-3 text-sm font-medium ring-1 ring-black/8"
            value={payDays}
            disabled={busy || alfaMode === "offline"}
            onChange={(e) => void saveSync({ payDays: Number(e.target.value) })}
          >
            {[1, 2, 3, 5, 7, 14].map((n) => (
              <option key={n} value={n}>
                {n} дн
              </option>
            ))}
          </select>
        </label>
        </div>
        <p className="mt-2 text-[0.75rem] text-muted">
          Выключенный канал: на сайте запись есть, в Alfa не уходит, пока не включите. Очередь хранит задание. Касса опрашивает окно дней, не всю историю.
        </p>
      </Card>

      <Card
        title="Люди в Alfa"
        hint="Сейчас работают и у нас, и в Alfa. Интервал и каналы — выше. F5 Alfa не ждёт."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Сверять CRM каждые
            <select
              className="ml-2 h-9 rounded-full bg-surface-2 px-3 text-sm ring-1 ring-black/8"
              value={syncMin}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} мин
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadStages()}
            className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10 hover:bg-black/5"
          >
            Обновить этапы
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-[0.82rem] text-muted">
          <li>Состав и абонементы — фоновые пакеты.</li>
          <li>Лиды — только карточки с новым updated_at.</li>
          <li>Журнал урока — фон по 2 группы, как состав. Очередь старше входа. «Обновить» у группы — сразу.</li>
          <li>Касса пока в Alfa: платёж у нас сразу на диск и в очередь.</li>
        </ul>
      </Card>
      </>
      ) : null}

      {crmTab === "history" ? (
      <Card
        title="История из Alfa"
        hint="Кнопки пишут очередь на диск. Грузит отдельный процесс «истории». Вкладку и страницу можно закрыть — F5 ничего не сбрасывает. Красная — загрузить, пауза 5 секунд. Синяя — перепроверить, пауза от 1 до 5 секунд. Пульт — те же шаги по расписанию или «1–5 сейчас». Очередь одна. В Alfa ничего не пишем. ○ сверить · ~ оборвалось · ✓ сверено с Alfa."
      >
        {(() => {
          const offline = alfaMode === "offline";
          const p = journal?.progress;
          const liveN = Number(journal?.students?.live || p?.live?.total || 0);
          const archN = Number(p?.archive?.total || journal?.students?.archive || 0);
          const schoolRows = (p?.groups?.rows || []).filter((r) => !journalSchool || r.school === journalSchool);
          const schoolDone = schoolRows.filter((r) => fillFinishedRow(r, journalGrain)).length;
          const schoolNeed = Math.max(0, schoolRows.length - schoolDone);
          const schoolNeedLife = schoolRows.filter((r) => r.source !== "alfa").length;
          return (
            <div className="space-y-3">
              {!journal ? (
                <div className="flex flex-wrap items-center gap-2">
                  {journalLoading ? (
                    <p className="text-sm text-muted">Загружаю список с диска…</p>
                  ) : (
                    <>
                      {withHint(
                      <button type="button" className={BTN_LOAD} onClick={() => void loadJournal()}>
                        Показать список с диска
                      </button>,
                      HINT.disk,
                      )}
                      <span className="text-sm text-muted">Не пришло — нажмите ещё раз.</span>
                    </>
                  )}
                </div>
              ) : null}
              <div ref={histTabsRef} className="flex flex-wrap items-center gap-1">
                {withHint(
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-full px-3 text-[0.78rem] font-semibold",
                    syncPolicy.planEnabled ? "bg-emerald-700 text-white" : "bg-white ring-1 ring-black/10",
                  )}
                  onClick={() => setPlanOpen(true)}
                >
                  Пульт синхронизации{syncPolicy.planEnabled ? " · вкл" : ""}
                </button>,
                HINT.plan,
                )}
                {HIST_TABS.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", histTab === t.id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
                      onClick={() => pickHistTab(t.id)}
                    >
                      {t.label}
                    </button>
                    <LoadGuideBtn tab={t.id} onOpen={setLoadGuide} />
                  </span>
                ))}
              </div>
              {loadGuide ? <LoadGuideModal tab={loadGuide} onClose={() => setLoadGuide(null)} /> : null}
              <HistoryPlanModal
                open={planOpen}
                onClose={() => setPlanOpen(false)}
                policy={syncPolicy}
                job={journal?.job}
                busy={busy}
                planLog={journal?.planLog}
                historyWorker={journal?.historyWorker}
                onSave={(next) => void saveSyncPolicy(next)}
                onRunAuto={(opts) =>
                  void startHistJob({
                    jobMode: "auto",
                    study: opts.study,
                    dateFrom: planDateFrom(planFromIdOf(opts.study, opts.dateFromId)),
                    recheckDays: planFromIdToRecheckDays(planFromIdOf(opts.study, opts.dateFromId)),
                    archived: opts.study === "2",
                    name: `leads=${opts.leads ? 1 : 0}&archGroups=${opts.archGroups ? 1 : 0}`,
                  })
                }
              />
              {histTab === "roster" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="flex items-center gap-2 font-display text-[1.15rem]">
                  Группы и состав
                  <LoadGuideBtn tab="roster" onOpen={setLoadGuide} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Основа для календаря и кассы. Одна группа, пауза 5 с. В Alfa не пишем.{" "}
                  <HintI text={HINT.tabRoster} />
                </p>
                {(() => {
                  const rows = (p?.groups?.rows || []).filter((r) => (groupArchived ? r.archived : !r.archived) && (!journalSchool || r.school === journalSchool));
                  const need = rows.filter((r) => !r.roster);
                  const done = rows.filter((r) => Boolean(r.roster));
                  const run = Boolean(journal?.job?.running && (journal.job.mode === "roster" || journal.job.mode === "roster-recheck"));
                  const liveGroupN = (p?.groups?.rows || []).filter((r) => !r.archived).length;
                  const archGroupN = (p?.groups?.rows || []).filter((r) => r.archived).length;
                  return (
                    <>
                      <ProgressBar done={done.length} total={rows.length} run={run} loading={journalLoading && !journal} />
                      <p className="mt-1 text-[0.72rem] text-muted">
                        Состав прочитан {done.length} из {rows.length}
                        {need.length ? ` · требуют загрузки ${need.length}` : ""}. Сейчас ходят · {liveN}.
                      </p>
                      <div className="mt-3">
                        <ScopePills
                          value={groupArchived ? "archive" : "live"}
                          onChange={(v) => setGroupArchived(v === "archive")}
                          live={`Живые группы · ${liveGroupN}`}
                          arch={`Архивные группы · ${archGroupN}`}
                          hintLive={HINT.scopeLiveGroups}
                          hintArch={HINT.scopeArchGroups}
                          middle={
                            <>
                              {withHint(
                                <select
                                  className="h-8 max-w-[14rem] rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
                                  value={journalSchool}
                                  disabled={busy}
                                  onChange={(e) => pickJournalSchool(e.target.value)}
                                  aria-label="Школа"
                                >
                                  <option value="">Все школы</option>
                                  {(journal?.schools || []).map((s) => (
                                    <option key={s.name} value={s.name}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>,
                                HINT.school,
                              )}
                              {withHint(
                                <label className="flex h-8 items-center gap-1.5 whitespace-nowrap text-[0.78rem]">
                                  <input type="checkbox" checked={rosterLeads} onChange={(e) => setRosterLeads(e.target.checked)} />
                                  лиды в этих группах
                                </label>,
                                HINT.rosterWho,
                              )}
                              {withHint(
                                <label className="flex h-8 items-center gap-1.5 whitespace-nowrap text-[0.78rem]">
                                  <input type="checkbox" checked={rosterArchLive} onChange={(e) => setRosterArchLive(e.target.checked)} />
                                  архив в живой группе
                                </label>,
                                HINT.rosterWho,
                              )}
                              {withHint(
                                <label className="flex h-8 items-center gap-1.5 whitespace-nowrap text-[0.78rem]">
                                  был на занятии
                                  <select
                                    className="h-8 rounded-full bg-white px-2 text-[0.78rem] ring-1 ring-black/10"
                                    value={rosterDays}
                                    onChange={(e) => setRosterDays(Number(e.target.value) || 0)}
                                  >
                                    <option value={0}>не фильтровать</option>
                                    <option value={15}>15 дней</option>
                                    <option value={30}>30 дней</option>
                                    <option value={150}>150 дней</option>
                                  </select>
                                </label>,
                                HINT.rosterWho,
                              )}
                              <button type="button" className={BTN_GHOST_SM} disabled={busy} onClick={() => void saveRosterWho()}>
                                Запомнить
                              </button>
                            </>
                          }
                        />
                      </div>
                      <div className="mt-3 flex min-w-0 w-full flex-wrap items-center gap-2">
                        {withHint(
                          <button type="button" className={BTN_LOAD} disabled={busy && run} onClick={() => void loadRosterOne()}>
                            Загрузить по одному
                          </button>,
                          HINT.roster,
                        )}
                        {withHint(
                          <button type="button" className={BTN_GHOST} disabled={busy && run} onClick={() => void recheckRosterOne()}>
                            Перепроверить
                          </button>,
                          HINT.rosterRecheck,
                        )}
                        {withHint(
                          <button type="button" className={cn(BTN_GHOST, "shrink-0")} disabled={!run} onClick={() => void runJournal({ kind: "jobStop" })}>
                            Стоп
                          </button>,
                          HINT.stop,
                        )}
                        <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note} tab={histTab} />
                      </div>
                      <div className="mt-8">
                        <p className="font-semibold text-rose-800">Требуют загрузки состава · {need.length}</p>
                        {need.length ? (
                          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {need.slice(0, 100).map((r) => (
                              <li key={`${r.branchId}-${r.groupId}`} className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/8">
                                <span className="min-w-0 truncate">
                                  {r.name} <span className="text-muted">№{r.groupId}</span>
                                  {r.school ? <span className="text-muted"> · {r.school}</span> : null}
                                </span>
                                <button
                                  type="button"
                                  className={cn(BTN_LOAD_SM, "shrink-0")}
                                  disabled={busy}
                                  onClick={() => void startHistJob({ jobMode: "roster", groupId: r.groupId, branchId: r.branchId, name: r.name, jobItems: [{ groupId: r.groupId, branchId: r.branchId, name: r.name }] })}
                                >
                                  Состав
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-muted">Пусто.</p>
                        )}
                      </div>
                      <div className="mt-6">
                        <p className="font-semibold text-emerald-800">Состав прочитан · {done.length}</p>
                        <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                          {done.slice(0, 100).map((r) => (
                            <li key={`${r.branchId}-${r.groupId}`} className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/8">
                              <span className="min-w-0 truncate">
                                {r.name} <span className="text-muted">№{r.groupId}</span>
                              </span>
                              <button
                                type="button"
                                className={cn(BTN_GHOST_SM, "shrink-0")}
                                disabled={busy}
                                onClick={() => void startHistJob({ jobMode: "roster-recheck", recheck: true, groupId: r.groupId, branchId: r.branchId, name: r.name, jobItems: [{ groupId: r.groupId, branchId: r.branchId, name: r.name }] })}
                              >
                                Перепроверить
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {(() => {
                        const ug = p?.ungrouped;
                        const n = Number(ug?.total) || 0;
                        const items = ug?.items || [];
                        return (
                          <div className="mt-4 rounded-2xl bg-white px-3 py-3 ring-1 ring-black/8">
                            <p className="font-semibold">Люди без группы · {n}</p>
                            <p className="mt-1 text-[0.78rem] text-muted">Клиенты Alfa без живого cgi. Не архив. Не смешиваем с «сейчас ходят».</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {withHint(
                                <button
                                  type="button"
                                  className={BTN_LOAD}
                                  disabled={busy || !n}
                                  onClick={() =>
                                    void startHistJob({
                                      jobMode: "people",
                                      study: "1",
                                      peopleKind: "students",
                                      dateFrom: "2015-01-01",
                                      name: "Люди без группы",
                                      jobItems: items.map((x) => ({ cid: x.cid, branchId: x.branchId, name: x.name })),
                                    })
                                  }
                                >
                                  Календарь
                                </button>,
                                HINT.ungrouped,
                              )}
                            </div>
                            {n ? (
                              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                                {items.slice(0, 40).map((x) => (
                                  <li key={x.cid}>
                                    {x.name} <span className="text-muted">№{x.cid}</span>
                                  </li>
                                ))}
                                {n > 40 ? <li className="text-muted">ещё {n - 40}</li> : null}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </section>
              ) : null}

              {histTab === "groups" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="flex items-center gap-2 font-display text-[1.15rem]">
                  Занятия в группах
                  <LoadGuideBtn tab="groups" onOpen={setLoadGuide} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Сначала красная «по одному», потом размер порции. Архив и сроки — отдельные кнопки ниже.{" "}
                  <HintI text={HINT.tabGroups} />
                </p>
                <ProgressBar done={schoolDone} total={schoolRows.length} run={Boolean(schoolRun || fillLoading)} loading={journalLoading && !journal} />
                <p className="mt-1 text-[0.72rem] text-muted">
                  {journalSchool ? `Школа «${journalSchool}»: загрузка завершена ${schoolDone} из ${schoolRows.length}` : "Все школы. Выберите школу — счётчик только по ней"}
                  {schoolNeed ? ` · требуют загрузки ${schoolNeed}` : ""}.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {journal?.lastArchivesPupils ? (
                    <div className="min-w-0 rounded-2xl bg-white px-4 py-3 text-sm leading-snug ring-1 ring-black/10">
                      <p className="font-semibold">
                        {journal.lastArchivesPupils.need
                          ? `В архив по карточкам ${journal.lastArchivesPupils.need}`
                          : "Новых архивных групп по карточкам нет"}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-[0.92rem]">
                        <li>клиентов в выборке {journal.lastArchivesPupils.clients}</li>
                        <li>уникальных groupId на карточках {journal.lastArchivesPupils.uniqueIds}</li>
                        <li>уже в живых {journal.lastArchivesPupils.live}</li>
                        <li>уйдёт в архив (нет в живых) {journal.lastArchivesPupils.need}</li>
                        <li>уже в списке архивных на сайте {journal.lastArchivesPupils.already}</li>
                        {journal.lastArchivesPupils?.added ? <li>+{journal.lastArchivesPupils.added} прочитали в Alfa</li> : null}
                      </ul>
                      {journal.lastArchivesPupils.names?.length ? (
                        <p className="mt-1 break-words text-[0.78rem] text-muted">{journal.lastArchivesPupils.names.join(", ")}</p>
                      ) : null}
                      {journal.lastArchivesPupils.missing?.length ? (
                        <p className="mt-1 break-words text-[0.78rem] text-rose-800">не нашли: {journal.lastArchivesPupils.missing.slice(0, 8).join(", ")}</p>
                      ) : null}
                      <p className="mt-2 text-[0.72rem] text-muted">
                        {journal.lastArchivesPupils.more
                          ? `Ещё ${journal.lastArchivesPupils.left} — очередь по одной, пауза 5 с. Журнал кварталов не стартовал.`
                          : "Список по карточкам закрыт. Дальше кварталы, как у живых групп."}
                      </p>
                    </div>
                  ) : null}
                  {journal?.lastArchives ? (
                    <div className="min-w-0 rounded-2xl bg-white px-4 py-3 text-sm leading-snug ring-1 ring-black/10">
                      <p className="font-semibold">
                        Архив «{journal.lastArchives.branch}»: {journal.lastArchives.added ? `+${journal.lastArchives.added}` : "новых нет"}
                      </p>
                      <p className="mt-1 text-[0.92rem]">
                        На диске {journal.lastArchives.total} архивных групп. Живое расписание не трогали.
                      </p>
                      {journal.lastArchives.names?.length ? (
                        <p className="mt-1 break-words text-[0.78rem] text-muted">{journal.lastArchives.names.join(", ")}</p>
                      ) : null}
                      <p className="mt-2 text-[0.72rem] text-muted">
                        {journal.lastArchives.more ? "Дальше следующий филиал, пауза 5 с." : "Четыре филиала просмотрены. Дальше — сроки и явки, как у живых."}
                      </p>
                    </div>
                  ) : null}
                  {journal?.lastLife ? (
                    <div className="min-w-0 rounded-2xl bg-white px-4 py-3 text-sm leading-snug ring-1 ring-black/10">
                      <p className="font-semibold">
                        Определено {journal.lastLife.total} {journal.lastLife.total === 1 ? "группа" : journal.lastLife.total < 5 ? "группы" : "групп"}
                        {journal.lastLife.school ? ` в «${journal.lastLife.school}»` : ""}
                      </p>
                      <ul className="mt-2 space-y-2 text-[0.92rem]">
                        <li>
                          <p className="font-semibold text-sky-900">молодых {journal.lastLife.young}</p>
                          {journal.lastLife.youngNames?.length ? <p className="mt-0.5 break-words text-[0.78rem] leading-snug text-muted">{journal.lastLife.youngNames.join(", ")}</p> : null}
                        </li>
                        <li>
                          <p className="font-semibold text-amber-900">средних {journal.lastLife.mid}</p>
                          {journal.lastLife.midNames?.length ? <p className="mt-0.5 break-words text-[0.78rem] leading-snug text-muted">{journal.lastLife.midNames.join(", ")}</p> : null}
                        </li>
                        <li>
                          <p className="font-semibold text-zinc-800">старых {journal.lastLife.old}</p>
                          {journal.lastLife.oldNames?.length ? <p className="mt-0.5 break-words text-[0.78rem] leading-snug text-muted">{journal.lastLife.oldNames.join(", ")}</p> : null}
                        </li>
                        {journal.lastLife.unknown ? (
                          <li>
                            <p className="font-semibold text-rose-800">без срока {journal.lastLife.unknown}</p>
                            {journal.lastLife.unknownNames?.length ? <p className="mt-0.5 break-words text-[0.78rem] leading-snug text-muted">{journal.lastLife.unknownNames.join(", ")}</p> : null}
                          </li>
                        ) : null}
                      </ul>
                      <p className="mt-2 text-[0.72rem] text-muted">
                        {journal.lastLife.probed
                          ? `Срок из Alfa уточнили у ${journal.lastLife.probed}${journal.lastLife.left ? `, осталось ${journal.lastLife.left}` : ""}.`
                          : "Дальше грузите только видимые кварталы у каждой группы."}
                      </p>
                    </div>
                  ) : (
                    <p className="self-start text-sm text-muted md:col-span-2 xl:col-span-1">После «Определить сроки» здесь появится отчёт: сколько молодых, средних и старых.</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BtnCluster tone="red">
                  {withHint(
                  <button
                    type="button"
                    className={cn(BTN_RED, schoolRun && "ra-progress-run")}
                    disabled={offline || Boolean(schoolRun)}
                    onClick={() => void recheckSchool()}
                  >
                    {schoolRun ? schoolRun.cur : "Загрузить по одному"}
                  </button>,
                  HINT.loadOneGroups,
                  )}
                  <GrainSelect value={journalGrain} disabled={busy || offline} onChange={pickJournalGrain} />
                  </BtnCluster>
                  <BtnCluster tone="sky">
                  {withHint(
                  <button
                    type="button"
                    className={cn(BTN_LOAD, schoolRun && fillLoading?.kind === "group" && "ra-progress-run")}
                    disabled={offline || busy}
                    onClick={() => void recheckGroupsOne()}
                  >
                    Перепроверить по одному
                  </button>,
                  HINT.recheckOneGroups,
                  )}
                  <RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : groupsRecheckDays} disabled={busy || offline} onChange={setGroupsRecheckDays} />
                  </BtnCluster>
                  {withHint(
                    <button
                      type="button"
                      className={BTN_GHOST}
                      disabled={!schoolRun}
                      onClick={() => {
                        requestStop();
                      }}
                    >
                      Стоп
                    </button>,
                    HINT.stop,
                  )}
                  <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note} tab={histTab} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {withHint(
                  <button
                    type="button"
                    className={cn(BTN_LOAD, fillLoading?.kind === "archivesPupils" && "ra-progress-run")}
                    disabled={busy || offline}
                    onClick={() => {
                      setGroupArchived(true);
                      void startHistJob({ jobMode: "archivesPupils", study: peopleStudy === "2" ? "2" : "1" });
                    }}
                  >
                    {fillLoading?.kind === "archivesPupils"
                      ? "Смотрю группы учеников…"
                      : journal?.lastArchivesPupils?.more
                        ? `Ещё архив учеников · осталось ${journal.lastArchivesPupils.left}`
                        : "Архив групп учеников"}
                  </button>,
                  HINT.archPupils,
                  )}
                  {withHint(
                  <button
                    type="button"
                    className={cn(BTN_LOAD, fillLoading?.kind === "archives" && "ra-progress-run")}
                    disabled={busy || offline}
                    onClick={() => {
                      if (!window.confirm("Это все архивы филиала, не только ученики. Продолжить?")) return;
                      void startHistJob({ jobMode: "archives" });
                    }}
                  >
                    {fillLoading?.kind === "archives"
                      ? "Читаю архив Alfa…"
                      : journal?.lastArchives?.total
                        ? journal.lastArchives.more
                          ? `Ещё архивные · на диске ${journal.lastArchives.total}`
                          : `Архивные ещё раз · ${journal.lastArchives.total}`
                        : "Загрузить архивные группы"}
                  </button>,
                  HINT.archAll,
                  )}
                  {withHint(
                  <button
                    type="button"
                    className={cn(BTN_LOAD, fillLoading?.kind === "life" && "ra-progress-run")}
                    disabled={busy || offline}
                    onClick={() => void startHistJob({ jobMode: "life", school: journalSchool })}
                  >
                    {fillLoading?.kind === "life" ? "Смотрю сроки…" : schoolNeedLife ? `Уточнить ещё ${schoolNeedLife}` : "Определить сроки групп"}
                  </button>,
                  HINT.life,
                  )}
                </div>
                <p className="mt-1 text-[0.72rem] text-muted">
                  «Архив групп учеников» — id с карточек той выборки, что на шаге 1 (текущие или рабочий архив, не вместе). Скрытых не берёт. groupLinks может быть без групп 2019 года.
                </p>
                <label className="mt-3 block text-sm font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Только школа
                    <HintI text={HINT.school} />
                  </span>
                  <select
                    className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
                    value={journalSchool}
                    disabled={busy || offline}
                    onChange={(e) => pickJournalSchool(e.target.value)}
                  >
                    <option value="">Все школы</option>
                    {(journal?.schools || []).map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 h-5 truncate text-sm text-muted">{schoolRun ? `Сейчас ${schoolRun.cur}` : "\u00a0"}</p>
                <div className="mt-2">
                  <ScopePills
                    value={groupArchived ? "archive" : "live"}
                    onChange={(v) => setGroupArchived(v === "archive")}
                    live="Сейчас идут"
                    arch="Архивные группы"
                    hintLive={HINT.scopeLiveGroups}
                    hintArch={HINT.scopeArchGroups}
                  />
                </div>
                <GroupFillList
                  rows={p?.groups?.rows || []}
                  school={journalSchool}
                  busy={busy || offline || Boolean(schoolRun)}
                  loading={fillLoading || undefined}
                  grain={journalGrain}
                  archived={groupArchived}
                  onGrain={pickJournalGrain}
                  onLoad={(row, part, recheck) =>
                    void startHistJob({
                      jobMode: "group-one",
                      grain: journalGrain,
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      name: row.name,
                      periodKey: part.key,
                      periodLabel: part.label,
                      recheck,
                      recheckDays: recheck && part.done && !part.weak ? groupsRecheckDays : undefined,
                    })
                  }
                  onRecheck={(row, part) =>
                    void startHistJob({
                      jobMode: "group-one",
                      grain: journalGrain,
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      name: row.name,
                      periodKey: part.key,
                      periodLabel: part.label,
                      recheck: true,
                      recheckDays: groupsRecheckDays,
                    })
                  }
                  onRecheckAll={(row) => void recheckGroup(row)}
                  onStop={() => {
                    requestStop();
                  }}
                  onDetails={(row, part) =>
                    void startHistJob({
                      jobMode: "details",
                      grain: journalGrain,
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      name: row.name,
                      periodKey: part?.key || "",
                      periodLabel: part?.label || "тема, ДЗ, комментарий",
                    })
                  }
                />
                <p className="mt-2 text-[0.72rem] text-muted">
                  Название группы раскрывает карточку на месте, без прыжка вверх. Другая группа — эта закрывается. Список без внутреннего скролла.
                </p>
              </section>
              ) : null}

              {histTab === "students" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="flex items-center gap-2 font-display text-[1.15rem]">
                  Календарь ученика
                  <LoadGuideBtn tab="students" onOpen={setLoadGuide} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Красная рамка — загрузка. Синяя — перепроверка. Списки внутри своей рамки.{" "}
                  <HintI text={HINT.tabStudents} />
                </p>
                <div className="mt-3">
                  <ScopePills
                    value={peopleStudy === "2" ? "archive" : "live"}
                    onChange={(v) => setPeopleStudy(v === "archive" ? "2" : "1")}
                    live={`Сейчас ходят · ${liveN}`}
                    arch={`Архивные клиенты · ${archN}`}
                    hintLive={HINT.scopeLive}
                    hintArch={HINT.scopeArch}
                  />
                </div>
                {peopleStudy === "2" ? (
                  <>
                    <div className="mt-6">{catalogOptsBar()}</div>
                    <div className="mt-6 flex min-w-0 w-full flex-nowrap items-center gap-2">
                    {withHint(
                      <button
                        type="button"
                        className={cn(BTN_LOAD, "min-w-[9.5rem] shrink-0", fillLoading?.kind === "archiveCount" && "ra-progress-run")}
                        disabled={busy}
                        onClick={() => void startHistJob({ jobMode: "count", school: catalogFilterJson() })}
                      >
                        {fillLoading?.kind === "archiveCount" ? "Считаю отбор…" : "Посчитать отбор"}
                      </button>,
                      HINT.archCount,
                    )}
                    {withHint(
                      <button
                        type="button"
                        className={cn(BTN_LOAD, "min-w-[17.5rem] shrink-0", fillLoading?.kind === "archiveCatalog" && "ra-progress-run")}
                        disabled={busy || offline}
                        onClick={() => void pullArchiveCatalog()}
                      >
                        Загрузить архив клиентов из Alfa
                      </button>,
                      HINT.archCatalog,
                    )}
                    {withHint(
                      <button
                        type="button"
                        className={cn(BTN_GHOST, "shrink-0")}
                        disabled={fillLoading?.kind !== "archiveCatalog"}
                        onClick={() => {
                          requestStop();
                        }}
                      >
                        Стоп
                      </button>,
                      HINT.stop,
                    )}
                    <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note ? catalogProgressNote(journal.note) : ""} tab={histTab} />
                    </div>
                    {journal?.lastArchivePolicy ? (
                      <p className="w-full text-[0.78rem] text-muted">
                        На диске {journal.lastArchivePolicy.disk} · были клиентами {journal.lastArchivePolicy.clients ?? "—"} · лиды в архиве {journal.lastArchivePolicy.leadsSkip ?? "—"} · ФИО {journal.lastArchivePolicy.fioOk} · без dob {journal.lastArchivePolicy.noDob} · 18+ {journal.lastArchivePolicy.adult} · были группы {journal.lastArchivePolicy.hadGroups ?? "—"} · в наборе {journal.lastArchivePolicy.working} · скрыто {journal.lastArchivePolicy.hidden}
                      </p>
                    ) : (
                      <p className="w-full text-[0.78rem] text-muted">Пока не считали: слева пусто, даже если на диске тысячи архивных карточек.</p>
                    )}
                  </>
                ) : null}
                {(() => {
                  const side = peopleStudy === "2" ? p?.archive : p?.live;
                  const done = side?.journalDone || 0;
                  const total = side?.total || (peopleStudy === "2" ? archN : liveN) || 0;
                  const run = Boolean(fillLoading?.kind === "students" || (journal?.job?.running && !journal.job.stop && journal.job.kind === "students"));
                  const cur = schoolRun?.cur || fillLoading?.label || journal?.job?.cur || "";
                  return (
                    <>
                      <ProgressBar done={done} total={total} run={run} loading={journalLoading && !journal} />
                      <div className="mt-3 flex min-w-0 w-full flex-wrap items-center gap-2">
                        <BtnCluster tone="red">
                        {withHint(
                        <button
                          type="button"
                          className={cn(BTN_RED, run && "ra-progress-run")}
                          disabled={busy}
                          onClick={() => void recheckPeople("students", peopleStudy)}
                        >
                          {run && cur ? cur : "Загрузить по одному"}
                        </button>,
                        HINT.loadOnePeople,
                        )}
                        <YearsSelect value={peopleStudy === "2" ? (archAttendYears === 2 ? "2" : "1") : peopleFromId} disabled={busy} onChange={(id) => (peopleStudy === "2" ? setArchAttendYears(id === "2" ? 2 : 1) : setPeopleFromId(id))} archiveOnly={peopleStudy === "2"} tag="" />
                        </BtnCluster>
                        <BtnCluster tone="sky">
                        {withHint(
                        <button
                          type="button"
                          className={BTN_LOAD}
                          disabled={busy}
                          onClick={() => void recheckPeople("students", peopleStudy, true)}
                        >
                          Перепроверить по одному
                        </button>,
                        HINT.recheckOnePeople,
                        )}
                        <RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : peopleRecheckDays} disabled={busy} onChange={setPeopleRecheckDays} />
                        </BtnCluster>
                        {withHint(
                        <button
                          type="button"
                          className={BTN_LOAD}
                          disabled={busy}
                          onClick={() => void slowFillPeople(peopleStudy)}
                        >
                          Медленный автодобор
                        </button>,
                        HINT.slowFill,
                        )}
                        {withHint(
                        <button type="button" className={BTN_GHOST} disabled={busy && run} onClick={() => void probePeople(peopleStudy)}>
                          Сверить счёт
                        </button>,
                        HINT.probe,
                        )}
                        {withHint(
                        <button
                          type="button"
                          className={BTN_GHOST}
                          disabled={!run && !schoolRun}
                          onClick={() => {
                            requestStop();
                          }}
                        >
                          Стоп
                        </button>,
                        HINT.stop,
                        )}
                        <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note} tab={histTab} />
                      </div>
                      <PeopleFillList
                        rows={side?.people || []}
                        kind="students"
                        busy={fillLoading?.kind === "students" && Boolean(fillLoading.customerId)}
                        loadingCid={fillLoading?.kind === "students" ? fillLoading.customerId : undefined}
                        years={<YearsSelect value={peopleStudy === "2" ? (archAttendYears === 2 ? "2" : "1") : peopleFromId} disabled={busy} onChange={(id) => (peopleStudy === "2" ? setArchAttendYears(id === "2" ? 2 : 1) : setPeopleFromId(id))} archiveOnly={peopleStudy === "2"} small tag="" />}
                        windowSel={<RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : peopleRecheckDays} disabled={busy} onChange={setPeopleRecheckDays} small />}
                        onLoad={(row) => void loadPerson(row, "students", peopleStudy)}
                        onRecheck={(row) => void loadPerson(row, "students", peopleStudy, true)}
                        onFullHistory={(row) => void loadPerson(row, "students", peopleStudy, false, "2015-01-01")}
                        onResetHistory={(row) => void resetPersonHistory(row)}
                        onHole={(row, on) => void holeMark(row, on)}
                        onStop={() => {
                          requestStop();
                        }}
                      />
                    </>
                  );
                })()}
              </section>
              ) : null}

              {histTab === "money" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="flex items-center gap-2 font-display text-[1.15rem]">
                  Деньги на карточке
                  <LoadGuideBtn tab="money" onOpen={setLoadGuide} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Как шаг 2: красная «по одному», потом годы. Товары не грузим. Сумма — шаг 5.{" "}
                  <HintI text={HINT.tabMoney} />
                </p>
                <div className="mt-3">
                  <ScopePills
                    value={peopleStudy === "2" ? "archive" : "live"}
                    onChange={(v) => setPeopleStudy(v === "archive" ? "2" : "1")}
                    live={`Сейчас ходят · ${liveN}`}
                    arch={`Архивные клиенты · ${archN}`}
                    hintLive={HINT.scopeLive}
                    hintArch={HINT.scopeArch}
                  />
                </div>
                {peopleStudy === "2" ? (
                  <p className="mt-3 text-[0.78rem] text-muted">
                    Набор шага 2 · {journal?.lastArchivePolicy?.working ?? archN} человек. Фильтры здесь не меняются. Сначала календарь, потом касса за тот же год/два.
                    {!journal?.lastArchivePolicy ? " Отбор ещё не считали — шаг 2, «Посчитать отбор»." : ""}
                  </p>
                ) : null}
                {(() => {
                  const side = peopleStudy === "2" ? p?.archive : p?.live;
                  const done = side?.cardDone || 0;
                  const total = side?.total || (peopleStudy === "2" ? archN : liveN) || 0;
                  const run = Boolean(fillLoading?.kind === "balance" || (journal?.job?.running && !journal.job.stop && journal.job.kind === "balance"));
                  const cur = schoolRun?.cur || fillLoading?.label || journal?.job?.cur || "";
                  return (
                    <>
                      <ProgressBar done={done} total={total} run={run} loading={journalLoading && !journal} />
                      <div className="mt-3 flex min-w-0 w-full flex-wrap items-center gap-2">
                        <BtnCluster tone="red">
                        {withHint(
                        <button
                          type="button"
                          className={cn(BTN_RED, run && "ra-progress-run")}
                          disabled={busy}
                          onClick={() => void recheckPeople("balance", peopleStudy)}
                        >
                          {run && cur ? cur : "Загрузить по одному"}
                        </button>,
                        HINT.loadOneMoney,
                        )}
                        <YearsSelect value={peopleStudy === "2" ? (archAttendYears === 2 ? "2" : "1") : moneyFromId} disabled={busy || peopleStudy === "2"} onChange={(id) => (peopleStudy === "2" ? setArchAttendYears(id === "2" ? 2 : 1) : setMoneyFromId(id))} archiveOnly={peopleStudy === "2"} hint={HINT.yearsMoney} />
                        </BtnCluster>
                        <BtnCluster tone="sky">
                        {withHint(
                        <button
                          type="button"
                          className={BTN_LOAD}
                          disabled={busy}
                          onClick={() => void recheckPeople("balance", peopleStudy, true)}
                        >
                          Перепроверить по одному
                        </button>,
                        HINT.recheckOneMoney,
                        )}
                        <RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : moneyRecheckDays} disabled={busy} onChange={setMoneyRecheckDays} />
                        </BtnCluster>
                        {withHint(
                        <button
                          type="button"
                          className={BTN_GHOST}
                          disabled={!run && !schoolRun}
                          onClick={() => {
                            requestStop();
                          }}
                        >
                          Стоп
                        </button>,
                        HINT.stop,
                        )}
                        <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note} tab={histTab} />
                      </div>
                      <PeopleFillList
                        rows={side?.people || []}
                        kind="balance"
                        busy={offline || (fillLoading?.kind === "balance" && Boolean(fillLoading.customerId))}
                        loadingCid={fillLoading?.kind === "balance" ? fillLoading.customerId : undefined}
                        years={<YearsSelect value={peopleStudy === "2" ? (archAttendYears === 2 ? "2" : "1") : moneyFromId} disabled={busy || peopleStudy === "2"} onChange={(id) => (peopleStudy === "2" ? setArchAttendYears(id === "2" ? 2 : 1) : setMoneyFromId(id))} archiveOnly={peopleStudy === "2"} hint={HINT.yearsMoney} small />}
                        windowSel={<RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : moneyRecheckDays} disabled={busy} onChange={setMoneyRecheckDays} small />}
                        onLoad={(row) => void loadPerson(row, "balance", peopleStudy)}
                        onRecheck={(row) => void loadPerson(row, "balance", peopleStudy, true)}
                        onResetHistory={(row) => void resetPersonPay(row)}
                        onStop={() => {
                          requestStop();
                        }}
                      />
                    </>
                  );
                })()}
              </section>
              ) : null}

              {histTab === "audit" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="flex items-center gap-2 font-display text-[1.15rem]">
                  Сверка остатка с Alfa
                  <LoadGuideBtn tab="audit" onOpen={setLoadGuide} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Текущие и рабочий архив шага 2 — разные таблетки. Alfa = общий остаток шапки. Совпало — справа.{" "}
                  <HintI text={HINT.tabAudit} />
                </p>
                {(() => {
                  const live = p?.live;
                  const archPeople = p?.archive?.people || [];
                  const hits = journal?.lastAudit?.rows || [];
                  const by = new Map(hits.map((h) => [h.cid, h]));
                  const livePeople = live?.people || [];
                  const seenCid = new Set<number>();
                  const rows: AuditUiRow[] = [];
                  const source = peopleStudy === "2" ? archPeople : livePeople;
                  for (const r of source) {
                    if (seenCid.has(r.cid)) continue;
                    seenCid.add(r.cid);
                    rows.push(asAuditRow(r, by.get(r.cid)));
                  }
                  const run = fillLoading?.kind === "audit";
                  const clientRows = rows.filter((r) => peopleStudy === "2" || auditRole(r) === "клиент");
                  const leadN = rows.filter((r) => auditRole(r) === "лид").length;
                  const scanned = clientRows.filter((r) => r.seen).length;
                  const okN = clientRows.filter((r) => rowMatched(r)).length;
                  const mismatchN = clientRows.filter((r) => r.seen && !rowMatched(r) && !auditFail(r.codes)).length;
                  const failN = rows.filter((r) => r.seen && auditFail(r.codes)).length;
                  const waitN = rows.filter((r) => !r.seen).length;
                  const holeN = mismatchN;
                  const showN = clientRows.filter((r) => auditSeg(r).id === "show").length;
                  const total = peopleStudy === "2" ? archPeople.length : livePeople.length;
                  const archSide = p?.archive;
                  const archNeedCal = Math.max(0, (archSide?.total || 0) - (archSide?.journalDone || 0));
                  const archNeedPay = Math.max(0, (archSide?.total || 0) - (archSide?.cardDone || 0));
                  const archBlocked = peopleStudy === "2" && (!archN || archNeedCal > 0 || archNeedPay > 0);
                  return (
                    <>
                      <div className="mt-3">
                        <ScopePills
                          value={peopleStudy === "2" ? "archive" : "live"}
                          onChange={(v) => setPeopleStudy(v === "archive" ? "2" : "1")}
                          live={`Сейчас ходят · ${liveN}`}
                          arch={`Архивные клиенты · ${archN}`}
                          hintLive={HINT.scopeLive}
                          hintArch={HINT.scopeArch}
                        />
                      </div>
                      {peopleStudy === "2" ? (
                        <p className="mt-2 text-[0.78rem] text-muted">
                          Тот же набор шага 2 · {archN}. Архивных лидов нет. Сверка после календаря и кассы.
                          {archBlocked ? " Сначала шаги 2 и 4 по этому набору." : ""}
                        </p>
                      ) : null}
                      <p className="mt-3 text-sm">
                        {peopleStudy === "2" ? "архив" : "текущих"} {total} · клиентов сверено {scanned} · совпало {okN} · не сошлось {mismatchN} · лидов {leadN} · нет ответа {failN} · ещё не сверяли {waitN}{run ? " · очередь идёт, цифры догоняют" : ""}{showN ? ` · показ ${showN}` : ""}
                      </p>
                      <div className="mt-3 flex min-w-0 w-full flex-nowrap items-center gap-2">
                        {withHint(
                          <button
                            type="button"
                            className={cn(BTN_RED, "min-w-[14rem] shrink-0", run && "ra-progress-run")}
                            disabled={busy || offline || archBlocked}
                            onClick={() => void pullAudit()}
                          >
                            {peopleStudy === "2" ? "Сверить рабочий архив" : "Сверить всех текущих"}
                          </button>,
                          HINT.auditAll,
                        )}
                        <RecheckDaysSelect value={journal?.job?.running ? clampRecheckDays(journal.job.recheckDays) : peopleRecheckDays} disabled={busy} onChange={setPeopleRecheckDays} />
                        {withHint(
                          <button
                            type="button"
                            className={cn(BTN_GHOST, "shrink-0")}
                            disabled={!run && !schoolRun}
                            onClick={() => {
                              requestStop();
                            }}
                          >
                            Стоп
                          </button>,
                          HINT.stop,
                        )}
                        <ServerJobStrip job={journal?.job as ServerJob | undefined} note={journal?.note} tab={histTab} />
                      </div>
                      <AuditFillList
                        rows={rows}
                        busy={offline || run}
                        loadingCid={run ? fillLoading?.customerId : undefined}
                        onRecheck={(row) => void pullAudit({ customerId: row.cid, branchId: row.branchId, name: row.name })}
                      />
                    </>
                  );
                })()}
              </section>
              ) : null}
            </div>
          );
        })()}
      </Card>
      ) : null}

      {crmTab === "queue" ? (
      <Card
        title="Очередь в Alfa"
        hint={
          alfaMode === "offline"
            ? "Связь выключена — правки копятся на сайте и уйдут, когда включите Alfa."
            : "Уже сохранено у нас. Сейчас уйдёт в Alfa — рассылки сработают."
        }
      >
        {queue?.jobs?.length ? (
          <ul className="space-y-1.5">
            {queue.jobs.slice(0, 12).map((j, i) => (
              <li key={`${j.op}-${j.entityId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {actorLabel(actorOf(j.actor), humanName)}
                </span>
                <span className="font-semibold">{exportOpLabel(j.op as CrmExportOp)}</span>
                {j.tries ? <span className="text-[0.72rem] text-rose-700">повтор {j.tries + 1}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Всё отправлено — Alfa ничего не ждёт.</p>
        )}
        <p className="mt-3 text-[0.75rem] text-muted">
          {queue?.exportPending ? `Ждут отправки: ${queue.exportPending}.` : "Очередь пуста."}
          {queue?.exportBusy ? " Отправляю…" : ""}
          {queue?.exportNote ? ` · ${queue.exportNote}` : ""}
          {queue?.pending ? ` · подтягиваю состав групп` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="h-9 rounded-full bg-black/8 px-4 text-sm" disabled={busy} onClick={() => void tickQueue(false)}>
            {alfaMode === "offline" ? "Сейчас без связи" : "Отправить в Alfa"}
          </button>
        </div>
      </Card>
      ) : null}

      {crmTab === "funnel" ? (
      <>
      <Card
        title="Воронка продаж"
        hint="Как в AlfaCRM: Настройки → Воронки продаж. «Не разобрано» системный, его нельзя сдвинуть. Остальные — перетащите или кнопками вверх/вниз."
      >
        <div className="rounded-xl p-px ring-1 ring-black/8"><div className="overflow-hidden rounded-[0.7rem]">
          <table className="w-full text-left">
            <thead className="bg-black/[0.03] text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2">Этап</th>
                <th className="px-2 py-2">Цвет</th>
                <th className="px-2 py-2 text-right">ID</th>
                <th className="px-2 py-2 text-right">Порядок</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/6 bg-black/[0.02]">
                <td className="px-3 py-2 text-center text-muted">—</td>
                <td className="px-2 py-2 text-[0.88rem] font-semibold" style={{ color: unsorted.color }}>
                  {unsorted.name}
                  <span className="ml-2 text-[0.72rem] font-normal text-muted">системный</span>
                </td>
                <td className="px-2 py-2">
                  <span className="inline-block h-4 w-4 rounded-full ring-1 ring-black/15" style={{ background: unsorted.color }} />
                </td>
                <td className="px-2 py-2 text-right text-[0.8rem] text-muted">0</td>
                <td className="px-2 py-2 text-right text-[0.75rem] text-muted">фиксирован</td>
              </tr>
              {named.map((col) => (
                <tr
                  key={col.id}
                  draggable
                  onDragStart={(e) => {
                    dragId.current = col.id;
                    e.dataTransfer.setData("text/plain", String(col.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain") || dragId.current);
                    if (!from || from === col.id) return;
                    const ids = stages.map((s) => s.id).filter((id) => id !== from);
                    const at = ids.indexOf(col.id);
                    if (at < 0) return;
                    ids.splice(at, 0, from);
                    void sortStages(ids);
                  }}
                  className="cursor-grab border-t border-black/6 hover:bg-black/[0.03] active:cursor-grabbing"
                >
                  <td className="px-3 py-2 text-center text-muted">⇅</td>
                  <td className="px-2 py-2">
                    {editId === col.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => void saveName(col.id, editName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-8 w-full max-w-[16rem] rounded-lg bg-white px-2 text-[0.88rem] font-semibold ring-1 ring-black/10"
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left text-[0.88rem] font-semibold hover:underline"
                        style={{ color: col.color }}
                        onClick={() => {
                          setEditId(col.id);
                          setEditName(col.name);
                        }}
                      >
                        {col.name}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex gap-1">
                      {CRM_STAGE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.hex}
                          onClick={() => void saveColor(col.id, c.hex)}
                          className={cn(
                            "h-4 w-4 rounded-full ring-1 ring-black/15",
                            col.color.toLowerCase() === c.hex.toLowerCase() && "ring-2 ring-fg",
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-[0.8rem] text-muted">{col.id}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, -1)}
                    >
                      вверх
                    </button>
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, 1)}
                    >
                      вниз
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-0.5 text-[0.75rem] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                      onClick={() => void removeStage(col.id, col.name)}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1">
            <span className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Новый этап</span>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addStage();
              }}
              placeholder="Например: Запись на пробное"
              className="mt-1 h-10 w-full rounded-full bg-surface-2 px-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <span className="inline-flex items-center gap-1 pb-2">
            {CRM_STAGE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAddColor(c.hex)}
                className={cn("h-5 w-5 rounded-full ring-1 ring-black/15", addColor === c.hex && "ring-2 ring-fg")}
                style={{ background: c.hex }}
              />
            ))}
          </span>
          <button
            type="button"
            disabled={busy || !addName.trim()}
            onClick={() => void addStage()}
            className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
          >
            Добавить в CRM
          </button>
        </div>
        {msg ? <p className={cn("mt-3 text-sm font-semibold", msg.includes("не") || msg.includes("Не") ? "text-rose-700" : "text-emerald-800")}>{msg}</p> : null}
      </Card>

      <Card
        title="Автоматизация воронки продаж"
        hint="Сайт и карточка сами двигают этап в AlfaCRM. Ученика (is_study=1) и архив не трогает. С «Оплатил» назад в группу не возвращает."
      >
        <ul className="space-y-3">
          {(
            [
              ["siteOn", "siteStageId", "Заявка с сайта", "Форма пробного и ассистент"],
              ["groupOn", "groupStageId", "Добавили в группу", "Карточка клиента → группа"],
              ["tariffOn", "tariffStageId", "Абонемент или оплата", "Выдали абонемент или провели платёж"],
            ] as const
          ).map(([onKey, stageKey, title, hint]) => (
            <li key={onKey} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={auto[onKey]}
                onClick={() => void saveAuto({ ...auto, [onKey]: !auto[onKey] })}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition",
                  auto[onKey] ? "bg-primary" : "bg-black/15",
                )}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", auto[onKey] ? "left-5" : "left-0.5")} />
              </button>
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-[0.75rem] text-muted">{hint}</p>
              </div>
              <select
                className="h-9 rounded-full bg-white px-3 text-sm ring-1 ring-black/8"
                disabled={!auto[onKey]}
                value={auto[stageKey]}
                onChange={(e) => void saveAuto({ ...auto, [stageKey]: Number(e.target.value) })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto.skipIfPaid}
            onChange={(e) => void saveAuto({ ...auto, skipIfPaid: e.target.checked })}
          />
          Не возвращать с «Оплатил», если снова добавили в группу
        </label>
      </Card>
      </>
      ) : null}

      {crmTab === "cache" ? (
      <Card
        title="Кэш сайта"
        hint="Что читать из хранилища админки, а что каждый раз из AlfaCRM. Оперативные данные — на лету. Абонементы учеников: счётчик сразу с диска сайта, без пакетов. Сверка CRM — фоном по филиалам."
      >
        <ul className="space-y-2">
          {CACHE_KIND_META.map((k) => {
            const rule = cache?.rules[k.id as CacheKind] || { cache: true, ttlMin: 10 };
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.cache}
                  title={rule.cache ? "Читать из кэша сайта" : "Всегда из CRM"}
                  onClick={() =>
                    cache &&
                    void saveCache({
                      ...cache,
                      rules: { ...cache.rules, [k.id]: { ...rule, cache: !rule.cache } },
                    })
                  }
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition", rule.cache ? "bg-primary" : "bg-black/15")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", rule.cache ? "left-5" : "left-0.5")} />
                </button>
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold">{k.title}</p>
                  <p className="text-[0.75rem] text-muted">{k.hint}</p>
                  <p className="text-[0.72rem] text-muted">{rule.cache ? `кэш ${rule.ttlMin} мин · ${k.liveHint}` : `на лету · ${k.liveHint}`}</p>
                </div>
                <label className="text-[0.75rem] text-muted">
                  TTL
                  <select
                    className="ml-2 h-9 rounded-full bg-white px-3 text-sm text-fg ring-1 ring-black/8"
                    disabled={!rule.cache}
                    value={rule.ttlMin}
                    onChange={(e) =>
                      cache &&
                      void saveCache({
                        ...cache,
                        rules: { ...cache.rules, [k.id]: { ...rule, ttlMin: Number(e.target.value) } },
                      })
                    }
                  >
                    {[5, 10, 15, 30, 60, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} мин
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
        {cache?.overlayAt ? (
          <p className="mt-3 text-[0.75rem] text-muted">
            Последняя сверка абонементов: {new Date(cache.overlayAt).toLocaleString("ru-RU")}
            {cache.overlayTotal ? ` · ${cache.overlayNext}/${cache.overlayTotal} групп` : ""}
            {queue?.exportPending ? ` · выгрузка в Alfa ${queue.exportPending}` : ""}
            {queue?.pending && !queue.exportPending ? ` · в очереди ${queue.pending}` : ""}
            {queue?.lastNote ? ` · ${queue.lastNote}` : ""}
          </p>
        ) : (
          <p className="mt-3 text-[0.75rem] text-muted">
            Сверки абонементов ещё не было — пакеты идут сами, вкладка Клиенты их не обязана держать открытой.
            {queue?.exportPending ? ` Выгрузка в Alfa: ${queue.exportPending}.` : ""}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(false)}
          >
            Пакет сейчас
          </button>
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(true)}
          >
            Круг с начала
          </button>
        </div>
      </Card>
      ) : null}

      {crmTab === "branches" ? (
      <Card title="Филиалы" hint="Лиды и клиенты в AlfaCRM привязаны к филиалу. На сайте тот же список.">
        <ul className="divide-y divide-black/6">
          {([1, 2, 3, 4] as const).map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{CRM_BRANCH[id]?.short}</span>
                <span className="ml-2 text-muted">{CRM_BRANCH[id]?.name}</span>
              </span>
              <span className="tabular-nums text-muted">ID {id}</span>
            </li>
          ))}
        </ul>
      </Card>
      ) : null}

      {crmTab === "funnel" ? (
      <Card title="Какие карточки попадают в воронку">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Новая заявка</dt>
            <dd className="mt-1 text-muted">is_study = 0, обычно сразу этап «Разбирается». Появляется и в API, и на доске CRM.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Клиент → «Сделать лидом»</dt>
            <dd className="mt-1 text-muted">Пишем is_study=0 и помечаем «на воронке». Список клиентов сразу убирает карточку, воронка — берёт. Если Alfa оставила is_study=1, сайт всё равно считает лидом.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Архив</dt>
            <dd className="mt-1 text-muted">is_study = 2 или removed. С воронки снимается, кнопка «Загрузить „Архив“» на вкладке Клиенты.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Ключ API</dt>
            <dd className="mt-1 text-muted">Хост, почта и ключ v2api — в разделе ключей интеграций (AlfaCRM). Без них воронка не читается.</dd>
          </div>
        </dl>
      </Card>
      ) : null}
      </div>
    </div>
  );
}