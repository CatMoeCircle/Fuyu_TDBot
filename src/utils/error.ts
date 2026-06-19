
type ErrorLike = {
    message?: unknown;
    error?: unknown;
};


/**
 * 从各种错误值中提取可读的错误信息字符串。
 *
 * - 如果值为字符串，则直接返回该字符串。
 * - 如果值为对象，优先返回 `message`，其次返回 `error`（当它们为字符串时）。
 * - 否则使用 `String(error)` 将值转换为字符串并返回。
 *
 * @param  error - 要规范化为字符串的错误值。
 * @returns 提取或字符串化后的错误信息。
 */
export function getErrorMessage(error: unknown): string {
    if (typeof error === "string") return error;

    if (error !== null && typeof error === "object") {
        const e = error as ErrorLike;
        if (typeof e.message === "string") return e.message;
        if (typeof e.error === "string") return e.error;
    }

    return String(error);
}