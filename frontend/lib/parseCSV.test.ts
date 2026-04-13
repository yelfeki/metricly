import { parseCSV } from "./parseCSV"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ok(result: ReturnType<typeof parseCSV>) {
  if (result.error) throw new Error(`Expected success but got: ${result.error}`)
  return result
}
function err(result: ReturnType<typeof parseCSV>) {
  if (!result.error) throw new Error("Expected an error but got none")
  return result
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

const CLEAN = `4,3,5,4\n2,2,3,2\n5,4,5,5\n3,3,4,3`

test("parses a clean CSV", () => {
  const r = ok(parseCSV(CLEAN, false))
  expect(r.nRows).toBe(4)
  expect(r.nCols).toBe(4)
  expect(r.data[0]).toEqual([4, 3, 5, 4])
  expect(r.skippedRows).toBe(0)
})

test("skips header row when hasHeader=true", () => {
  const csv = `item1,item2,item3\n4,3,5\n2,2,3\n5,4,5`
  const r = ok(parseCSV(csv, true))
  expect(r.nRows).toBe(3)
  expect(r.data[0]).toEqual([4, 3, 5])
})

// ---------------------------------------------------------------------------
// Line ending variants
// ---------------------------------------------------------------------------

test("handles Windows CRLF line endings", () => {
  const csv = "4,3,5\r\n2,2,3\r\n5,4,5"
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(3)
})

test("handles old Mac CR-only line endings", () => {
  const csv = "4,3,5\r2,2,3\r5,4,5"
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(3)
})

test("handles mixed line endings in the same file", () => {
  const csv = "4,3,5\r\n2,2,3\r5,4,5\n3,3,4"
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(4)
})

// ---------------------------------------------------------------------------
// Trailing commas (spreadsheet export artefact)
// ---------------------------------------------------------------------------

test("strips a single trailing comma", () => {
  const csv = "4,3,5,\n2,2,3,\n5,4,5,"
  const r = ok(parseCSV(csv, false))
  expect(r.nCols).toBe(3)
  expect(r.skippedRows).toBe(0)
})

test("strips multiple trailing commas", () => {
  const csv = "4,3,5,,,\n2,2,3,,,\n5,4,5,,,"
  const r = ok(parseCSV(csv, false))
  expect(r.nCols).toBe(3)
})

test("strips trailing comma with surrounding whitespace", () => {
  const csv = "4,3,5 , \n2,2,3 , \n5,4,5 , "
  // trailing ", " after last value should not add an empty column
  const r = ok(parseCSV(csv, false))
  expect(r.nCols).toBe(3)
})

// ---------------------------------------------------------------------------
// Missing values → listwise deletion
// ---------------------------------------------------------------------------

test("skips rows with an empty cell and reports skippedRows", () => {
  const csv = `4,3,5\n2,,3\n5,4,5`
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(2)
  expect(r.skippedRows).toBe(1)
  expect(r.data).toEqual([[4, 3, 5], [5, 4, 5]])
})

test("skips rows with a non-numeric cell", () => {
  const csv = `4,3,5\n2,NA,3\n5,4,5`
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(2)
  expect(r.skippedRows).toBe(1)
})

test("skips rows with a dot placeholder", () => {
  const csv = `4,3,5\n2,.,3\n5,4,5`
  const r = ok(parseCSV(csv, false))
  expect(r.skippedRows).toBe(1)
})

test("handles multiple rows with missing values", () => {
  const csv = `4,3,5\n,3,5\n2,2,3\n5,,5\n3,4,5`
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(3)
  expect(r.skippedRows).toBe(2)
})

test("skips fully blank rows silently", () => {
  const csv = `4,3,5\n\n2,2,3\n\n5,4,5`
  const r = ok(parseCSV(csv, false))
  expect(r.nRows).toBe(3)
  expect(r.skippedRows).toBe(0) // blank rows are not counted as "missing-value" skips
})

// ---------------------------------------------------------------------------
// Whitespace tolerance
// ---------------------------------------------------------------------------

test("trims whitespace around cell values", () => {
  const csv = `4 , 3 , 5\n2 , 2 , 3\n5 , 4 , 5`
  const r = ok(parseCSV(csv, false))
  expect(r.data[0]).toEqual([4, 3, 5])
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

test("errors when fewer than 2 complete rows remain after deletion", () => {
  const csv = `4,3,5\nNA,NA,NA\nNA,NA,NA`
  err(parseCSV(csv, false))
})

test("errors when only 1 data row (no header)", () => {
  err(parseCSV("4,3,5", false))
})

test("errors when fewer than 2 items (columns)", () => {
  const csv = `4\n3\n5`
  err(parseCSV(csv, false))
})

test("errors on inconsistent column count across complete rows", () => {
  const csv = `4,3,5\n2,2\n5,4,5`
  err(parseCSV(csv, false))
})

test("errors when input is empty", () => {
  err(parseCSV("", false))
})

test("errors when input is only whitespace", () => {
  err(parseCSV("   \n  \n  ", false))
})

// ---------------------------------------------------------------------------
// Combination: trailing commas + missing values + mixed endings
// ---------------------------------------------------------------------------

test("handles trailing commas AND missing values together", () => {
  const csv = "4,3,5,\r\n2,,3,\r\n5,4,5,\n3,3,4,"
  const r = ok(parseCSV(csv, false))
  expect(r.nCols).toBe(3)
  expect(r.nRows).toBe(3)   // row 2 skipped (missing cell)
  expect(r.skippedRows).toBe(1)
})

test("real-world export: header + trailing commas + one NA row", () => {
  const csv = [
    "Q1,Q2,Q3,Q4,",
    "5,4,5,4,",
    "3,NA,3,3,",
    "4,4,4,4,",
    "2,2,2,2,",
  ].join("\r\n")
  const r = ok(parseCSV(csv, true))
  expect(r.nCols).toBe(4)
  expect(r.nRows).toBe(3)
  expect(r.skippedRows).toBe(1)
})
