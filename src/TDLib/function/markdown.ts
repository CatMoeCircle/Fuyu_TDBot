/**
 * 将标准 Markdown (GFM) 转换为 Telegram MarkdownV2。
 * 自 `TDLib/function/index.ts` 拆出，纯字符串转换，无 TDLib 依赖。
 */
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { RootContent, Node } from "mdast";

// --- 1. 用于转义的工具函数 ---
const ESCAPE_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g;
const ESCAPE_CHARS_CODE = /[_*[\]()~`>#+\-=|{}.!\\`]/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(ESCAPE_CHARS, (char) => "\\" + char);
}

function escapeCode(text: string): string {
  return text.replace(ESCAPE_CHARS_CODE, (char) => "\\" + char);
}

// --- 2. 类型守卫函数 ---

function hasChildren(node: Node): node is Node & { children: RootContent[] } {
  return (
    "children" in node &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

function hasValue(node: Node): node is Node & { value: string } {
  return (
    "value" in node && typeof (node as { value?: unknown }).value === "string"
  );
}

function hasUrl(node: Node): node is Node & { url: string } {
  return "url" in node && typeof (node as { url?: unknown }).url === "string";
}

function hasAlt(node: Node): node is Node & { alt?: string } {
  return "alt" in node;
}

function hasLang(node: Node): node is Node & { lang?: string } {
  return "lang" in node;
}

function hasOrdered(node: Node): node is Node & { ordered?: boolean } {
  return "ordered" in node;
}

function hasPosition(node: Node): node is Node & {
  position: {
    start: { offset: number };
    end: { offset: number };
  };
} {
  return (
    "position" in node &&
    typeof (node as { position?: unknown }).position === "object" &&
    (node as { position?: unknown }).position !== null &&
    "start" in (node as { position: { start?: unknown } }).position &&
    "end" in (node as { position: { end?: unknown } }).position
  );
}

// --- 3. 核心转换逻辑 ---

function toTelegram(node: Node | RootContent, original = ""): string {
  if (!node) return "";

  switch (node.type) {
    case "root": {
      if (!hasChildren(node)) return "";
      const results: string[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child) continue;
        const content = toTelegram(child, original);

        if (content) {
          results.push(content);

          if (i < node.children.length - 1) {
            const nextChild = node.children[i + 1];

            if (
              ((child && child.type === "paragraph") ||
                (child && child.type === "heading")) &&
              nextChild &&
              nextChild.type !== "blockquote"
            ) {
              results.push("");
            } else if (child && child.type === "blockquote") {
              results.push("");
            }
          }
        }
      }

      return results.join("\n");
    }

    case "blockquote": {
      if (!hasChildren(node)) return "";

      if (hasPosition(node) && original) {
        const start = node.position.start.offset;
        const end = node.position.end.offset;
        const blockText = original.substring(start, end);
        const lines = blockText.split("\n");
        let hasInterruption = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.trim() && !line.trimStart().startsWith(">")) {
            hasInterruption = true;
            break;
          }
        }

        if (hasInterruption) {
          const parts: string[] = [];
          let currentQuote: string[] = [];
          let hasCollapseMarker = false;

          for (const line of lines) {
            const trimmed = line.trimStart();
            if (trimmed.startsWith(">")) {
              let content = trimmed.slice(1);
              if (content.startsWith(" ")) {
                content = content.slice(1);
              }

              if (content.trimEnd().endsWith("||")) {
                hasCollapseMarker = true;
              }

              currentQuote.push(content);
            } else if (line.trim()) {
              if (currentQuote.length > 0) {
                const quoteText = currentQuote.join("\n");

                if (hasCollapseMarker) {
                  const textWithoutMarker = quoteText.replace(/\|\|[\s]*$/, "");
                  const formattedQuote = toTelegram(
                    remark().use(remarkGfm).parse(textWithoutMarker),
                    textWithoutMarker
                  );
                  parts.push(
                    formattedQuote
                      .split("\n")
                      .map((l) => ">" + l)
                      .join("\n") + "||"
                  );
                } else {
                  const formattedQuote = toTelegram(
                    remark().use(remarkGfm).parse(quoteText),
                    quoteText
                  );

                  parts.push(
                    formattedQuote.split("\n").map((l) => ">" + l).join("\n")
                  );
                }
                currentQuote = [];
                hasCollapseMarker = false;
              }

              const formattedLine = toTelegram(
                remark().use(remarkGfm).parse(line),
                line
              );
              parts.push(formattedLine);
            } else if (currentQuote.length > 0) {
              currentQuote.push("");
            } else {
              parts.push("");
            }
          }

          if (currentQuote.length > 0) {
            const quoteText = currentQuote.join("\n");

            if (hasCollapseMarker) {
              const textWithoutMarker = quoteText.replace(/\|\|[\s]*$/, "");
              const formattedQuote = toTelegram(
                remark().use(remarkGfm).parse(textWithoutMarker),
                textWithoutMarker
              );
              parts.push(
                formattedQuote
                  .split("\n")
                  .map((l) => ">" + l)
                  .join("\n") + "||"
              );
            } else {
              const formattedQuote = toTelegram(
                remark().use(remarkGfm).parse(quoteText),
                quoteText
              );
              parts.push(
                formattedQuote.split("\n").map((l) => ">" + l).join("\n")
              );
            }
          }

          return parts.filter((p) => p !== "").join("\n");
        }
      }

      const paragraphs: string[] = [];
      for (const child of node.children) {
        if (child.type === "paragraph" && hasChildren(child)) {
          const paraContent = child.children
            .map((c) => toTelegram(c, original))
            .join("");
          paragraphs.push(paraContent);
        }
      }

      const innerContent = paragraphs.join("\n");

      const separator = "\n**\n";
      const hasSeparator = innerContent.includes(separator);
      const hasEndMark = innerContent.trim().endsWith("||");

      if (hasSeparator && hasEndMark) {
        const contentWithoutMark = innerContent.trim().slice(0, -2);

        const parts = contentWithoutMark.split(separator);

        const visiblePart = parts[0] ?? "";
        const hiddenPart = parts.slice(1).join(separator);

        const visibleLines = visiblePart
          .split("\n")
          .map((line) => ">" + line)
          .join("\n");
        const hiddenLines = hiddenPart
          .split("\n")
          .map((line) => ">" + line)
          .join("\n");

        return `${visibleLines}\n>**\n${hiddenLines}||`;
      } else {
        return innerContent
          .split("\n")
          .map((line) => ">" + line)
          .join("\n");
      }
    }

    case "paragraph":
      if (!hasChildren(node)) return "";
      return node.children.map((c) => toTelegram(c, original)).join("");

    case "heading":
      if (!hasChildren(node)) return "";
      return `*${node.children.map((c) => toTelegram(c, original)).join("")}*`;

    case "strong": {
      if (!hasChildren(node)) return "";
      const innerText = node.children
        .map((c) => toTelegram(c, original))
        .join("");

      if (hasPosition(node) && original) {
        const start = node.position.start.offset;
        const end = node.position.end.offset;
        const nodeText = original.substring(start, end);

        if (nodeText.startsWith("__") && nodeText.endsWith("__")) {
          return `__${innerText}__`;
        }
      }

      return `*${innerText}*`;
    }

    case "emphasis": {
      if (!hasChildren(node)) return "";
      const innerText = node.children
        .map((c) => toTelegram(c, original))
        .join("");

      if (hasPosition(node) && original) {
        const start = node.position.start.offset;
        const end = node.position.end.offset;
        const nodeText = original.substring(start, end);

        if (
          nodeText.startsWith("_") &&
          nodeText.endsWith("_") &&
          !nodeText.startsWith("__")
        ) {
          return `_${innerText}_`;
        }
      }

      return `_${innerText}_`;
    }

    case "delete":
      if (!hasChildren(node)) return "";
      return `~${node.children.map((c) => toTelegram(c, original)).join("")}~`;

    case "list": {
      if (!hasChildren(node)) return "";
      const isOrdered = hasOrdered(node) && node.ordered;
      return node.children
        .map((listItem, i) => {
          const prefix = isOrdered ? `${i + 1}\\. ` : "\\- ";
          if (!hasChildren(listItem)) return prefix;
          const itemContent = listItem.children
            .map((contentNode) => toTelegram(contentNode, original).trim())
            .join("\n");
          return prefix + itemContent;
        })
        .join("\n");
    }

    case "link":
      if (!hasChildren(node) || !hasUrl(node)) return "";
      return `[${node.children
        .map((c) => toTelegram(c, original))
        .join("")}](${escapeMarkdownV2(node.url)})`;

    case "image":
      if (!hasUrl(node)) return "";
      const alt = hasAlt(node) && node.alt ? node.alt : "image";
      return `![${alt}](${escapeMarkdownV2(node.url)})`;

    case "inlineCode":
      if (!hasValue(node)) return "";
      return "`" + escapeCode(node.value) + "`";

    case "code": {
      if (!hasValue(node)) return "";
      const lang =
        hasLang(node) && node.lang ? escapeMarkdownV2(node.lang) : "";
      return "```" + lang + "\n" + escapeCode(node.value) + "\n```";
    }

    case "text": {
      if (!hasValue(node)) return "";

      let escaped = escapeMarkdownV2(node.value);

      escaped = escaped.replace(
        /\\\|\\\|(.*?)\\\|\\\|/g,
        (_, inner) => `||${inner}||`
      );

      escaped = escaped.replace(/\\\|\\\|$/g, "||");
      return escaped;
    }

    default:
      return "";
  }
}

/** 将标准 Markdown 转换为 Telegram MarkdownV2 文本 */
export function mdToTelegram(mdText: string): Promise<string> {
  const tree = remark().use(remarkGfm).parse(mdText);
  return Promise.resolve(toTelegram(tree, mdText).trim());
}
