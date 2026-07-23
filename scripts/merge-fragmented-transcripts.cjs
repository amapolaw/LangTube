const MERGE_LANGS = new Set(["es", "fr", "en", "ja"]);
const NOISE_LINE = /^\[[^\]]+\]$/i;
/** 话语/语义群起始（下一行以此开头时，可在上一缓冲结束） */
const DISCOURSE_START = {
    en: /^(well|so|okay|ok|yeah|yes|no|but|and then|now|then|what|how|when|where|why|who|look|listen|anyway|oh|ah)\b/i,
    es: /^(bueno|mira|vale|entonces|claro|oye|ah|y tú|y yo|para ti|para mí|cuéntame|cuéntanos|dime|normalmente|básicamente|la verdad|o sea|es decir|pero|hay algo|cuál|cómo|por qué|cuándo|dónde|quién|vamos a qué|oh|sí|no)\b/i,
    fr: /^(bonjour|bonsoir|salut|bon\b|alors|donc|eh bien|mais\b|oui\b|non\b|et toi|et vous|qu'est-ce|comment|pourquoi|quand\b|où\b|ensuite|après|bref|parce que|d'accord|écoute|regarde|aujourd'hui|oh|ah|c'est fou|je vais|tu as|nous allons)\b/i,
};
/** 行内可切开的话语标记（不在行首时也用于过长行再切） */
const INTERNAL_BREAK = {
    en: /\b(well|so|okay|anyway|and then|look|listen)\b/gi,
    es: /\b(bueno|mira|vale|entonces|o sea|es decir|y tú|y yo)\b/gi,
    fr: /\b(bref|alors|donc|et toi|et vous|et avant|ensuite|après|aujourd'hui|oh ma|oh la|oh non)\b/gi,
};
function wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
function charCountJa(text) {
    return text.replace(/\s+/g, "").length;
}
function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
}
function endsSentence(text, lang) {
    const t = text.trim();
    if (!t)
        return false;
    if (lang === "ja")
        return /[。！？!?…]$/.test(t);
    return /[.!?…]$/.test(t);
}
function startsDiscourse(text, lang) {
    const t = normalizeText(text);
    if (!t || NOISE_LINE.test(t))
        return false;
    if (lang === "ja") {
        return /^(じゃあ|じゃ|それで|でも|だけど|ところで|さて|はい|ええ|あの|えっと)/.test(t);
    }
    const re = DISCOURSE_START[lang];
    return re ? re.test(t) : false;
}
function unitCount(text, lang) {
    return lang === "ja" ? charCountJa(text) : wordCount(text);
}
function targetRange(lang) {
    if (lang === "ja")
        return { min: 18, max: 42 };
    if (lang === "en")
        return { min: 10, max: 22 };
    return { min: 8, max: 18 }; // es / fr：口语语义群略短
}
function endsIncomplete(text, lang) {
    const t = normalizeText(text);
    if (!t || endsSentence(t, lang))
        return false;
    if (lang === "ja") {
        return /[のにとをがはでものへや]$/.test(t.replace(/\s+/g, ""));
    }
    const last = (t.split(/\s+/).pop() ?? "").toLowerCase().replace(/’/g, "'");
    const dangling = {
        en: new Set([
            "the", "a", "an", "of", "to", "for", "and", "or", "with", "in", "on",
            "at", "my", "your", "our", "their", "his", "her", "from", "by", "as",
            "into", "about", "like", "than",
        ]),
        es: new Set([
            "de", "del", "la", "el", "los", "las", "un", "una", "y", "a", "en",
            "con", "por", "para", "que", "mi", "tu", "su", "al", "lo",
        ]),
        fr: new Set([
            "de", "des", "du", "la", "le", "les", "un", "une", "et", "à",
            "au", "aux", "en", "dans", "sur", "avec", "pour", "par", "que", "qui",
            "nos", "vos", "mes", "tes", "ses", "ce", "cet", "cette", "ces", "mon",
            "ton", "son", "notre", "votre", "leur", "me", "te", "se", "nous",
            "vous", "lui", "y", "ne", "mais", "ou", "où", "si", "comme", "très",
            "plus", "moins", "trop", "peu", "assez", "tout", "toute", "tous",
            "toutes", "pas",
        ]),
    };
    // 主语代词结尾通常未完成（tu es / je vais…）
    const subjectPronouns = {
        en: new Set(["i", "you", "we", "they", "he", "she"]),
        es: new Set(["yo", "tú", "tu", "él", "ella", "nosotros", "vosotros", "ellos"]),
        fr: new Set(["je", "tu", "il", "elle", "on", "ils", "elles"]),
    };
    if (subjectPronouns[lang]?.has(last))
        return true;
    // 法语缩合 / 否定缩合（n'ai、j'étais…）
    if (lang === "fr" && /^(d'|l'|j'|c'|n'|m'|t'|s'|qu')/i.test(last)) {
        return true;
    }
    // 「tout à fait」等半截短语
    if (lang === "fr" && /(?:^|\s)(?:tout à fait|à fait)$/i.test(t)) {
        return true;
    }
    if (lang === "fr" && last === "c'est")
        return true;
    return dangling[lang]?.has(last) ?? false;
}
function joinTexts(a, b, lang) {
    const left = normalizeText(a);
    const right = normalizeText(b);
    if (!left)
        return right;
    if (!right)
        return left;
    if (lang === "ja")
        return `${left}${right}`;
    return `${left} ${right}`;
}
/**
 * 过长且无标点的行，按行内话语标记切成语义群（保留时间比例估算）。
 */
function splitOversizedLine(line, lang) {
    if (lang === "ja")
        return [line];
    const { min, max } = targetRange(lang);
    const text = normalizeText(line.text ?? "");
    if (!text || NOISE_LINE.test(text) || unitCount(text, lang) <= max) {
        return [line];
    }
    const re = INTERNAL_BREAK[lang];
    if (!re)
        return [line];
    const parts = [];
    let last = 0;
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const matcher = new RegExp(re.source, flags);
    let m;
    while ((m = matcher.exec(text)) !== null) {
        if (m.index <= 0)
            continue;
        const left = text.slice(last, m.index).trim();
        if (unitCount(left, lang) >= min) {
            parts.push(left);
            last = m.index;
        }
    }
    const tail = text.slice(last).trim();
    if (tail)
        parts.push(tail);
    if (parts.length <= 1)
        return [line];
    const totalUnits = unitCount(text, lang) || 1;
    const span = Math.max(0.3, line.end - line.start);
    let t = line.start;
    return parts.map((p, i) => {
        const u = unitCount(p, lang);
        const dur = (u / totalUnits) * span;
        const start = t;
        const end = i === parts.length - 1 ? line.end : t + Math.max(0.4, dur);
        t = end;
        return {
            id: `${line.id}-${i + 1}`,
            start,
            end,
            text: p,
            translation: i === 0 ? (line.translation ?? "").trim() : "",
        };
    });
}
/**
 * 把 next 的前若干词并入 prev，直到不再悬空（或吃完）。
 * 返回未并入的剩余文本（可能为空）。
 */
function absorbUntilComplete(prev, nextText, nextEnd, nextTranslation, lang) {
    const words = normalizeText(nextText).split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return "";
    let take = 0;
    let trial = prev.text;
    while (take < words.length && endsIncomplete(trial, lang)) {
        take += 1;
        trial = joinTexts(prev.text, words.slice(0, take).join(" "), lang);
    }
    // 至少吃 1 词；若仍悬空则尽量多吃到硬上限
    if (take === 0)
        take = 1;
    const { max } = targetRange(lang);
    while (take < words.length &&
        endsIncomplete(joinTexts(prev.text, words.slice(0, take).join(" "), lang), lang) &&
        unitCount(joinTexts(prev.text, words.slice(0, take).join(" "), lang), lang) <
            Math.floor(max * 1.5)) {
        take += 1;
    }
    const absorbed = words.slice(0, take).join(" ");
    const rest = words.slice(take).join(" ");
    const total = words.length || 1;
    const span = Math.max(0, nextEnd - prev.end);
    prev.text = joinTexts(prev.text, absorbed, lang);
    prev.end = rest
        ? prev.end + Math.max(0.25, (take / total) * span)
        : nextEnd;
    const tr = nextTranslation.trim();
    if (tr && !rest) {
        prev.translation = prev.translation ? `${prev.translation} ${tr}` : tr;
    }
    return rest;
}
/**
 * 二次粘合：仅在悬空词/过短尾巴时并入下一行，避免无标点软合并拖成超长段。
 */
function coalesceIncompleteSemanticGroups(lines, lang) {
    if (!MERGE_LANGS.has(lang) || lines.length <= 1) {
        return lines.map((l, i) => ({ ...l, id: l.id || `line-${i + 1}` }));
    }
    const { min, max } = targetRange(lang);
    const coalesced = [];
    for (const line of lines) {
        const text = normalizeText(line.text ?? "");
        if (!text)
            continue;
        if (NOISE_LINE.test(text)) {
            coalesced.push({
                ...line,
                text,
                translation: (line.translation ?? "").trim(),
            });
            continue;
        }
        const prev = coalesced[coalesced.length - 1];
        const joined = prev ? joinTexts(prev.text, text, lang) : text;
        const force = !!prev &&
            !NOISE_LINE.test(prev.text) &&
            !endsSentence(prev.text, lang) &&
            !startsDiscourse(text, lang) &&
            endsIncomplete(prev.text, lang);
        const softShort = !!prev &&
            !NOISE_LINE.test(prev.text) &&
            !endsSentence(prev.text, lang) &&
            !startsDiscourse(text, lang) &&
            unitCount(prev.text, lang) < Math.min(5, min) &&
            unitCount(joined, lang) <= max;
        if (force) {
            const rest = absorbUntilComplete(prev, text, line.end, (line.translation ?? "").trim(), lang);
            if (rest) {
                coalesced.push({
                    id: line.id,
                    start: prev.end,
                    end: line.end,
                    text: rest,
                    translation: (line.translation ?? "").trim(),
                });
            }
            continue;
        }
        if (softShort) {
            prev.text = joined;
            prev.end = line.end;
            const tr = (line.translation ?? "").trim();
            if (tr) {
                prev.translation = prev.translation
                    ? `${prev.translation} ${tr}`
                    : tr;
            }
            continue;
        }
        coalesced.push({
            id: line.id,
            start: line.start,
            end: line.end,
            text,
            translation: (line.translation ?? "").trim(),
        });
    }
    return coalesced.map((l, i) => ({ ...l, id: `line-${i + 1}` }));
}
/**
 * 按时间轴与语义边界，把碎片字幕合并为「完整一句 / 一个语义群」一行。
 */
function mergeTranscriptIntoSentences(lines, lang) {
    if (!MERGE_LANGS.has(lang) || lines.length <= 1) {
        return lines.map((l, i) => ({ ...l, id: l.id || `line-${i + 1}` }));
    }
    const { min, max } = targetRange(lang);
    const gapBreakSec = lang === "ja" ? 0.85 : 1.05;
    const out = [];
    let bufText = "";
    let bufStart = 0;
    let bufEnd = 0;
    let bufTranslation = "";
    const flush = () => {
        const text = normalizeText(bufText);
        if (!text) {
            bufText = "";
            bufTranslation = "";
            return;
        }
        out.push({
            id: `line-${out.length + 1}`,
            start: bufStart,
            end: Math.max(bufEnd, bufStart + 0.3),
            text,
            translation: bufTranslation.trim(),
        });
        bufText = "";
        bufTranslation = "";
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const text = normalizeText(line.text ?? "");
        if (!text)
            continue;
        if (NOISE_LINE.test(text)) {
            flush();
            out.push({
                id: `line-${out.length + 1}`,
                start: line.start,
                end: line.end,
                text,
                translation: (line.translation ?? "").trim(),
            });
            continue;
        }
        if (!bufText) {
            bufText = text;
            bufStart = line.start;
            bufEnd = line.end;
            bufTranslation = (line.translation ?? "").trim();
        }
        else {
            const gap = line.start - bufEnd;
            const nextWould = joinTexts(bufText, text, lang);
            const nextUnits = unitCount(nextWould, lang);
            const curUnits = unitCount(bufText, lang);
            const incomplete = endsIncomplete(bufText, lang);
            const shouldBreakBefore = !incomplete &&
                (gap >= gapBreakSec ||
                    (startsDiscourse(text, lang) && curUnits >= Math.min(5, min)) ||
                    (curUnits >= max && startsDiscourse(text, lang)) ||
                    (curUnits >= max &&
                        nextUnits > max + 2 &&
                        !endsIncomplete(text, lang)));
            if (shouldBreakBefore) {
                flush();
                bufText = text;
                bufStart = line.start;
                bufEnd = line.end;
                bufTranslation = (line.translation ?? "").trim();
            }
            else {
                bufText = nextWould;
                bufEnd = line.end;
                const tr = (line.translation ?? "").trim();
                if (tr) {
                    bufTranslation = bufTranslation
                        ? `${bufTranslation} ${tr}`
                        : tr;
                }
            }
        }
        if (endsSentence(bufText, lang) &&
            unitCount(bufText, lang) >= Math.min(4, min)) {
            flush();
            continue;
        }
        const next = lines[i + 1];
        const units = unitCount(bufText, lang);
        // 仅按间隙 / 话语起始结束；长度交给 splitOversizedLine，避免「français | lent」
        if (next && units >= min && !endsIncomplete(bufText, lang)) {
            const nextGap = next.start - bufEnd;
            const nextText = normalizeText(next.text ?? "");
            if (nextGap >= gapBreakSec * 0.75 ||
                startsDiscourse(nextText, lang)) {
                flush();
            }
        }
    }
    flush();
    // 过短尾巴并入上一句
    if (out.length >= 2) {
        const last = out[out.length - 1];
        const prev = out[out.length - 2];
        if (!NOISE_LINE.test(last.text) &&
            unitCount(last.text, lang) < Math.min(5, Math.floor(min / 2))) {
            prev.text = joinTexts(prev.text, last.text, lang);
            prev.end = last.end;
            if (last.translation) {
                prev.translation = prev.translation
                    ? `${prev.translation} ${last.translation}`
                    : last.translation;
            }
            out.pop();
        }
    }
    let result = coalesceIncompleteSemanticGroups(out, lang);
    result = coalesceAcrossNoise(result, lang);
    result = stitchTightContinuations(result, lang);
    result = result.flatMap((l) => splitOversizedLine(l, lang));
    result = coalesceIncompleteSemanticGroups(result, lang);
    return stitchTightContinuations(result, lang);
}
/**
 * 时间紧密相邻、非话语起始的行并回上一行（修复 français|lent、fait|quoi 等）。
 */
function stitchTightContinuations(lines, lang) {
    if (lang === "ja" || lines.length <= 1)
        return lines;
    const { max } = targetRange(lang);
    const out = [];
    for (const line of lines) {
        const text = normalizeText(line.text ?? "");
        if (!text)
            continue;
        if (NOISE_LINE.test(text)) {
            out.push({ ...line, text });
            continue;
        }
        const prev = out[out.length - 1];
        const gap = prev ? line.start - prev.end : 99;
        const joined = prev ? joinTexts(prev.text, text, lang) : text;
        if (prev &&
            !NOISE_LINE.test(prev.text) &&
            !endsSentence(prev.text, lang) &&
            !startsDiscourse(text, lang) &&
            gap < 0.45 &&
            unitCount(joined, lang) <= Math.floor(max * 1.75)) {
            prev.text = joined;
            prev.end = line.end;
            const tr = (line.translation ?? "").trim();
            if (tr) {
                prev.translation = prev.translation
                    ? `${prev.translation} ${tr}`
                    : tr;
            }
            continue;
        }
        out.push({
            id: line.id,
            start: line.start,
            end: line.end,
            text,
            translation: (line.translation ?? "").trim(),
        });
    }
    return out.map((l, i) => ({ ...l, id: `line-${i + 1}` }));
}
/**
 * 悬空行与下一语义行被 [Musique] 等隔开时，把补全所需词并回悬空行。
 * 例：c'est | [Musique] | parti alors… → c'est parti | [Musique] | alors…
 */
function coalesceAcrossNoise(lines, lang) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const text = normalizeText(line.text ?? "");
        if (out.length > 0 && NOISE_LINE.test(text) && i + 1 < lines.length) {
            const prev = out[out.length - 1];
            const next = lines[i + 1];
            const nextText = normalizeText(next.text ?? "");
            if (!NOISE_LINE.test(prev.text) &&
                !NOISE_LINE.test(nextText) &&
                endsIncomplete(prev.text, lang) &&
                !startsDiscourse(nextText, lang)) {
                const rest = absorbUntilComplete(prev, nextText, next.end, (next.translation ?? "").trim(), lang);
                out.push({ ...line, text });
                if (rest) {
                    out.push({
                        id: next.id,
                        start: prev.end,
                        end: next.end,
                        text: rest,
                        translation: (next.translation ?? "").trim(),
                    });
                }
                i += 1;
                continue;
            }
        }
        out.push({ ...line, text: text || line.text });
    }
    return out.map((l, i) => ({ ...l, id: `line-${i + 1}` }));
}
function shouldMergeTranscriptSentences(lang) {
    return MERGE_LANGS.has(lang);
}
/**
 * 平均每条过短、少句末标点 → 疑似自动字幕碎片断句。
 */
