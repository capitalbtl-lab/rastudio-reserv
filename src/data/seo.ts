export type HeadPage = {
  title: string;
  description: string;
  ogTitle?: string;
  ogImage?: string;
  canonical: string;
};

export function pageHead(page: HeadPage) {
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:site_name", content: 'Студия "РАЗВИВАЙСЯ"' },
      { property: "og:title", content: page.ogTitle || page.title },
      { property: "og:description", content: page.description },
      { property: "og:url", content: page.canonical },
      ...(page.ogImage ? [{ property: "og:image", content: page.ogImage }] : []),
    ],
    links: [{ rel: "canonical", href: page.canonical }],
  };
}
