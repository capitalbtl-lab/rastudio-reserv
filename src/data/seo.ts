export type HeadPage = {
  title: string;
  description: string;
  ogTitle?: string;
  ogImage?: string;
  canonical: string;
};

export function pageHead(page: HeadPage) {
  const ogTitle = page.ogTitle || page.title;
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:site_name", content: 'Студия "РАЗВИВАЙСЯ"' },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: page.description },
      { property: "og:url", content: page.canonical },
      ...(page.ogImage ? [{ property: "og:image", content: page.ogImage }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: page.description },
      ...(page.ogImage ? [{ name: "twitter:image", content: page.ogImage }] : []),
    ],
    links: [{ rel: "canonical", href: page.canonical }],
  };
}
