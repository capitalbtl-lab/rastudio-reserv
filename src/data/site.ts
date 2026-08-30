export const SITE = {
  name: "Студия «Развивайся»",
  shortName: "РАЗВИВАЙСЯ",
  domain: "https://www.rastudio.org",
  phone: "8 (800) 511-34-01",
  phoneHref: "tel:+78005113401",
  email: "admin@rastudio.org",
  telegram: "https://t.me/rastudiolife",
  cabinet: "https://studiyarazvivaysya.s20.online/",
  trialForm:
    "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=20&lead_source_id=2&baseColor=205EDC&borderRadius=8&css=%2F%2Fcdn.alfacrm.pro%2Flead-form%2Fform.css",
  maxBot: "https://max.ru/id502210556271_bot",
  camp: "http://www.racamp.ru",
  vk: "https://vk.ru/rastudio",
  logo: {
    src: "https://static.wixstatic.com/media/4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg/v1/fill/w_160,h_160,al_c,q_80,enc_avif,quality_auto/4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg",
    filename: "4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg",
    alt: "Логотип студии Развивайся",
  },
  homeTitle:
    'Студия "РАЗВИВАЙСЯ" | Художественная школа, робототехника, инженерные и айти-курсы',
  homeDescription:
    "Художественная школа в Коломне для детей и взрослых, занятия по робототехнике, программированию, 3D-моделированию, подготовка к школе и многое другое!",
  ogTitle: 'Студия "РАЗВИВАЙСЯ" | творчество и дошкольное образование в Коломне',
} as const;

export const BRANCHES = [
  {
    name: "Студия и ЦМИТ «Развивайся»",
    city: "Коломна",
    address: "ул. Октябрьской революции, д. 340, центральный вход, 2 этаж",
    hours: "Ср–Вс, 10:00–19:00",
    map: "https://yandex.ru/maps/-/C-WgM~Q",
    note: "Филиал работает с администратором. Визиты вне занятий — по согласованию.",
    directions:
      "Художественная школа, робототехника, программирование, науки и инженерия, мастер-классы, летний лагерь.",
  },
  {
    name: "Студия «Развивайся»",
    city: "Коломна",
    address: "ул. Гражданская, д. 2, ТЦ «Олимпийский», правый торец, 2 этаж",
    hours: "По расписанию занятий",
    map: "https://yandex.ru/maps/-/C-Wgjbb",
    note: "Запись по телефону и на сайте. Визиты вне занятий не предусмотрены.",
    directions:
      "Школа раннего развития, художественная школа и студия, модельная школа, мастер-классы, летний детский клуб.",
  },
  {
    name: "Филиал ЦМИТ «Развивайся»",
    city: "Луховицы",
    address: "ул. Пушкина, д. 202А, ТЦ «Хороший», правый торец, 3 этаж",
    hours: "По согласованию",
    map: "https://yandex.ru/maps/-/C-WgbnB",
    note: "Запись по телефону и на сайте. Визиты вне занятий — по согласованию.",
    directions:
      "Робототехника, программирование, науки и инженерия, мастер-классы, летний детский клуб.",
  },
] as const;

export const SCHOOLS = [
  {
    href: "/art-studio",
    label: "Художественная школа",
    kicker: "3–17 лет",
    blurb: "Академический рисунок, живопись, скульптура и digital art.",
    image:
      "https://static.wixstatic.com/media/11062b_4402568a97474297baea6f7a1f16a2b2f000.jpg/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/11062b_4402568a97474297baea6f7a1f16a2b2f000.jpg",
    alt: "Художественная школа в Студии Развивайся | Коломна",
    filename: "11062b_4402568a97474297baea6f7a1f16a2b2f000.jpg",
  },
  {
    href: "/robototehnika-v-kolomne",
    label: "Школа робототехники",
    kicker: "5–14 лет",
    blurb: "LEGO, Arduino, схемотехника и билингвальные курсы.",
    image:
      "https://static.wixstatic.com/media/4e33b6_a89bcf4085864d62aaaca9f499d1b07e~mv2.jpg/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/4e33b6_a89bcf4085864d62aaaca9f499d1b07e~mv2.jpg",
    alt: "Школа робототехники в Коломне",
    filename: "4e33b6_a89bcf4085864d62aaaca9f499d1b07e~mv2.jpg",
  },
  {
    href: "/programming-school",
    label: "Школа программирования",
    kicker: "5–16 лет",
    blurb: "Scratch, Python, C++ и разработка игр на Unity.",
    image:
      "https://static.wixstatic.com/media/4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg/v1/fit/w_960,h_639,q_90,enc_avif,quality_auto/4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg",
    alt: "Дети разных возрастов увлеченно программируют в Студии Развивайся в Коломне и Луховицах",
    filename: "4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg",
  },
  {
    href: "/promising-professions",
    label: "Школа наук и инженерии",
    kicker: "5–16 лет",
    blurb: "Физика, радиотехника, 3D и инженерные проекты.",
    image:
      "https://static.wixstatic.com/media/4e33b6_952a165eb9ac4ef1961ab394fc7927d2~mv2.jpg/v1/fit/w_960,h_640,q_90,enc_avif,quality_auto/4e33b6_952a165eb9ac4ef1961ab394fc7927d2~mv2.jpg",
    alt: "Дети 5-16 лет увлеченно занимаются на инженеерных и научных курсах в Студии Развивайся в Коломне",
    filename: "4e33b6_952a165eb9ac4ef1961ab394fc7927d2~mv2.jpg",
  },
  {
    href: "/model-school",
    label: "Модельная школа",
    kicker: "9–14 лет",
    blurb: "Подиум, стиль, этикет и уверенная самопрезентация.",
    image:
      "https://static.wixstatic.com/media/4e33b6_529a2f0d0e5d4c9d839a82d9e6b29eaa~mv2.png/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/%D0%9C%D0%A1.png",
    alt: "МС.png",
    filename: "МС.png",
  },
  {
    href: "/early-childhood-care",
    label: "Школа раннего развития",
    kicker: "3–6 лет",
    blurb: "STEAM, лего-математика и подготовка к школе.",
    image:
      "https://static.wixstatic.com/media/4e33b6_b130e7f8a84c4fad8559b343833090a0~mv2.png/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/%D0%A5%D1%83%D0%B4%D0%BE%D0%B6%D0%B5%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D0%B0%D1%8F%20%D1%81%D1%82%D1%83%D0%B4%D0%B8%D1%8F%205-6%20%D0%BB%D0%B5%D1%82.jpg",
    alt: "Художественная студия 5-6 лет.jpg",
    filename: "Художественная студия 5-6 лет.jpg",
  },
  {
    href: "/languageschool",
    label: "Школа иностранных языков",
    kicker: "9–14 лет",
    blurb: "Английский, корейский и японский с носителями.",
    image:
      "https://static.wixstatic.com/media/11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg",
    alt: "Школа иностранных языков в Студии Развивайся | Коломна",
    filename: "11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg",
  },
] as const;

