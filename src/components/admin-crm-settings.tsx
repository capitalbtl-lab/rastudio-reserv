"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
        className="flex h-[8px] w-[8px] cursor-help items-center justify-center rounded-full bg-black/40 text-[5px] font-bold leading-none text-white"
        aria-label="Подсказка"
      >
        i
      </span>
      <span className="pointer-events-none invisible absolute left-0 top-[calc(100%+6px)] z-[90] w-[min(26rem,calc(100vw-2rem))] rounded-xl bg-zinc-900 px-3.5 py-3 text-left text-[0.72rem] font-normal leading-[1.45] text-white opacity-0 shadow-xl group-hover/hi:visible group-hover/hi:opacity-100 group-focus-within/hi:visible group-focus-within/hi:opacity-100">
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

const HINT = {
  disk: "Эта кнопка не ходит в AlfaCRM и ничего там не меняет. Она только открывает то, что уже лежит у нас на сервере: списки учеников и групп. Если после нажатия список пустой, подождите пару секунд и нажмите ещё раз — ответ иногда приходит не с первого раза. Пока список не появился, красную «Загрузить по одному» лучше не жать: программе некого ставить в очередь. Это безопасный первый шаг любого сеанса загрузки истории. Данные родителей и детей в Alfa не затрагиваются. Если список уже на экране, повторно жать не нужно.",
  loadOnePeople: "Красная кнопка идёт по ученикам слева сверху вниз, строго по одному. Сначала спрашивает Alfa, сколько занятий в журнале человека. Если на нашем диске уже столько же — качку пропускает и переносит карточку вправо, в «загрузка завершена». Если в Alfa занятий больше — дописывает недостающие на диск и не создаёт дубли по номеру урока. Между людьми пауза пять секунд, чтобы Alfa не отшила пачкой запросов. Насколько далеко в прошлое смотреть, задаёт список «годы» справа от кнопки. «Стоп» прерывает очередь после текущего человека. В Alfa ничего не записывается и не удаляется — это только чтение журнала на сайт. Жёлтой карточке «в Alfa больше» часто нужно окно «с начала · 2015» или отдельная кнопка «Загрузить всю историю».",
  years: "Список «годы» говорит программе, с какой давности читать журнал ученика. «С начала · 2015» берёт всю историю, как сверка счёта в Alfa, и нужно старым карточкам. «7 лет» — примерно с 2019: быстрее, но 2016–2018 годы не попадут. «3 года» и «1 год» ещё короче и годятся, если человек ходит недавно. Выбор действует на красную «по одному» и на «Добрать» у ученика. На уже лежащие на диске занятия не влияет: старое не стирается. В Alfa ничего не отправляет. Если жёлтая карточка не догружается — поставьте «с начала · 2015» и нажмите ещё раз.",
  probe: "«Сверить счёт» идёт по тем, у кого ещё нет цифры Alfa или карточка жёлтая «в Alfa больше». По одному человеку, пауза 5 секунд. Один лёгкий запрос: сколько занятий с 2015 года. Потом сравнивает с диском. Если цифры разные — карточка жёлтая. Если сошлись — уйдёт вправо. В Alfa ничего не пишет. Если список пустой, сначала «Показать список с диска». Стоп прерывает очередь после текущего.",
  stop: "Стоп останавливает текущую очередь. Текущий человек или группа допишет свой запрос, а следующий уже не стартует. Уже записанное на диск не откатывается — это не «отмена», а пауза. После стопа красную можно нажать снова: пойдёт со следующих, кто ещё слева. Если кнопка серая, сейчас никто не грузится. В Alfa ничего не удаляет и не сохраняет. Можно спокойно отойти и продолжить позже.",
  fullHist: "Эта кнопка только на жёлтой старой карточке, когда в Alfa занятий больше, чем у нас. Она качает журнал с 1 января 2015 года, а не за последние семь лет. Нужна, если человек ходил в 2016–2018, а обычная качка этого не видит. Пишет только на наш диск, дубли по номеру занятия не создаёт. В Alfa не отправляет и оплаты не трогает. Если за один раз счёт не сошёлся, нажмите ещё раз — продолжит с того же человека. Пока грузится другой ученик, кнопка подождёт.",
  loadCal: "Загружает личный календарь именно этого ученика из Alfa на диск. Сначала сверка, сколько занятий в Alfa, потом добор недостающих. Окно лет — как в списке «годы» наверху экрана. Если карточка жёлтая и человек старый, лучше «Загрузить всю историю»: она берёт с 2015. В Alfa ничего не пишет, не проводит урок и не ставит оценку. Пока идёт другой ученик, эта кнопка не стартует вторую качку параллельно. После успеха карточка должна позеленеть и уйти вправо.",
  recheckCal: "Ещё раз спрашивает Alfa по этому ученику и дописывает новое на диск. Старые строки не затирает: тема, домашнее задание и сумма списания остаются, если из Alfa пришло пусто. Нужна, если после первой загрузки появились занятия или вы не уверены в счёте. Сравнение идёт по номеру урока, поэтому две одинаковые строки не размножаются. В Alfa ничего не сохраняет. Если карточка уже зелёная, это безопасная проверка, а не повторная полная качка с нуля. Можно жать точечно, не гоняя всю очередь слева.",
  loadOneGroups: "Красная кнопка идёт по группам слева по одной, как «по одному» у учеников. Только та колонка, что открыта: «Сейчас идут» или «Архивные». Берёт выбранную порцию — квартал, полугодие или год — и читает явки из Alfa на диск. Следующая группа не стартует, пока эта порция не закрылась. Стоп прерывает очередь после текущей. В Alfa расписание не меняется. Если школа выбрана в фильтре, очередь только по ней. Это шаг 2: групповые явки, не личный календарь и не касса.",
  grain: "Это размер порции журнала группы, подписанный «годы», чтобы ряд кнопок совпадал с шагом 1. «Квартал» — самый безопасный: одно нажатие не закрывает всю историю сразу. «Полугодие» больше и быстрее. «Год» имеет смысл только у молодых групп, которым несколько месяцев. У старых английский на полгода не надо грузить с 2018 года — срок группы режет лишнее. Это не «с 2015», а нарезка журнала группы. Выбор действует на красную кнопку сверху и на кнопки порции в карточке группы. В Alfa ничего не отправляет.",
  archPupils: "Смотрит карточки учеников той выборки, что на шаге 1: «Сейчас ходят» или рабочий архив — в одном прогоне не смешивает. Собирает номера групп, где они числились. Живые группы из этого списка отбрасывает. Остальные — архив для старого остатка. Закон раздела: только по одной группе, пауза 5 секунд, пакетом нельзя. Очередь сама идёт, «Стоп» после текущей. Журнал кварталов сам не стартует. В Alfa ничего не создаёт.",
  archAll: "Тянет из Alfa архивные группы филиала, не только тех, кто есть среди ваших учеников. Поэтому программа спрашивает подтверждение. Живое расписание не трогает. Журнал явок сам не качает — появляется только список групп. Закон раздела: один филиал, пауза 5 секунд, пакетом нельзя. «Стоп» после текущего филиала. Дальше каждую архивную группу грузите красной «по одному» или по кварталу в карточке. В Alfa ничего не пишет. Если нужен только архив ваших людей, кнопка «Архив групп учеников» безопаснее и уже.",
  life: "Спрашивает Alfa, с какого и по какое число у группы реально был журнал. Чтобы не грузить английский за десять лет, если курс шёл полгода. Найденный срок пишется на карточку группы на диске. В Alfa шаблон группы не меняет. Закон раздела: одна группа, пауза 5 секунд, пакетом нельзя. «Стоп» после текущей. Если срок не нашли, группа остаётся «без срока» — тогда грузите видимые кварталы руками. После сроков красная кнопка берёт только overlapping порции. Это подготовка, не загрузка явок.",
  school: "Фильтр списка: видны группы одной школы или сразу все. Счётчик «загрузка завершена» считается только по видимым. Красная «по одному» тоже идёт по этому списку, а не по скрытым. Сами данные кнопка не качает и в Alfa не ходит. Если школа не выбрана, очередь по всем группам — это дольше. Смените школу, когда закончили одну, чтобы не смешивать робототехнику с английским. На уже скачанные явки фильтр не влияет.",
  loadAttend: "Читает явки этой порции группы из Alfa на диск: кто был, кто пропуск, кто опоздал. Чужие кварталы не затирает. Если пакет оборвался, карточка квартала жёлтая — нажмите ещё раз, допишет. В Alfa журнал не проводит, не отменяет и оценки не ставит. После зелёных явок можно отдельно взять тему, домашнее задание и комментарий. Без явок детали грузить нельзя: не к чему их привязать. Одна порция — один безопасный шаг, вся история группы сразу не улетает.",
  loadDetails: "После зелёных явок добирает по урокам тему, домашнее задание, комментарий педагога и таблицу учеников. Это не явки и не касса. Alfa только читается, ничего не проводится. Если темы в Alfa нет, кнопка всё равно помечает «смотрели», чтобы не крутить вечно. Чужие кварталы не трогает. Жать имеет смысл, когда явки уже зелёные, иначе будет «Сначала явки». На сайт это нужно, чтобы в карточке группы были не только галочки присутствия.",
  loadOneMoney: "Красная кнопка ставит очередь на сервер и сразу отпускает сайт. Дальше касса идёт на диске сама: по одному человеку, пауза 5 с. Вкладку можно закрыть — прогресс не пропадёт. Направо только если остаток на диске совпал с шапкой Alfa ±1 ₽. Если страницы не дочитаны или Alfa не ответила — тот же id ещё раз. Календарь подгружает, только если его ещё нет. Окно лет режет занятия, не платежи. В Alfa оплаты не создаёт. Стоп прерывает очередь на сервере.",
  yearsMoney: "Те же годы, что на шаге 1: с какого времени читать журнал вместе с кассой. «С начала · 2015» нужно жёлтым старым карточкам, иначе старые списания не к чему привязать. «7 лет» быстрее и хватает тем, кто ходит с 2019. Платежи (pay) идут своим журналом Alfa, а окно лет режет занятия, к которым вяжется списание. Выбор действует на красную кнопку и на «Загрузить кассу» в карточке. В Alfa ничего не отправляет. Если остаток на карточке кажется чужим, поставьте «с начала» и перепроверьте человека.",
  loadPay: "Догружает кассу именно этого ученика: платежи и абонементы из Alfa на наш диск. Если журнала занятий не хватает, сначала доберёт явки в том же окне лет, иначе списание не к чему привязать. В Alfa платёж не проводит и чек не создаёт. Нужна, когда слева «нет кассы», а справа ещё пусто. Дубли по номеру платежа не плодит. После успеха карточка должна уйти в «загрузка завершена». Пока грузится другой человек, эта кнопка подождёт.",
  recheckPay: "Ещё раз сверяет кассу и журнал этого человека с Alfa и дописывает новое. Старые платежи не дублирует по номеру. Ошибочные строки сами в Alfa не улетают — мы только читаем. Нажмите, если остаток на карточке кажется чужим или после оплаты в кассе Alfa. Тема и ДЗ уже скачанных уроков не затираются. Это точечная проверка, не вся очередь слева. Если после сверки цифра всё равно странная, посмотрите жёлтый бейдж «в Alfa больше» и окно лет.",
  recheckOnePeople: "Синяя «Перепроверить по одному» идёт только по тем, кто уже справа: календарь на диске есть. Красную загрузку слева она не трогает. По одному человеку спрашивает Alfa ещё раз и дописывает новые занятия, если они появились. Старые строки не затирает и дубли по номеру урока не плодит. Между людьми пауза пять секунд, как у красной. «Стоп» прерывает после текущего. В Alfa ничего не пишет. Нужна, когда все уже в «загрузка завершена», но хочется убедиться, что ничего не пропустили. Если справа пусто — сначала красная кнопка.",
  recheckOneGroups: "Синяя «Перепроверить по одному» проходит живые (или архивные, если открыт архив) группы, у которых явки уже на диске. Красную загрузку слева не запускает. У каждой группы ещё раз читает выбранную порцию — квартал, полугодие или год — и дописывает дырки. Между группами пауза пять секунд. «Стоп» останавливает очередь после текущей группы. В Alfa журнал не проводится и расписание не меняется. Если группа ещё слева «требует загрузки», её берёт красная кнопка, не эта. Жать, когда список справа заполнен и нужно свериться с Alfa ещё раз.",
  recheckOneMoney: "Синяя «Перепроверить по одному» идёт по ученикам справа: у кого касса уже помечена готовой. Для каждого ещё раз читает платежи и журнал из Alfa и дописывает новое на диск. Ноль оплат — это тоже «готово», если страницы кассы кончились. Между людьми пауза пять секунд. «Стоп» прерывает очередь. В Alfa оплаты не создаёт и не удаляет. Если ученик ещё слева — его берёт красная «Загрузить по одному». Красная не переходит к следующему, пока касса этого человека не дочитана (ещё страницы или Alfa не ответила — пауза 5 с и тот же id). Эта кнопка нужна, когда 346 уже справа, и вы хотите пройти всех и снять голубое «есть неперепроверенные».",
  tabStudents: "Первый шаг загрузки истории. Здесь качается личный календарь ученика: все его занятия из Alfa на наш диск. Сначала покажите список с диска, потом красной кнопкой идите по людям слева. Список «годы» задаёт, насколько далеко в прошлое смотреть. Жёлтая карточка значит: в Alfa занятий больше, чем у нас. Зелёная — счёт сошёлся. В Alfa ничего не пишется. Деньги и групповые явки — следующие шаги, этот экран их не трогает.",
  tabGroups: "Второй шаг. Здесь качаются явки по группам: кто был на уроке, а не личный календарь человека. Сначала красная «по одному», потом список «годы» — это размер порции: квартал, полугодие или год. Архив групп и сроки жизни курса — отдельные кнопки ниже, их лучше нажать до массовой качки. Фильтр школы сужает очередь. В Alfa журнал не проводится. Без этого шага на сайте будут люди, но без отметок в группе. Тема и ДЗ грузятся уже в карточке группы, после явок.",
  tabMoney: "Третий шаг, «деньги на карточке». Здесь к ученику дописываются платежи и абонементы из Alfa. Красная «по одному» идёт как на шаге 1, справа те же годы. Если журнала занятий ещё нет, касса сначала доберёт календарь, иначе списание не к чему привязать. В Alfa оплаты не создаются. Жёлтая карточка — в Alfa занятий больше, чем на диске. После шага на карточке ученика должен быть понятный остаток. Это не зарплата педагогов и не очередь в Alfa, а чтение кассы на сайт.",
  tabAudit: "Четвёртый шаг — сверка остатка. Закон раздела: только по одному, пауза 5 секунд, пакетом нельзя. Берёт всех, кто сейчас учится. Для каждого читает из Alfa общий остаток с шапки карточки, считает число в «Клиентах» и кассу. Если цифры разошлись — добирает журнал или кассу только этого человека. В Alfa ничего не пишет. Совпало — справа. Не совпало — слева с причиной.",
  auditAll: "Красная кнопка проходит всех текущих по одному. Между людьми пауза пять секунд, в Alfa один запрос в полёте. Сравнивает число на карточке «Клиенты» с общим остатком шапки Alfa. Если не сошлось — догружает явки или оплаты только этого номера. Цифру из Alfa в кассу не записывает. Стоп прерывает после текущего.",
  auditRecheck: "Ещё раз сверяет только этого ученика с общим остатком шапки Alfa. Читает карточку, при расхождении добирает его журнал или кассу. Чужих не трогает, зелёные шаги 1 и 3 у остальных не сбрасывает. В Alfa ничего не сохраняет. Нужна, если человек слева с причиной или вы только что правили его кассу. После совпадения карточка уйдёт вправо, даже если есть непроведённые уроки с ценой. Если снова formula — это показ в «Клиентах», не его личная дыра.",
  scopeLive: "Показывает тех, кто сейчас ходит: статус «обучается» в Alfa. Красная очередь и сверка идут только по этому списку, архивных не трогают. Цифра на кнопке — сколько таких людей в выборке. Переключение само ничего не качает и в Alfa не пишет. Если нужен бывший ученик, соседняя кнопка «Архивные клиенты». Можно спокойно прыгать туда-сюда, списки уже на диске. Для кассы и календаря это один и тот же переключатель.",
  scopeArch: "Показывает рабочий архив — бывшие ученики после «Посчитать отбор». Красная очередь только по этому набору, голые телефоны сюда не попадают. Если слева пусто — нажмите «Посчитать отбор»: правило с диска, Alfa не трогает. Скрытые ищутся в Клиентах по телефону. Жёлтые карточки чаще — берите «с начала · 2015».",
  archCount: "Считает рабочий архив только с диска, в Alfa не ходит и ничего там не пишет. Берёт группы текущих учеников и ищет в архиве тех, кто в тех же группах числился, с нормальным ФИО, не 18+ (если есть дата рождения). Голые телефоны и ошибочные звонки остаются скрытыми на диске, но не в списке. Уже попавшие в набор повторным нажатием не выкидываются. После отчёта красная «по одному» идёт только по рабочим. Если на диске архивных карточек нет — сначала «Загрузить архив клиентов из Alfa».",
  archCatalog: "Название кнопки не меняется. Закон раздела: одна карточка, пауза 5 секунд. Календарь и касса этой кнопкой не грузятся. Фильтры на виду. Телефон и «тест» не пишем. Кто записался — сразу слева. При сбое Alfa ждёт 5 с и повторяет. Стоп после текущей. В Alfa не пишет.",
  scopeLiveGroups: "Показывает живые группы, которые идут по расписанию сейчас. Красная «по одному» и счётчики считают только их. Архивные группы на этом виде скрыты, их явки сами не качаются. Переключение в Alfa ничего не пишет. Если нужна старая группа для баланса, нажмите «Архивные группы». Школа выше по-прежнему фильтрует этот список. Это вид, а не загрузка.",
  scopeArchGroups: "Показывает архивные группы, которых уже нет в живом расписании. Их явки нужны, чтобы на карточке ученика сошёлся старый баланс. Список появляется после кнопок «Архив групп учеников» или «Загрузить архивные группы». Красная очередь на этом виде идёт по архиву. В Alfa группу не восстанавливает. Если список пустой — сначала подтяните архив, потом грузите кварталы как у живых.",
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

function ServerJobStrip({ job }: { job?: ServerJob | null }) {
  if (!job) return null;
  const run = Boolean(job.running) && !job.stop;
  const n = Number(job.n) || 0;
  const total = Number(job.total) || 0;
  const waits = Number(job.waits) || 0;
  const cur = String(job.cur || "").trim();
  const msg = String(job.msg || "").trim();
  if (!run && !cur && !msg) return null;
  const pct = total > 0 ? Math.min(100, Math.round((n / Math.max(total, 1)) * 100)) : run ? 12 : 0;
  const next = String(job.next || "").trim();
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10">
      <p className="truncate text-sm font-semibold">{run ? `На сервере: ${cur || "работаем"}` : msg || "Сервер свободен"}</p>
      <p className="mt-0.5 truncate text-[0.78rem] text-muted">
        {total ? `${n} из ${total}` : n ? `прошло ${n}` : run ? "очередь с диска" : ""}
        {waits ? ` · Alfa не отвечает, пауза ${waits}/8` : ""}
        {run && next && !cur.includes(next) ? ` · дальше ${next}` : ""}
        {job.stop ? " · останавливаем после текущего" : ""}
        {run && job.workerSilent ? " · процесс истории молчит, подхватываем" : ""}
      </p>
      <FillBar pct={pct} run={run} done={!run && total > 0 && n >= total} />
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
type HistTab = "groups" | "students" | "money" | "audit";
const HIST_TABS: { id: HistTab; label: string }[] = [
  { id: "students", label: "Шаг 1 · Календарь ученика" },
  { id: "groups", label: "Шаг 2 · Занятия в группах" },
  { id: "money", label: "Шаг 3 · Деньги на карточке" },
  { id: "audit", label: "Шаг 4 · Сверка остатка" },
];
const PEOPLE_LOAD_GAP_MS = 5000;
const CATALOG_GAP_MS = 5000;
const PEOPLE_FROM_OPTS = [
  { id: "2015", label: "с начала · 2015" },
  { id: "7", label: "7 лет" },
  { id: "3", label: "3 года" },
  { id: "1", label: "1 год" },
] as const;
function peopleDateFrom(id: string) {
  if (id === "2015") return "2015-01-01";
  const years = id === "1" ? 1 : id === "3" ? 3 : 7;
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
}: {
  value: (typeof PEOPLE_FROM_OPTS)[number]["id"];
  disabled?: boolean;
  onChange: (id: (typeof PEOPLE_FROM_OPTS)[number]["id"]) => void;
  hint?: string;
  small?: boolean;
}) {
  return withHint(
    <label className={cn("inline-flex items-center gap-2 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10", small ? "h-8" : "h-10")}>
      <span className="text-muted">годы</span>
      <select
        className="bg-transparent font-semibold outline-none"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as (typeof PEOPLE_FROM_OPTS)[number]["id"])}
      >
        {PEOPLE_FROM_OPTS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>,
    hint,
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
  rechecked?: boolean;
  paysRechecked?: boolean;
  done: boolean;
  ok: boolean;
  alfa?: number;
  short?: boolean;
};

type PeopleRow = {
  cid: number;
  branchId: number;
  name: string;
  groups: string[];
  lessons: number;
  alfa?: number;
  short?: boolean;
  journal?: boolean;
  pays?: boolean;
  paysMore?: boolean;
  rechecked?: boolean;
  paysRechecked?: boolean;
  extra?: string;
  at?: string;
};

type MissPack = {
  total: number;
  more?: number;
  items: { id?: number; name: string; extra?: string; groupId?: number; branchId?: number; school?: string; archived?: boolean }[];
};

type FillPart = { key: string; label: string; from?: string; to?: string; done?: boolean; weak?: boolean; rechecked?: boolean; lessons?: number; err?: string; at?: string; needDetails?: number; conducted?: number };

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
  age?: string;
  ageLabel?: string;
  life?: string;
  source?: string;
  parts?: FillPart[];
  pupilN?: number;
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
  return fillFinished(packGrain(row.parts, clampGrain(row.age, grain)));
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
  const load = chunks.find((c) => !c.done || c.weak);
  if (load) {
    return {
      kind: "load" as const,
      part: load,
      step: "Шаг 1 · загрузить явки",
      btn: load.weak ? `Загрузить ещё раз ${load.label}` : `Загрузить ${load.label}`,
    };
  }
  const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
  if (detailsLeft > 0) {
    return {
      kind: "details" as const,
      part: chunks.find((c) => (c.needDetails || 0) > 0),
      step: "Шаг 2 · тема, ДЗ, комментарий, таблица учеников",
      btn: `Загрузить тему, ДЗ, комментарий и таблицу учеников всех кварталов · ${detailsLeft}`,
    };
  }
  return {
    kind: "done" as const,
    part: chunks[0] || null,
    step: "Все явки, тема, ДЗ, комментарий и таблица учеников на месте",
    btn: chunks.length ? "Перепроверить" : "Готово",
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
  const needRows = scoped.filter((r) => !finishedOf(r)).slice().sort(byFillName);
  const doneRows = scoped.filter((r) => finishedOf(r)).slice().sort(byFillName);
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
          const needsRecheck = fillNeedsRecheck(chunks);
          const shown = open === id;
          const wiz = nextWizard(chunks);
          const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
          const loadKind = active ? loading?.kind || "group" : "";
          const loadLabel = active ? loading?.label || chunks.find((c) => c.key === loading?.periodKey)?.label || wiz.part?.label || "" : "";
          return (
            <li key={id} data-gid={id} className={cn("rounded-2xl p-3 ring-1", needsRecheck ? "bg-sky-50 ring-sky-400" : full ? "bg-white ring-emerald-300" : active ? "bg-white ring-primary" : "bg-white ring-black/8")}>
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => toggleOpen(id)} title={row.name}>
                  {row.name}
                </button>
                <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums text-fg" title={`группа ${Number(row.groupId) || ""}`}>
                  №{Number(row.groupId) || "—"}
                </span>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
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
                    {full ? (
                      needsRecheck ? (
                        <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[0.72rem] font-semibold text-sky-950">есть неперепроверенные данные</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">загрузка завершена</span>
                      )
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.72rem] font-semibold text-rose-900">
                        требуют загрузки{total ? ` · ${doneN}/${total}` : ""}
                      </span>
                    )}
                    {detailsLeft > 0 ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.72rem] font-semibold text-violet-900">без темы/ДЗ · {detailsLeft}</span>
                    ) : null}
                </span>
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
              <FillBar pct={pct} run={active} done={full && !needsRecheck} warn={needsRecheck} />
              <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
                  {[row.life ? `срок ${row.life}` : "", row.from].filter(Boolean).join(" · ")}
                  {row.lessons ? ` · ${row.lessons} зан.` : ""}
                  {row.weight ? ` · ${row.weight}` : ""}
                  {row.archived ? " · архив" : ""}
              </p>
              <p className="mt-2 h-5 truncate text-[0.78rem] font-semibold">{active ? `загрузка · ${loadLabel}` : wiz.step}</p>
              <div className="mt-1 flex min-h-8 flex-wrap items-center gap-2">
                {withHint(
                <button
                  type="button"
                  disabled={busy && !active}
                  className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && "ra-progress-run")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (wiz.kind === "load" && wiz.part) onLoad(row, wiz.part, Boolean(wiz.part.done || wiz.part.weak));
                    else if (wiz.kind === "details") onDetails(row);
                    else onRecheckAll(row);
                  }}
                >
                  {wiz.btn}
                </button>,
                wiz.kind === "details" ? HINT.loadDetails : HINT.loadAttend,
                )}
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
          {listNeed.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listNeed.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Все группы этой школы уже загружены.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Загрузка данных завершена · {nDone} из {scoped.length}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Все обработанные группы этой школы. Если группа справа — кварталы срока сверены, пропуска нет. Пока {nDone} из {scoped.length}.</p>
          {listDone.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listDone.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Пока ни одна группа не загружена до конца.</p>}
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

function peopleFinished(row: PeopleRow, kind: "students" | "balance") {
  if (kind === "balance") return Boolean(row.pays);
  if (row.short) return false;
  return Boolean(row.journal);
}

function peopleQueue(rows: PeopleRow[], kind: "students" | "balance", recheck: boolean) {
  const needLoad = rows.filter((r) => !peopleFinished(r, kind));
  const needRecheck = rows.filter((r) => peopleFinished(r, kind) && (kind === "balance" ? !r.paysRechecked : !r.rechecked));
  if (recheck) return needRecheck.length ? needRecheck : rows.filter((r) => peopleFinished(r, kind));
  return needLoad;
}

function peopleNeedsRecheck(row: PeopleRow, kind: "students" | "balance") {
  if (!peopleFinished(row, kind)) return false;
  return kind === "balance" ? !row.paysRechecked : !row.rechecked;
}

function auditRight(codes?: string[]) {
  if (!codes?.includes("ok")) return false;
  return !codes.some((c) => c !== "ok" && c !== "dup" && c !== "snap" && c !== "branch" && c !== "status" && c !== "corr-goods" && c !== "wo0");
}

function rubAudit(n?: number) {
  return `${Math.round(Number(n) || 0)} ₽`;
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
    const journal = Boolean(hit.ok) && !short;
    const disk = Number(hit.lessons) || p.lessons;
    const alfa = hit.alfa != null ? hit.alfa : p.alfa;
    const pays = hit.paysOk != null ? Boolean(hit.paysOk) : p.pays;
    const rechecked = hit.rechecked != null ? Boolean(hit.rechecked) : p.rechecked;
    const paysRechecked = hit.paysRechecked != null ? Boolean(hit.paysRechecked) : p.paysRechecked;
    const extra = hit.paysMore
      ? `касса: ещё страницы, нажмите снова · на диске ${disk}${alfa != null ? ` · в Alfa ${alfa}` : ""}`
      : alfa != null
        ? `на диске ${disk} · в Alfa ${alfa}`
        : p.extra;
    return {
      ...p,
      lessons: disk,
      alfa,
      short,
      journal,
      pays,
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
    cardDone: people.filter((r) => r.pays).length,
  };
}

function applyJobStatus<T extends {
  progress?: {
    live?: { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number };
    archive?: { people?: PeopleRow[]; journalDone?: number; cardDone?: number; total?: number };
    groups?: { rows?: FillRow[]; [k: string]: unknown };
  };
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
  const keepLive = !(res.progress?.live?.people || []).length && (base.progress?.live?.people || []).length;
  const keepArch = !(res.progress?.archive?.people || []).length && (base.progress?.archive?.people || []).length;
  let progress = {
    ...base.progress,
    ...res.progress,
    live: keepLive ? base.progress?.live : res.progress?.live,
    archive: keepArch ? base.progress?.archive : res.progress?.archive,
    groups: res.progress?.groups || base.progress?.groups,
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
    lastAudit: res.lastAudit ?? base.lastAudit,
    lastArchiveCatalog: res.lastArchiveCatalog ?? base.lastArchiveCatalog,
    lastLife: res.lastLife ?? base.lastLife,
    lastArchives: res.lastArchives ?? base.lastArchives,
    lastArchivesPupils: res.lastArchivesPupils ?? base.lastArchivesPupils,
    job: res.job ?? base.job,
  };
}

function ScopePills({
  value,
  onChange,
  live,
  arch,
  hintLive,
  hintArch,
}: {
  value: "live" | "archive";
  onChange: (v: "live" | "archive") => void;
  live: string;
  arch: string;
  hintLive: string;
  hintArch: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {withHint(
        <button type="button" className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", value === "live" ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onChange("live")}>
          {live}
        </button>,
        hintLive,
      )}
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
  onStop,
  years,
}: {
  rows: PeopleRow[];
  kind: "students" | "balance";
  busy?: boolean;
  loadingCid?: number;
  onLoad: (row: PeopleRow) => void;
  onRecheck: (row: PeopleRow) => void;
  onFullHistory?: (row: PeopleRow) => void;
  onStop?: () => void;
  years?: ReactNode;
}) {
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const colLock = useRef<Record<string, boolean>>({});
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
  const needRows = scoped.filter((r) => !finishedOf(r)).slice().sort(byPeopleName);
  const doneRows = scoped.filter((r) => finishedOf(r)).slice().sort(byPeopleName);
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
  }, [q, pageSize, kind]);
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
    const active = loadingCid === row.cid;
    const shown = open === id;
    const pct = full ? 100 : short || row.lessons ? 50 : 0;
    const step = active
      ? `загрузка · ${row.name}`
      : short
        ? `на диске ${row.lessons} · в Alfa ${row.alfa} — добрать`
        : full
        ? kind === "balance"
          ? "Касса и журнал на месте"
          : row.alfa
            ? `на диске ${row.lessons} · в Alfa ${row.alfa}`
            : "Календарь на месте"
        : kind === "balance"
          ? row.paysMore
            ? "касса: ещё страницы, нажмите снова"
            : "Загрузить кассу"
          : "Шаг 1 · загрузить календарь";
    const btn = full ? "Перепроверить" : kind === "balance" ? "Загрузить кассу" : short ? "Добрать" : "Загрузить календарь";
    return (
      <li key={id} className={cn("rounded-2xl p-3 ring-1", short ? "bg-amber-50 ring-amber-400" : needsRecheck ? "bg-sky-50 ring-sky-400" : full ? "bg-white ring-emerald-300" : active ? "bg-white ring-primary" : "bg-white ring-black/8")}>
        <div className="flex items-center gap-2">
          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen((cur) => (cur === id ? "" : id))} title={row.name}>
            {row.name}
          </button>
          <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums">№{row.cid}</span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {full ? (
              needsRecheck ? (
                <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[0.72rem] font-semibold text-sky-950">есть неперепроверенные данные</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">загрузка завершена</span>
              )
            ) : short ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950">в Alfa больше</span>
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
        <FillBar pct={pct} run={active} done={full && !needsRecheck} warn={needsRecheck || short} />
        <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
          {(row.groups || []).slice(0, 2).join(" · ") || "групп на карточке нет"}
          {row.lessons ? ` · на диске ${row.lessons}` : ""}
          {row.alfa ? ` · в Alfa ${row.alfa}` : ""}
        </p>
        <p className="mt-2 h-5 truncate text-[0.78rem] font-semibold">{step}</p>
        <div className="mt-1 flex min-h-8 flex-wrap items-center gap-2">
          {withHint(
          <button
            type="button"
            disabled={busy && !active}
            className={cn(BTN_LOAD_SM, "min-w-[12.5rem] w-fit shrink-0 px-4", active && "ra-progress-run")}
            onClick={(e) => {
              e.stopPropagation();
              if (full) onRecheck(row);
              else onLoad(row);
            }}
          >
            {btn}
          </button>,
          full ? (kind === "balance" ? HINT.recheckPay : HINT.recheckCal) : kind === "balance" ? HINT.loadPay : HINT.loadCal,
          )}
          {years}
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
            <CheckLine on={Boolean(row.journal) && !short} text="календарь загружен" />
            <CheckLine on={Boolean(row.rechecked)} text="календарь перепроверен" />
            <CheckLine on={row.alfa != null && !short} text={row.alfa != null ? `счёт: диск ${row.lessons} · Alfa ${row.alfa}` : "счёт с Alfa ещё не сверяли"} />
            <CheckLine on={Boolean(row.rechecked)} text="дубликатов нет" />
            {kind === "balance" ? (
              <>
                <CheckLine on={Boolean(row.pays)} text="касса загружена" />
                <CheckLine on={Boolean(row.paysRechecked)} text="касса перепроверена" />
              </>
            ) : null}
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
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">{kind === "balance" ? "Касса и журнал — пока чего-то нет, ученик здесь." : "Личный календарь ещё неполный — ученик здесь."}</p>
          {listNeed.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listNeed.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Все ученики этого списка уже загружены.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Загрузка данных завершена · {nDone}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">{kind === "balance" ? "Касса на месте. Перепроверить — сверка с Alfa." : "Календарь на месте. Перепроверить — сверка с Alfa."}</p>
          {listDone.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listDone.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Пока ни один ученик не загружен до конца.</p>}
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
};

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
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const scoped = rows.filter((r) => {
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || String(r.cid).includes(q) || (r.groups || []).some((g) => g.toLowerCase().includes(q));
  });
  const isPinned = (r: AuditUiRow) => String(r.cid) === open || r.cid === loadingCid;
  const doneOf = (r: AuditUiRow) => Boolean(r.seen && auditRight(r.codes));
  const needRows = scoped.filter((r) => !doneOf(r)).slice().sort((a, b) => a.name.localeCompare(b.name, "ru") || a.cid - b.cid);
  const doneRows = scoped.filter((r) => doneOf(r)).slice().sort((a, b) => a.name.localeCompare(b.name, "ru") || a.cid - b.cid);
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
  }, [q, pageSize]);
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
    const active = loadingCid === row.cid;
    const shown = open === id;
    const codes = (row.codes || []).join(" · ");
    return (
      <li key={id} className={cn("rounded-2xl p-3 ring-1", !row.seen ? "bg-white ring-black/8" : full ? "bg-white ring-emerald-300" : "bg-amber-50 ring-amber-400")}>
        <div className="flex items-center gap-2">
          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen((cur) => (cur === id ? "" : id))} title={row.name}>
            {row.name}
          </button>
          <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums">№{row.cid}</span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {!row.seen ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.72rem] font-semibold text-rose-900">не сверяли</span>
            ) : full ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">совпало</span>
            ) : (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.72rem] font-semibold text-amber-950">{codes || "не совпало"}</span>
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
        <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
          {row.seen ? `Клиенты ${rubAudit(row.clients)} · Alfa ${rubAudit(row.alfaMoney)} · касса ${rubAudit(row.cash)}` : "ещё не сверяли"}
        </p>
        {shown ? (
          <div className="mt-2">
            <p className="text-[0.78rem] font-semibold">{row.extra || codes || "\u00a0"}</p>
            <p className="mt-1 text-[0.72rem] text-muted">{(row.groups || []).slice(0, 3).join(" · ") || "групп на карточке нет"}</p>
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
            <h4 className="font-display text-[1.05rem] text-rose-900">Не совпало · {nNeed}</h4>
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Не сверяли и те, у кого Клиенты ≠ Alfa. Справа только совпало.</p>
          {listNeed.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listNeed.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Слева пусто — все сверенные совпали.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Совпало · {nDone}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Клиенты = Alfa ±1 ₽. Касса может отличаться при раздельном абонементе — тогда код на карточке, не зелёный.</p>
          {listDone.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listDone.map(renderPerson)}</ul> : <p className="mt-3 text-sm text-muted">Пока никого не сверяли — справа пусто.</p>}
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
      fioOk: number;
      noDob: number;
      adult: number;
      intersect: number;
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
  const [peopleFromId, setPeopleFromId] = useState<(typeof PEOPLE_FROM_OPTS)[number]["id"]>("7");
  const [archAgeFrom, setArchAgeFrom] = useState("");
  const [archAgeTo, setArchAgeTo] = useState("");
  const [archNoDob, setArchNoDob] = useState(false);
  const [archNeedFio, setArchNeedFio] = useState(false);
  const [archNeedGroups, setArchNeedGroups] = useState(false);
  const [crmTab, setCrmTab] = useState<CrmSetTab>("history");
  const [histTab, setHistTab] = useState<HistTab>("students");
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
      if (CRM_SET_TABS.some((x) => x.id === t)) setCrmTab(t as CrmSetTab);
      if (h === "groups" || h === "students" || h === "money" || h === "audit") setHistTab(h);
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
  }, []);

  useEffect(() => {
    if (crmTab !== "history") return;
    let on = true;
    let wasRun = Boolean(journal?.job?.running) && !journal?.job?.stop;
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
        setJournal((cur) => {
          if (!cur) return res;
          const jobLive = Boolean(res.job?.running || cur.job?.running || holdFill.current);
          const keepLive = jobLive || (!(res.progress?.live?.people || []).length && (cur.progress?.live?.people || []).length);
          const keepArch = jobLive || (!(res.progress?.archive?.people || []).length && (cur.progress?.archive?.people || []).length);
          return {
            ...cur,
            ...res,
            progress: {
              ...cur.progress,
              ...res.progress,
              live: keepLive ? cur.progress?.live : res.progress?.live,
              archive: keepArch ? cur.progress?.archive : res.progress?.archive,
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
    kind: "group" | "school" | "students" | "balance" | "life" | "details" | "archives" | "archivesPupils" | "archiveCount" | "archiveCatalog" | "archiveAdd" | "audit" | "jobStart" | "jobStop" | "jobStatus";
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
            opts.kind === "archivesPupils" || opts.kind === "archives" || opts.kind === "archiveCount" || opts.kind === "archiveCatalog" || opts.kind === "archiveAdd" || opts.kind === "life" || opts.kind === "group" || opts.kind === "details" || opts.kind === "hydrateDisk" || opts.kind === "students" || opts.kind === "balance" || opts.kind === "audit" ? 90000 : 25000,
          ),
        ),
      ])) as typeof journal & { ok?: boolean; periodLabel?: string; periodKey?: string; student?: StudentHit; extra?: string; more?: boolean };
      if (res) {
        setJournal((cur) => {
          if (!cur) return res;
          const keepLive = !(res.progress?.live?.people || []).length && (cur.progress?.live?.people || []).length;
          const keepArch = !(res.progress?.archive?.people || []).length && (cur.progress?.archive?.people || []).length;
          const next = {
            ...cur,
            ...res,
            progress: {
              ...cur.progress,
              ...res.progress,
              live: keepLive ? cur.progress?.live : res.progress?.live,
              archive: keepArch ? cur.progress?.archive : res.progress?.archive,
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
    if (job.msg) setMsg(job.msg);
  }

  async function startHistJob(opts: {
    jobMode: string;
    peopleKind?: "students" | "balance";
    study?: "1" | "2";
    recheck?: boolean;
    dateFrom?: string;
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
      dateFrom: dateFrom || peopleDateFrom(peopleFromId),
      customerId: row.cid,
      branchId: row.branchId,
      name: row.name,
    });
  }

  async function recheckPeople(kind: "students" | "balance", study: "1" | "2", onlyRecheck = false) {
    const side = study === "2" ? journal?.progress?.archive : journal?.progress?.live;
    const queue = peopleQueue(side?.people || [], kind, onlyRecheck);
    if (!queue.length) {
      setMsg(
        onlyRecheck
          ? "Справа никого перепроверять. Сначала красная «Загрузить по одному»."
          : "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.",
      );
      return;
    }
    holdFill.current = true;
    setBusy(true);
    setSchoolRun({ cur: queue[0].name, n: 0, total: queue.length });
    setFillLoading({ kind, label: queue[0].name, customerId: queue[0].cid });
    const res = await startHistJob({
      jobMode: onlyRecheck ? "people-recheck" : "people",
      peopleKind: kind,
      study,
      recheck: onlyRecheck,
      dateFrom: peopleDateFrom(peopleFromId),
      jobItems: queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name })),
    });
    const job = (res as { job?: { running?: boolean; msg?: string; total?: number } } | null)?.job;
    if (job && !job.running && queue.length) {
      setMsg(job.msg || `Очередь с экрана: ${queue.length}. Нажмите ещё раз.`);
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
    });
  }

  function catalogOptsBar() {
    const chip = (on: boolean) =>
      cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold transition-colors", on ? "bg-black text-white" : "bg-white ring-1 ring-black/10 hover:bg-black/5");
    const bits = [
      archAgeFrom || archAgeTo ? `${archAgeFrom || "…"}–${archAgeTo || "…"} лет` : "",
      archNoDob ? "без д/р" : "",
      archNeedFio ? "ФИО" : "",
      archNeedGroups ? "группы" : "",
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
      study: "1",
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
    await startHistJob({ jobMode: "groups-recheck", grain: journalGrain, school: journalSchool, recheck: true, archived: groupArchived });
  }

  async function recheckGroup(row: FillRow) {
    await startHistJob({
      jobMode: "group-one",
      grain: journalGrain,
      groupId: Number(row.groupId) || 0,
      branchId: Number(row.branchId) || 0,
      name: row.name,
      recheck: true,
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
        title="Загрузить историю из Alfa"
        hint="Кнопка только пишет очередь на диск. Грузит отдельный процесс, не сайт. Вкладку и страницу можно закрыть — F5 ничего не сбрасывает. ○ сверить · ~ оборвалось · ✓ сверено с Alfa."
      >
        {(() => {
          const offline = alfaMode === "offline";
          const p = journal?.progress;
          const liveN = Number(p?.live?.total || journal?.students?.live || 0);
          const archN = Number(p?.archive?.total || journal?.students?.archive || 0);
          const schoolRows = (p?.groups?.rows || []).filter((r) => !journalSchool || r.school === journalSchool);
          const schoolDone = schoolRows.filter((r) => fillFinishedRow(r, journalGrain)).length;
          const schoolNeed = Math.max(0, schoolRows.length - schoolDone);
          const schoolNeedLife = schoolRows.filter((r) => r.source !== "alfa").length;
          return (
            <div className="space-y-3">
              {journal?.note && peopleStudy !== "2" && histTab !== "audit" ? <p className="rounded-xl bg-black/5 px-3 py-2 text-sm">{journal.note}</p> : null}
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
                {HIST_TABS.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", histTab === t.id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
                      onClick={() => pickHistTab(t.id)}
                    >
                      {t.label}
                    </button>
                    <HintI text={t.id === "students" ? HINT.tabStudents : t.id === "groups" ? HINT.tabGroups : t.id === "audit" ? HINT.tabAudit : HINT.tabMoney} />
                  </span>
                ))}
              </div>
              <ServerJobStrip job={journal?.job as ServerJob | undefined} />

              {histTab === "groups" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="font-display text-[1.15rem]">Занятия в группах</p>
                <p className="mt-1 text-sm text-muted">Как шаг 1: сначала красная «по одному», потом годы. Архив и сроки — отдельные кнопки ниже.</p>
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
                <p className="font-display text-[1.15rem]">Календарь ученика</p>
                <p className="mt-1 text-sm text-muted">
                  Красная: с Alfa на диск, один ученик, пауза 5 с. Рядом — с какого года качать. Жёлтая старая карточка: «Загрузить всю историю» с 2015.
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
                        onClick={() => void startHistJob({ jobMode: "count" })}
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
                    {journal?.note ? <p className="flex h-10 min-w-0 flex-1 items-center truncate rounded-full bg-black/5 px-4 text-sm">{catalogProgressNote(journal.note)}</p> : null}
                    </div>
                    {journal?.lastArchivePolicy ? (
                      <p className="w-full text-[0.78rem] text-muted">
                        На диске {journal.lastArchivePolicy.disk} · ФИО {journal.lastArchivePolicy.fioOk} · без dob {journal.lastArchivePolicy.noDob} · 18+ {journal.lastArchivePolicy.adult} · пересечение {journal.lastArchivePolicy.intersect} · в наборе {journal.lastArchivePolicy.working} · скрыто {journal.lastArchivePolicy.hidden}
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
                      <p className="mt-1 h-5 truncate text-sm text-muted">{run ? `Сейчас ${cur}` : "\u00a0"}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
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
                        <YearsSelect value={peopleFromId} disabled={busy} onChange={setPeopleFromId} />
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
                      </div>
                      <PeopleFillList
                        rows={side?.people || []}
                        kind="students"
                        busy={fillLoading?.kind === "students" && Boolean(fillLoading.customerId)}
                        loadingCid={fillLoading?.kind === "students" ? fillLoading.customerId : undefined}
                        years={<YearsSelect value={peopleFromId} disabled={busy} onChange={setPeopleFromId} small />}
                        onLoad={(row) => void loadPerson(row, "students", peopleStudy)}
                        onRecheck={(row) => void loadPerson(row, "students", peopleStudy, true)}
                        onFullHistory={(row) => void loadPerson(row, "students", peopleStudy, true, "2015-01-01")}
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
                <p className="font-display text-[1.15rem]">Деньги на карточке</p>
                <p className="mt-1 text-sm text-muted">Как шаг 1: красная «по одному», потом годы. Касса с диска, сверка с Alfa, в Alfa не пишет.</p>
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
                        onClick={() => void startHistJob({ jobMode: "count" })}
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
                    {journal?.note ? <p className="flex h-10 min-w-0 flex-1 items-center truncate rounded-full bg-black/5 px-4 text-sm">{catalogProgressNote(journal.note)}</p> : null}
                    </div>
                    {journal?.lastArchivePolicy ? (
                      <p className="w-full text-[0.78rem] text-muted">
                        На диске {journal.lastArchivePolicy.disk} · ФИО {journal.lastArchivePolicy.fioOk} · без dob {journal.lastArchivePolicy.noDob} · 18+ {journal.lastArchivePolicy.adult} · пересечение {journal.lastArchivePolicy.intersect} · в наборе {journal.lastArchivePolicy.working} · скрыто {journal.lastArchivePolicy.hidden}
                      </p>
                    ) : (
                      <p className="w-full text-[0.78rem] text-muted">Пока не считали: слева пусто, даже если на диске тысячи архивных карточек.</p>
                    )}
                  </>
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
                      <p className="mt-1 h-5 truncate text-sm text-muted">{run ? `Сейчас ${cur}` : "\u00a0"}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
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
                        <YearsSelect value={peopleFromId} disabled={busy} onChange={setPeopleFromId} hint={HINT.yearsMoney} />
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
                      </div>
                      <PeopleFillList
                        rows={side?.people || []}
                        kind="balance"
                        busy={offline || (fillLoading?.kind === "balance" && Boolean(fillLoading.customerId))}
                        loadingCid={fillLoading?.kind === "balance" ? fillLoading.customerId : undefined}
                        years={<YearsSelect value={peopleFromId} disabled={busy} onChange={setPeopleFromId} hint={HINT.yearsMoney} small />}
                        onLoad={(row) => void loadPerson(row, "balance", peopleStudy)}
                        onRecheck={(row) => void loadPerson(row, "balance", peopleStudy, true)}
                        onFullHistory={(row) => void loadPerson(row, "balance", peopleStudy, true, "2015-01-01")}
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
                <p className="font-display text-[1.15rem]">Сверка остатка с Alfa</p>
                <p className="mt-1 text-sm text-muted">Все текущие. Alfa = общий остаток шапки, не rest абонемента. Совпало — справа, даже с непроведёнными. Цифру Alfa в файл не ставим.</p>
                {(() => {
                  const live = p?.live;
                  const hits = journal?.lastAudit?.rows || [];
                  const by = new Map(hits.map((h) => [h.cid, h]));
                  const rows: AuditUiRow[] = (live?.people || []).map((r) => {
                    const h = by.get(r.cid);
                    return {
                      cid: r.cid,
                      branchId: r.branchId,
                      name: r.name,
                      groups: r.groups || [],
                      clients: h?.clients,
                      alfaMoney: h?.alfa,
                      cash: h?.cash,
                      codes: h?.codes,
                      extra: h?.extra,
                      at: h?.at,
                      seen: Boolean(h),
                    };
                  });
                  const run = fillLoading?.kind === "audit";
                  const scanned = journal?.lastAudit?.scanned || 0;
                  const okN = journal?.lastAudit?.ok || 0;
                  const holeN = journal?.lastAudit?.hole || 0;
                  const showN = journal?.lastAudit?.show || 0;
                  const total = live?.total || liveN || rows.length;
                  return (
                    <>
                      <p className="mt-3 text-sm">
                        текущих {total} · сверено {scanned} · совпало {okN} · дыра {holeN} · ошибка показа {showN}
                      </p>
                      <div className="mt-3 flex min-w-0 w-full flex-nowrap items-center gap-2">
                        {withHint(
                          <button
                            type="button"
                            className={cn(BTN_RED, "min-w-[14rem] shrink-0", run && "ra-progress-run")}
                            disabled={busy || offline}
                            onClick={() => void pullAudit()}
                          >
                            Сверить всех текущих
                          </button>,
                          HINT.auditAll,
                        )}
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
                        {journal?.note && histTab === "audit" ? (
                          <p className="flex h-10 min-w-0 flex-1 items-center truncate rounded-full bg-black/5 px-4 text-sm">{journal.note}</p>
                        ) : (
                          <p className="flex h-10 min-w-0 flex-1 items-center truncate px-4 text-sm text-muted">{run ? `Сейчас ${fillLoading?.label || ""}` : "\u00a0"}</p>
                        )}
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
        <div className="overflow-hidden rounded-xl ring-1 ring-black/8">
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