function looksLikeFragmentedTranscript(lines, lang) {
    if (!shouldMergeTranscriptSentences(lang) || lines.length < 8)
        return false;
    const sample = lines.slice(0, Math.min(lines.length, 50));
    if (lang === "ja") {
        const avgChars = sample.reduce((n, l) => n + charCountJa(l.text ?? ""), 0) / sample.length;
        const shortRatio = sample.filter((l) => charCountJa(l.text ?? "") <= 8).length /
            sample.length;
        const punctRatio = sample.filter((l) => /[。！？!?…]$/.test((l.text ?? "").trim())).length /
            sample.length;
        return avgChars < 16 && shortRatio > 0.4 && punctRatio < 0.25;
    }
    const avgWords = sample.reduce((n, l) => n + wordCount(l.text ?? ""), 0) / sample.length;
    const shortRatio = sample.filter((l) => wordCount(l.text ?? "") <= 6).length / sample.length;
    const punctRatio = sample.filter((l) => /[.!?…]$/.test((l.text ?? "").trim())).length /
        sample.length;
    if (punctRatio < 0.2 && avgWords < 9)
        return true;
    if (avgWords < 8 && shortRatio > 0.35)
        return true;
    if (avgWords < 7 && punctRatio < 0.35)
        return true;
    return false;
}

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'materials');

function main() {
  const dirs = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'transcript.json')));
  const counts = [];
  for (const id of dirs) {
    const dir = path.join(ROOT, id);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const lang = manifest.sourceLang;
    const transcriptPath = path.join(dir, 'transcript.json');
    const doc = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
    const lines = Array.isArray(doc) ? doc : doc.lines;
    const before = lines.length;
    const fragmented = looksLikeFragmentedTranscript(lines, lang);
    const merged = fragmented
      ? mergeTranscriptIntoSentences(lines, lang)
      : coalesceIncompleteSemanticGroups(lines, lang);
    const outDoc = Array.isArray(doc) ? merged : Object.assign({}, doc, { lines: merged });
    fs.writeFileSync(transcriptPath, JSON.stringify(outDoc, null, 2) + '\n');
    counts.push({ id: id, before: before, after: merged.length, mode: fragmented ? 'merge' : 'coalesce', lang: lang });
    console.log(id + ': ' + before + ' -> ' + merged.length + ' (' + (fragmented ? 'merge' : 'coalesce') + ', ' + lang + ')');
  }
  fs.writeFileSync(path.join(__dirname, '_merge-counts.json'), JSON.stringify(counts, null, 2));
}

main();