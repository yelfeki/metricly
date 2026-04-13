export interface ParseResult {
  data: number[][]
  error: string | null
  nRows: number
  nCols: number
  skippedRows: number // rows dropped by listwise deletion
}

/**
 * Parse a plain-text CSV into a numeric matrix.
 *
 * Robustness guarantees:
 *  - Mixed line endings: \r\n, \r, \n all accepted.
 *  - Trailing commas stripped before splitting (Excel/Numbers export artefact).
 *  - Whitespace trimmed around every cell value.
 *  - Empty rows skipped silently.
 *  - Rows with any missing or non-numeric cell are dropped via listwise
 *    deletion; the count is reported in `skippedRows` so the UI can warn.
 *  - A descriptive `error` string is returned only for structural problems
 *    (too few complete rows, inconsistent column count, fewer than 2 items).
 */
export function parseCSV(raw: string, hasHeader: boolean): ParseResult {
  // Normalise all line ending variants, then drop blank lines.
  const lines = raw
    .trim()
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== "")

  const dataLines = hasHeader ? lines.slice(1) : lines

  if (dataLines.length < 1) {
    return { data: [], error: "No data rows found.", nRows: 0, nCols: 0, skippedRows: 0 }
  }

  const complete: number[][] = []
  let skippedRows = 0

  for (const line of dataLines) {
    // Strip trailing commas (and surrounding whitespace) produced by
    // spreadsheet exporters: "4,3,5,," → "4,3,5"
    const trimmed = line.replace(/[,\s]+$/, "")
    if (!trimmed) { skippedRows++; continue }

    const cells = trimmed.split(",").map((c) => c.trim())

    // Listwise deletion: skip rows with any empty or non-numeric cell.
    const hasMissing = cells.some((c) => c === "" || isNaN(Number(c)))
    if (hasMissing) { skippedRows++; continue }

    complete.push(cells.map(Number))
  }

  if (complete.length < 2) {
    return {
      data: [],
      error: `Need at least 2 complete rows; got ${complete.length}${skippedRows ? ` (${skippedRows} row(s) dropped due to missing values)` : ""}.`,
      nRows: 0,
      nCols: 0,
      skippedRows,
    }
  }

  // Validate consistent column count across all complete rows.
  const nCols = complete[0].length
  const badRow = complete.findIndex((r) => r.length !== nCols)
  if (badRow !== -1) {
    return {
      data: [],
      error: `Inconsistent columns: expected ${nCols} but row ${badRow + 1} has ${complete[badRow].length}. Check for extra commas.`,
      nRows: 0,
      nCols: 0,
      skippedRows,
    }
  }

  if (nCols < 2) {
    return { data: [], error: "At least 2 item columns are required.", nRows: 0, nCols: 0, skippedRows }
  }

  return { data: complete, error: null, nRows: complete.length, nCols, skippedRows }
}

export const SAMPLE_CSV = `4,3,5,4,4
2,2,3,2,3
5,4,5,5,5
3,3,4,3,4
4,4,4,4,4
2,3,3,2,3
5,5,5,5,5
3,4,4,3,4
4,4,5,4,5
2,2,2,2,2
3,3,4,3,3
4,4,4,4,4
5,4,5,5,4
2,3,3,3,3
4,4,4,4,4
3,3,3,3,3
5,5,5,4,5
2,2,3,2,2
4,3,4,4,4
3,4,4,3,4`
