// =============================================================
// 設定ファイル
// スプレッドシートを「ウェブに公開」したときの CSV の URL をここに貼る。
// サイトのコード（app.js）を触らずに、データの場所だけ変えられるようにしている。
// =============================================================
window.SITE_CONFIG = {
  // サイトの見出し
  siteTitle: "Voice Collection",

  // 「public」シートを CSV 形式で公開した URL
  voicesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTcj4Gpa4Ri2M8W18IPrBcwguKQ86gn9OSSKfwDv5aueZjMT7gRS-snaPKkdfZ0ToAkeN4phlysnpER/pub?gid=1&single=true&output=csv",

  // 「livers」シートを CSV 形式で公開した URL
  liversCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTcj4Gpa4Ri2M8W18IPrBcwguKQ86gn9OSSKfwDv5aueZjMT7gRS-snaPKkdfZ0ToAkeN4phlysnpER/pub?gid=2&single=true&output=csv",

  // 「いいね」「気になる」の数を数える GAS（ウェブアプリ）の URL。空ならボタンを出さない
  reactionsApiUrl: "",
};
