// Doplní ?v=<hash obsahu> ke všem lokálním skriptům, stylům a importům modulů.
// Hash modulu zahrnuje i verze jeho závislostí, takže změna kdekoli v řetězci zneplatní cache.
// Spuštění: node tools/stamp-versions.mjs   (nebo: npm run stamp)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_RE = /((?:from|import)\s*["'])(\.\/[^"'?]+\.js)(?:\?v=[0-9a-f]+)?(["'])/g;
const memo = new Map();
const stampedContent = new Map();

function hashOf(file, stack = []) {
    if (memo.has(file)) return memo.get(file);
    if (stack.includes(file)) throw new Error("Cyklická závislost modulů: " + [...stack, file].join(" -> "));
    const src = readFileSync(join(root, file), "utf8");
    const out = src.replace(IMPORT_RE, (m, pre, spec, post) => {
        const dep = spec.slice(2);
        if (!existsSync(join(root, dep))) return m;
        return pre + spec + "?v=" + hashOf(dep, [...stack, file]) + post;
    });
    const h = createHash("sha1").update(out).digest("hex").slice(0, 8);
    memo.set(file, h);
    stampedContent.set(file, out);
    return h;
}

let changed = 0;
function write(file, content) {
    const path = join(root, file);
    if (readFileSync(path, "utf8") !== content) {
        writeFileSync(path, content);
        changed++;
        console.log("aktualizováno:", file);
    }
}

const htmlFiles = readdirSync(root).filter((f) => f.endsWith(".html"));
const jsFiles = new Set();

for (const f of htmlFiles) {
    let html = readFileSync(join(root, f), "utf8");
    html = html.replace(/(<script[^>]*\ssrc=")([^":]+\.js)(?:\?v=[0-9a-f]+)?(")/g, (m, pre, src, post) => {
        if (!existsSync(join(root, src))) return m;
        jsFiles.add(src);
        return pre + src + "?v=" + hashOf(src) + post;
    });
    html = html.replace(/(<link[^>]*\shref=")([^":]+\.css)(?:\?v=[0-9a-f]+)?(")/g, (m, pre, href, post) => {
        if (!existsSync(join(root, href))) return m;
        return pre + href + "?v=" + createHash("sha1").update(readFileSync(join(root, href))).digest("hex").slice(0, 8) + post;
    });
    write(f, html);
}

for (const f of memo.keys()) write(f, stampedContent.get(f));
console.log(changed === 0 ? "Verze jsou aktuální." : "Změněno souborů: " + changed);
