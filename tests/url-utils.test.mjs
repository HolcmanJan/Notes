import test from "node:test";
import assert from "node:assert/strict";
import { isHttpUrl, safeHref } from "../url-utils.js";

test("http a https projdou", () => {
    assert.equal(isHttpUrl("https://example.com/a?b=1"), true);
    assert.equal(isHttpUrl("http://example.com"), true);
});

test("javascript:, data: a nesmysly neprojdou", () => {
    for (const u of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "", "nic", null, undefined]) {
        assert.equal(isHttpUrl(u), false, String(u));
    }
});

test("safeHref vrátí náhradu u nebezpečné adresy", () => {
    assert.equal(safeHref("javascript:alert(1)"), "#");
    assert.equal(safeHref("https://a.cz"), "https://a.cz");
});
