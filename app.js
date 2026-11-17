// =============================================================
// Voice Collection 公開ページ
// Google スプレッドシートを「ウェブに公開」した CSV を読み込んで表示する。
// 元の Firebase 版（voice.js）の動きを引き継ぎ、データの読み込み先だけを変えている。
// =============================================================

// ---------- 評価項目の設定 ----------
// 列名ごとの表示名とアイコン。ここにない列（後から追加した評価項目）は列名をそのまま表示し、⭐ を使う。
const RATING_STYLE = {
    recommendLevel: { label: "おすすめ", icon: "⭐" },
    sweetness:      { label: "甘さ",     icon: "❤️" },
    "友情度":       { label: "友情度",   icon: "🤝" },
    "シリアス度":   { label: "シリアス度", icon: "💙" },
    "切なさ":       { label: "切なさ",   icon: "💧" },
};
const DEFAULT_ICON = "⭐";
const MAX_RATING = 5; // 5段階評価

// ---------- 画面の状態 ----------
let allVoices = [];      // 公開中のボイス一覧
let allLivers = [];      // ライバー一覧（ふりがな付き）
let ratingKeys = [];     // 評価として扱う列名の一覧（表示順）
let currentTab = "にじさんじ";
let viewMode = "year";   // year（年別） / title（ボイス別） / liver（ライバー別）
let sortKey = "";        // 空なら発売日順。評価の列名が入るとその評価が高い順

const MAIN_AGENCIES = ["にじさんじ", "ホロスターズ"];

// ---------- 文字の処理 ----------

// 文字の形をそろえる（「び」が「ひ＋゛」に分かれているデータなどを同じ文字として扱うため）
function normalize(value) {
    return String(value ?? "").normalize("NFC").trim();
}

// カタカナをひらがなに変える（ふりがな検索で「クズハ」でも見つかるようにするため）
function toHiragana(text) {
    return text.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// HTML として埋め込む前に、記号を無害な形に置き換える
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ライバー名の文字列を配列にする（複数人は「、」区切り。古いデータの「,」区切りにも対応）
function splitLivers(text) {
    return normalize(text).split(/[、,]/).map(s => s.trim()).filter(Boolean);
}

// ---------- CSV の読み込み ----------

// CSV の文字列を2次元配列にする（"" で囲まれた中の改行やカンマにも対応）
function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    text = text.replace(/^﻿/, ""); // 先頭の BOM を取り除く

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { cell += ch; }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(cell); cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(cell); rows.push(row); row = []; cell = "";
        } else {
            cell += ch;
        }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== "")); // 空の行は捨てる
}

