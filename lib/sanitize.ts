import sanitizeHtml from "sanitize-html";

const base: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "div", "span", "pre", "code", "hr", "table", "thead", "tbody", "tr", "td", "th"],
  allowedAttributes: { a: ["href", "title"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
};

/** HTML we author/send (composer, sequence steps): no images, no scripts. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, { ...base, allowedAttributes: { a: ["href", "title", "rel", "target"] } });
}

/** Incoming mail for the reader. Remote images are blocked unless allowImages. */
export function sanitizeIncoming(html: string, allowImages: boolean): string {
  return sanitizeHtml(html, {
    ...base,
    allowedTags: allowImages ? [...base.allowedTags as string[], "img"] : base.allowedTags,
    allowedAttributes: { a: ["href", "title", "rel", "target"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
  });
}
