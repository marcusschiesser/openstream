import commonAr from "../src/i18n/locales/ar/common.json";
import commonEn from "../src/i18n/locales/en/common.json";
import commonEs from "../src/i18n/locales/es/common.json";
import commonFr from "../src/i18n/locales/fr/common.json";
import commonIt from "../src/i18n/locales/it/common.json";
import commonJa from "../src/i18n/locales/ja-JP/common.json";
import commonKo from "../src/i18n/locales/ko-KR/common.json";
import commonPtBr from "../src/i18n/locales/pt-BR/common.json";
import commonRu from "../src/i18n/locales/ru/common.json";
import commonTr from "../src/i18n/locales/tr/common.json";
import commonVi from "../src/i18n/locales/vi/common.json";
import commonZh from "../src/i18n/locales/zh-CN/common.json";
import commonZhTw from "../src/i18n/locales/zh-TW/common.json";

type Locale =
	| "en"
	| "ar"
	| "es"
	| "fr"
	| "it"
	| "ja-JP"
	| "ko-KR"
	| "pt-BR"
	| "ru"
	| "tr"
	| "vi"
	| "zh-CN"
	| "zh-TW";
type MessageMap = Record<string, unknown>;

const messages: Record<Locale, MessageMap> = {
	en: commonEn,
	ar: commonAr,
	es: commonEs,
	fr: commonFr,
	it: commonIt,
	"ja-JP": commonJa,
	"ko-KR": commonKo,
	"pt-BR": commonPtBr,
	ru: commonRu,
	tr: commonTr,
	vi: commonVi,
	"zh-CN": commonZh,
	"zh-TW": commonZhTw,
};

let currentLocale: Locale = "en";

export function setMainLocale(locale: string) {
	if (locale in messages) {
		currentLocale = locale as Locale;
	}
}

function getMessageValue(obj: unknown, dotPath: string): string | undefined {
	const keys = dotPath.split(".");
	let current: unknown = obj;
	for (const key of keys) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return typeof current === "string" ? current : undefined;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
	if (!vars) return str;
	return str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`));
}

export function mainT(
	namespace: "common",
	key: string,
	vars?: Record<string, string | number>,
): string {
	const value = getMessageValue(messages[currentLocale], key) ?? getMessageValue(messages.en, key);
	if (value == null) return `${namespace}.${key}`;
	return interpolate(value, vars);
}