// URL から CSV を取ってきて、見出しと行のオブジェクト配列にする
async function fetchCsv(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV の取得に失敗しました（${res.status}）`);
    const rows = parseCsv(await res.text());
    const header = (rows.shift() || []).map(h => normalize(h));
    const records = rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    return { header, records };
}

// 見出しの並びから、評価として扱う列を決める
// おすすめ度・甘さ ＋ 「sweetness と review の間にある列」すべて
function detectRatingKeys(header) {
    const keys = ["recommendLevel", "sweetness"].filter(k => header.includes(k));
    const start = header.indexOf("sweetness");
    const end = header.indexOf("review");
    if (start !== -1 && end > start) {
        header.slice(start + 1, end).filter(h => h).forEach(h => keys.push(h));
    }
    return keys;
}

// 評価の値を 0〜5 の整数にする（空欄や数字以外は 0 = 未評価）
function toRating(value) {
    const n = Math.round(Number(normalize(value)));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX_RATING);
}

async function loadData() {
    const config = window.SITE_CONFIG || {};
    document.getElementById("siteTitle").textContent = config.siteTitle || "Voice Collection";

    if (!config.voicesCsvUrl) {
        showMessage("config.js に CSV の URL が設定されていません。");
        return;
    }

    try {
        // ボイスとライバーの CSV を同時に取りに行く（ライバーは失敗しても表示は続ける）
        const [voiceData, liverData] = await Promise.all([
            fetchCsv(config.voicesCsvUrl),
            config.liversCsvUrl ? fetchCsv(config.liversCsvUrl).catch(e => { console.warn(e); return null; }) : null,
        ]);

        ratingKeys = detectRatingKeys(voiceData.header);

        allVoices = voiceData.records
            .filter(r => normalize(r.title) && normalize(r.isHidden).toUpperCase() !== "TRUE")
            .map(r => {
                const ratings = {};
                ratingKeys.forEach(k => { ratings[k] = toRating(r[k]); });
                return {
                    title: normalize(r.title),
                    livers: splitLivers(r.liverName),
                    agency: normalize(r.agency) || "その他",
                    releaseYear: Number(r.releaseYear) || 0,
                    releaseMonth: Number(r.releaseMonth) || 0,
                    review: String(r.review ?? "").trim(),
                    ratings,
                };
            });

        // 新しい順（年→月）に並べておく
        allVoices.sort((a, b) => (b.releaseYear - a.releaseYear) || (b.releaseMonth - a.releaseMonth));

        allLivers = liverData ? liverData.records.map(r => ({
            name: normalize(r.name),
            furigana: toHiragana(normalize(r.furigana)),
            agency: normalize(r.agency),
        })).filter(l => l.name) : [];

        buildSortOptions();
        updateLiverOptions();
        renderGallery();
    } catch (e) {
        console.error(e);
        showMessage("データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
    }
}

// ---------- ライバー関連 ----------

// ライバーの情報（ふりがな・事務所）を名前から探す
function findLiver(name) {
    return allLivers.find(l => l.name === name);
}

// 並べ替え用の読み（ふりがながなければ名前そのもの）
function sortName(name) {
    return findLiver(name)?.furigana || name;
}

// ボイスが今のタブ（事務所）に入るかどうか
function matchesTab(agency) {
    if (currentTab === "その他") return !MAIN_AGENCIES.includes(agency);
    return agency === currentTab;
}

// ライバーの絞り込みリストを、今のタブのライバーだけで作り直す
function updateLiverOptions() {
    const select = document.getElementById("liverInput");
    const selected = select.value;
    select.innerHTML = '<option value="">👤 ライバー</option>';

    const names = new Set();
    allVoices.filter(v => matchesTab(v.agency)).forEach(v => v.livers.forEach(n => names.add(n)));

    [...names]
        .sort((a, b) => sortName(a).localeCompare(sortName(b), "ja"))
        .forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

    // タブを切り替えても、同じライバーがいれば選択を残す
    select.value = names.has(selected) ? selected : "";
}

// ---------- 評価の表示 ----------

function ratingStyle(key) {
    return RATING_STYLE[key] || { label: key, icon: DEFAULT_ICON };
}

// 評価1つ分の HTML（評価の数だけ濃く、残りを薄く表示する）
function ratingRowHtml(key, value) {
    const { label, icon } = ratingStyle(key);
    return `
        <div class="rating-row">
            <span class="rating-label">${escapeHtml(label)}</span>
            <span class="rating-icons" aria-label="${escapeHtml(label)} ${value} / ${MAX_RATING}">
                <span class="on">${icon.repeat(value)}</span><span class="off">${icon.repeat(MAX_RATING - value)}</span>
            </span>
        </div>`;
}

// 評価が入っている項目（1以上）だけを並べた HTML。未評価の項目は表示しない
function ratingsHtml(voice) {
    return ratingKeys
        .filter(k => voice.ratings[k] > 0)
        .map(k => ratingRowHtml(k, voice.ratings[k]))
        .join("");
}

// 並び順のメニューに、評価の項目を追加する
function buildSortOptions() {
    const select = document.getElementById("sortSelect");
    ratingKeys.forEach(key => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = `並び順：${ratingStyle(key).label}が高い順`;
        select.appendChild(option);
    });
}

// ---------- 一覧の表示 ----------

function showMessage(text) {
    const container = document.getElementById("galleryContainer");
    container.innerHTML = "";
    const p = document.createElement("p");
    p.className = "message";
    p.textContent = text;
    container.appendChild(p);
}

// 検索・タブ・ライバー・年の条件で絞り込んだボイスを返す
function filteredVoices() {
    const keyword = normalize(document.getElementById("searchInput").value).toLowerCase();
    const keywordKana = toHiragana(keyword);
    const selectedLiver = document.getElementById("liverInput").value;

    return allVoices.filter(v => {
        if (!matchesTab(v.agency)) return false;
        if (selectedLiver && !v.livers.includes(selectedLiver)) return false;
        if (!keyword) return true;

        // タイトル・感想・ライバー名・ふりがなのどれかに入っていれば表示
        return v.title.toLowerCase().includes(keyword)
            || v.review.toLowerCase().includes(keyword)
            || v.livers.some(n => n.toLowerCase().includes(keyword))
            || v.livers.some(n => (findLiver(n)?.furigana || "").includes(keywordKana));
    });
}

// 開いている展開表示を閉じる（except に渡した要素とその親は閉じない）
function closeOthers(selector, except) {
    document.querySelectorAll(selector + ".open").forEach(el => {
        if (!except || !el.contains(except)) el.classList.remove("open");
    });
}

// カード1枚を作る（押すと感想のポップアップを開く）
function createCard(voice, { showTitle = false } = {}) {
    const card = document.createElement("button");
    card.className = "card";
    card.innerHTML = `
        ${showTitle ? `<h4>${escapeHtml(voice.title)}</h4>` : ""}
        <p class="liver-name">👤 ${escapeHtml(voice.livers.join("、"))}</p>
        <div class="rating-list">${ratingsHtml(voice)}</div>
        ${voice.review ? '<p class="has-review">📝 感想あり</p>' : ""}
    `;
    card.addEventListener("click", () => openModal(voice));
    return card;
}

// 見出し（アコーディオン）とカードの並びをまとめて作る
function createAccordion(labelHtml, voices) {
    const wrap = document.createElement("div");
    wrap.className = "accordion";

    const button = document.createElement("button");
    button.className = "title-accordion";
    button.innerHTML = labelHtml;

    const content = document.createElement("div");
    content.className = "title-content";
    const grid = document.createElement("div");
    grid.className = "card-grid";
    voices.forEach(v => grid.appendChild(createCard(v)));
    content.appendChild(grid);

    // 押すと開く。ほかのタイトルの展開表示は自動で閉じる
    button.addEventListener("click", () => {
        const willOpen = !wrap.classList.contains("open");
        closeOthers(".accordion");
        wrap.classList.toggle("open", willOpen);
    });
    wrap.append(button, content);
    return wrap;
}

// ボイスの最初のライバーの読みで並べる
function byFirstLiver(a, b) {
    return sortName(a.livers[0] || "").localeCompare(sortName(b.livers[0] || ""), "ja");
}

// タイトルごとにまとめて親要素に追加する
function appendTitles(parent, voices) {
    const groups = {};
    voices.forEach(v => { (groups[v.title] ||= []).push(v); });
    Object.keys(groups)
        .sort((a, b) => a.localeCompare(b, "ja"))
        .forEach(title => {
            parent.appendChild(createAccordion(`<span>🎤 ${escapeHtml(title)}</span>`, groups[title].sort(byFirstLiver)));
        });
}

function renderGallery() {
    const container = document.getElementById("galleryContainer");

    // ボタンの選択状態を更新
    document.querySelectorAll(".view-mode-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewMode));

    let voices = filteredVoices();

    // 評価の並び順が選ばれているときは、評価が入っているボイスだけを高い順に並べる
    if (sortKey) {
        voices = voices.filter(v => v.ratings[sortKey] > 0)
            .sort((a, b) => (b.ratings[sortKey] - a.ratings[sortKey]) || (b.releaseYear - a.releaseYear) || (b.releaseMonth - a.releaseMonth));
        if (voices.length === 0) { showMessage("この評価が入っているボイスはまだありません。"); return; }

        container.innerHTML = "";
        const note = document.createElement("p");
        note.className = "sort-note";
        note.textContent = `${ratingStyle(sortKey).label}が入っているボイス ${voices.length}件`;
        const grid = document.createElement("div");
        grid.className = "card-grid";
        voices.forEach(v => grid.appendChild(createCard(v, { showTitle: true })));
        container.append(note, grid);
        return;
    }

    if (voices.length === 0) { showMessage("データが見つかりません。"); return; }
    container.innerHTML = "";

    if (viewMode === "year") {
        // 年別：新しい年 → 古い年の順に、年 → 月 → タイトル → 中身 → 中身の詳細
        const years = {};
        voices.forEach(v => { ((years[v.releaseYear] ||= {})[v.releaseMonth] ||= []).push(v); });
        Object.keys(years).sort((a, b) => b - a).forEach(year => {
            const yearSection = document.createElement("section");
            yearSection.className = "year-section";
            yearSection.innerHTML = `<h2 class="year-heading">${Number(year) > 0 ? year : "発売年不明"}</h2>`;

            Object.keys(years[year]).sort((a, b) => b - a).forEach(month => {
                const monthSection = document.createElement("div");
                monthSection.className = "month-section";
                monthSection.innerHTML = `<h3>${Number(month) > 0 ? `${month}月` : "発売月不明"}</h3>`;
                appendTitles(monthSection, years[year][month]);
                yearSection.appendChild(monthSection);
            });
            container.appendChild(yearSection);
        });
    } else if (viewMode === "title") {
        // ボイス別：タイトルごとのアコーディオン
        const section = document.createElement("section");
        appendTitles(section, voices);
        container.appendChild(section);
    } else {
        // ライバー別：ライバーごとのアコーディオン（複数人のボイスはそれぞれのライバーに入る）
        const groups = {};
        voices.forEach(v => v.livers.forEach(name => { (groups[name] ||= []).push(v); }));
        const section = document.createElement("section");
        Object.keys(groups)
            .sort((a, b) => sortName(a).localeCompare(sortName(b), "ja"))
            .forEach(name => {
                const label = `<span>👤 ${escapeHtml(name)}</span><span class="count">${groups[name].length}件</span>`;
                // ライバー別ではカードにタイトルを出す（どのボイスか分かるように）
                const acc = createAccordion(label, []);
                const grid = acc.querySelector(".card-grid");
                groups[name].forEach(v => grid.appendChild(createCard(v, { showTitle: true })));
                section.appendChild(acc);
            });
        container.appendChild(section);
    }
}

// 展開表示の外（何もないところ）を押したら、開いているものを全部閉じる
document.addEventListener("click", e => {
    if (e.target.closest(".accordion, .public-modal, .sticky-area, .view-mode-controls")) return;
    closeOthers(".accordion");
});

// ---------- ポップアップ ----------

function openModal(voice) {
    document.getElementById("pvTitle").textContent = voice.title;
    document.getElementById("pvLiver").textContent = `👤 ${voice.livers.join("、")}`;
    document.getElementById("pvRelease").textContent = voice.releaseYear
        ? `📅 ${voice.releaseYear}年${voice.releaseMonth ? `${voice.releaseMonth}月` : ""}`
        : "";
    document.getElementById("pvRating").innerHTML = ratingsHtml(voice) || '<p class="no-rating">未評価</p>';
    // 感想は textContent で入れる（HTML として解釈させないため）
    document.getElementById("pvReview").textContent = voice.review || "感想はまだありません。";
    document.getElementById("publicVoiceModal").classList.add("show");
}

function closeModal() {
    document.getElementById("publicVoiceModal").classList.remove("show");
}

document.getElementById("closePublicModal").addEventListener("click", closeModal);
// 背景（暗い部分）を押しても閉じる
document.getElementById("publicVoiceModal").addEventListener("click", e => { if (e.target.id === "publicVoiceModal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ---------- ボタン・入力欄の動作 ----------

// 事務所タブ
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
        updateLiverOptions();
        renderGallery();
    });
});

// 年別・ボイス別・ライバー別
document.querySelectorAll(".view-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => { viewMode = btn.dataset.view; renderGallery(); });
});

// 並び順
document.getElementById("sortSelect").addEventListener("change", e => { sortKey = e.target.value; renderGallery(); });

// 検索とライバーの絞り込み
document.getElementById("searchInput").addEventListener("input", renderGallery);
document.getElementById("liverInput").addEventListener("change", renderGallery);
document.getElementById("clearSearchBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    renderGallery();
});
document.getElementById("clearLiverBtn").addEventListener("click", () => {
    document.getElementById("liverInput").value = "";
    renderGallery();
});

// 上に戻るボタン（少しスクロールしたら表示）
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.addEventListener("scroll", () => scrollTopBtn.classList.toggle("show", window.scrollY > 300));
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

loadData();
