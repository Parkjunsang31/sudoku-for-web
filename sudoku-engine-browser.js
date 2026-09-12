// ===== Sudoku core engine: generation, solving, validation =====

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeEmptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function isValidPlacement(grid, row, col, num) {
  for (let x = 0; x < 9; x++) {
    if (grid[row][x] === num) return false;
    if (grid[x][col] === num) return false;
  }
  const startRow = row - (row % 3);
  const startCol = col - (col % 3);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[startRow + r][startCol + c] === num) return false;
    }
  }
  return true;
}

// Fill a full valid solved grid via randomized backtracking
function fillGrid(grid) {
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    if (grid[row][col] !== 0) continue;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const num of nums) {
      if (isValidPlacement(grid, row, col, num)) {
        grid[row][col] = num;
        if (isGridFull(grid) || fillGrid(grid)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }
  return true;
}

function isGridFull(grid) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (grid[r][c] === 0) return false;
  return true;
}

// Count solutions up to `limit` (used to verify uniqueness). Uses backtracking.
function countSolutions(grid, limit = 2) {
  let count = 0;
  const g = grid.map((row) => row.slice());

  function solve() {
    if (count >= limit) return;
    let row = -1, col = -1;
    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === 0) { row = r; col = c; break outer; }
      }
    }
    if (row === -1) { count++; return; }
    for (let num = 1; num <= 9; num++) {
      if (count >= limit) return;
      if (isValidPlacement(g, row, col, num)) {
        g[row][col] = num;
        solve();
        g[row][col] = 0;
      }
    }
  }
  solve();
  return count;
}

const DIFFICULTY_CLUES = {
  easy: 42,
  medium: 34,
  hard: 28,
  expert: 24,
};

function generatePuzzle(difficulty = 'medium') {
  const solution = makeEmptyGrid();
  fillGrid(solution);

  const puzzle = solution.map((row) => row.slice());
  const cellOrder = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
  );

  const targetClues = DIFFICULTY_CLUES[difficulty] ?? DIFFICULTY_CLUES.medium;
  let clueCount = 81;

  for (const [r, c] of cellOrder) {
    if (clueCount <= targetClues) break;
    const backup = puzzle[r][c];
    if (backup === 0) continue;
    puzzle[r][c] = 0;
    const solCount = countSolutions(puzzle, 2);
    if (solCount !== 1) {
      puzzle[r][c] = backup; // must keep for uniqueness
    } else {
      clueCount--;
    }
  }

  return { puzzle, solution };
}

// Returns array of {row,col} cells that conflict with the given cell's value (row/col/box duplicates), ignoring 0s
function findConflicts(grid, row, col) {
  const conflicts = [];
  const val = grid[row][col];
  if (!val) return conflicts;
  for (let x = 0; x < 9; x++) {
    if (x !== col && grid[row][x] === val) conflicts.push([row, x]);
    if (x !== row && grid[x][col] === val) conflicts.push([x, col]);
  }
  const startRow = row - (row % 3);
  const startCol = col - (col % 3);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const rr = startRow + r, cc = startCol + c;
      if ((rr !== row || cc !== col) && grid[rr][cc] === val) {
        if (!conflicts.some(([a, b]) => a === rr && b === cc)) conflicts.push([rr, cc]);
      }
    }
  }
  return conflicts;
}


window.SudokuEngine = {
  makeEmptyGrid,
  isValidPlacement,
  fillGrid,
  isGridFull,
  countSolutions,
  generatePuzzle,
  findConflicts,
  DIFFICULTY_CLUES,
};