export const NAV = [
  { href: "/allcourses", label: "Курсы" },
  { href: "/team", label: "Педагоги" },
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
] as const;

export const FOOTER_LINKS = [
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
  { href: "/team", label: "Педагоги" },
  { href: "/allcourses", label: "Все курсы" },
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/servicerules", label: "Правила оказания услуг" },
  { href: "/legal-information", label: "Правовая информация" },
  { href: "/charity", label: "Благотворительность" },
] as const;

export const STATS = [
  { value: "2016", label: "год основания" },
  { value: "3", label: "студии в Коломне и Луховицах" },
  { value: "7", label: "школ и направлений" },
  { value: "19", label: "педагогов-наставников" },
] as const;

export const MOMENTS = [
  {
    href: "/charity",
    title: "Важные дела",
    blurb: "Бесплатные мастер-классы и благотворительные проекты студии.",
    image:
      "https://static.wixstatic.com/media/4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg",
    alt: "Благотворительные проекты Студии Развивайся в Коломне",
    filename: "4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg",
  },
  {
    href: "http://www.racamp.ru",
    title: "Летний городской лагерь 2026",
    blurb: "Науки и профориентация, питание по СанПиН, два филиала в Коломне.",
    image:
      "https://static.wixstatic.com/media/4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg",
    alt: "Летний лагерь в Студии Развивайся в Коломне",
    filename: "4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg",
  },
  {
    href: "/tinkercad2025itogi",
    title: "Роботы будущего",
    blurb: "Внутренний конкурс по 3D-моделированию в Tinkercad.",
    image:
      "https://static.wixstatic.com/media/4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg",
    alt: "Конкурс робототехники от Студии Развивайся в Коломне",
    filename: "4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg",
  },
] as const;

export const PARTNER_LOGOS = [
  {
    src: "https://static.wixstatic.com/media/4e33b6_5f0212bb908f42c2b022b4aa05ce2980~mv2.png/v1/fill/w_160,h_160,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(4).png",
    alt: "Логотипы на главную Студия Развивайся (4).png",
    filename: "Логотипы на главную Студия Развивайся (4).png",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_284d58a7c14b4d50bc03394b5b87ad45~mv2.png/v1/fill/w_160,h_160,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(3).png",
    alt: "Логотипы на главную Студия Развивайся (3).png",
    filename: "Логотипы на главную Студия Развивайся (3).png",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_920386da915e419e8380eef5d8b302af~mv2.jpg/v1/fill/w_160,h_160,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(2).jpg",
    alt: "Логотипы на главную Студия Развивайся (2).jpg",
    filename: "Логотипы на главную Студия Развивайся (2).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_d9ab0d6feca64ece8d498d9b0275b293~mv2.jpg/v1/fill/w_160,h_160,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(1).jpg",
    alt: "Логотипы на главную Студия Развивайся (1).jpg",
    filename: "Логотипы на главную Студия Развивайся (1).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_5b4eed978be64bd494a3b78b27ccfd70~mv2.jpg/v1/fill/w_160,h_160,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(3).jpg",
    alt: "Логотипы на главную Студия Развивайся (3).jpg",
    filename: "Логотипы на главную Студия Развивайся (3).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_a30da1df107748559ac545bcd3f89c00~mv2.png/v1/fill/w_160,h_160,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(6).png",
    alt: "Логотипы на главную Студия Развивайся (6).png",
    filename: "Логотипы на главную Студия Развивайся (6).png",
  },
] as const;
