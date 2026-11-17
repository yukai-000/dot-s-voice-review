/**
 * ボイス感想データ：登録日・更新日の自動入力
 *
 * 使い方：スプレッドシートの「拡張機能」→「Apps Script」に、このファイルの中身を貼り付けて保存する。
 * （このファイルはサイトでは使わない。スプレッドシートに貼るための控え）
 *
 * 動き：
 *   - voices シートの行を編集すると、その行の「更新日」に今日の日付が入る
 *   - 「登録日」が空欄で、「タイトル」が入っている行には、登録日も今日の日付で入る
 *   - 列の場所は見出しの名前で探すので、評価の列を追加して列がずれても動く
 */

// 対象のシート名と、見出しの名前（日本語と、以前の英語のどちらでも探す）
const SHEET_NAME = "voices";
const TITLE_HEADERS = ["タイトル", "title"];
const UPDATED_HEADERS = ["更新日", "updatedAt"];
const CREATED_HEADERS = ["登録日", "createdAt"];
const DATE_FORMAT = "yyyy/mm/dd";

/**
 * セルを編集したときに Google が自動で呼び出す関数（シンプルトリガー）
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e 編集の情報
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return; // voices シート以外は何もしない

  // 見出し（1行目）から、各列の位置を探す（1始まり）
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const titleCol = findColumn(headers, TITLE_HEADERS);
  const updatedCol = findColumn(headers, UPDATED_HEADERS);
  const createdCol = findColumn(headers, CREATED_HEADERS);
  if (!titleCol || !updatedCol || !createdCol) return; // 見出しが見つからなければ何もしない

  // 日付の列そのものを手で直したときは、上書きしない
  const firstCol = range.getColumn();
  const lastCol = firstCol + range.getNumColumns() - 1;
  const onlyDateCols = [updatedCol, createdCol].includes(firstCol) && [updatedCol, createdCol].includes(lastCol);
  if (onlyDateCols) return;

  // 見出しの行（1行目）は対象外。貼り付けで複数行を編集したときは、全部の行に入れる
  const firstRow = Math.max(range.getRow(), 2);
  const lastRow = range.getRow() + range.getNumRows() - 1;
  if (lastRow < firstRow) return;

  const today = new Date();
  for (let row = firstRow; row <= lastRow; row++) {
    const title = sheet.getRange(row, titleCol).getValue();
    if (title === "") continue; // タイトルが空の行（消した行など）には入れない

    sheet.getRange(row, updatedCol).setValue(today).setNumberFormat(DATE_FORMAT);

    const createdCell = sheet.getRange(row, createdCol);
    if (createdCell.getValue() === "") {
      createdCell.setValue(today).setNumberFormat(DATE_FORMAT);
    }
  }
}

/**
 * 見出しの並びから、候補の名前のどれかと一致する列の番号（1始まり）を返す。見つからなければ 0
 * @param {Array} headers 1行目の見出し
 * @param {string[]} names 探す見出しの名前の候補
 * @return {number}
 */
function findColumn(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return index + 1;
  }
  return 0;
}
