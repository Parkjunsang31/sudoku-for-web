(function () {
  'use strict';
  const Engine = window.SudokuEngine;

  // ---------- State ----------
  const state = {
    puzzle: null,      // original given clues (0 = empty)
    solution: null,     // full solved grid
    values: null,        // current player-entered values (0 = empty), includes givens
    notes: null,         // 9x9 array of Set<number>
    given: null,         // 9x9 boolean, true if clue
    selectedCell: null,  // [row, col] or null
    selectedNumber: null,// 1-9 or null (for number-first mode)
    activeTool: null,    // 'note' | 'erase' | null
    difficulty: 'medium',
    mistakes: 0,
    history: [],
    future: [],
    startTime: null,
    elapsedBeforePause: 0,
    timerInterval: null,
    solved: false,
    isDragging: false,
    settings: {
      numberFirst: false,
      clickToSelect: true,
      dragInput: true,
      showErrors: true,
      highlightSameNumber: true,
    },
  };

  // ---------- DOM refs ----------
  const boardEl = document.getElementById('board');
  const numpadEl = document.getElementById('numpad');
  const timerEl = document.getElementById('timer');
  const mistakesEl = document.getElementById('mistakes');
  const diffLabelEl = document.getElementById('diffLabel');
  const statusBanner = document.getElementById('statusBanner');
  const btnNote = document.getElementById('btnNote');
  const btnErase = document.getElementById('btnErase');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnNewGame = document.getElementById('btnNewGame');
  const diffRow = document.getElementById('diffRow');

  const toggleDarkMode = document.getElementById('toggleDarkMode');
  const toggleNumberFirst = document.getElementById('toggleNumberFirst');
  const toggleClickSelect = document.getElementById('toggleClickSelect');
  const toggleDrag = document.getElementById('toggleDrag');
  const toggleErrors = document.getElementById('toggleErrors');
  const toggleSameNum = document.getElementById('toggleSameNum');

  const DIFF_LABELS = { easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가' };

  // ---------- Build board DOM once ----------
  const cellEls = [];
  for (let r = 0; r < 9; r++) {
    cellEls.push([]);
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.tabIndex = 0;
      cell.setAttribute('role', 'gridcell');
      boardEl.appendChild(cell);
      cellEls[r].push(cell);

      cell.addEventListener('mousedown', (e) => { e.preventDefault(); onCellPointerDown(r, c); });
      cell.addEventListener('mouseenter', () => onCellPointerEnter(r, c));
      cell.addEventListener('touchstart', (e) => { e.preventDefault(); onCellPointerDown(r, c); }, { passive: false });
    }
  }
  document.addEventListener('mouseup', () => { state.isDragging = false; });
  document.addEventListener('touchend', () => { state.isDragging = false; });

  // Build numpad
  const numBtns = [];
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.textContent = n;
    btn.dataset.num = n;
    numpadEl.appendChild(btn);
    numBtns.push(btn);
    btn.addEventListener('click', () => onNumberButtonClick(n));
  }
  // fill remaining grid cells so numpad is 5-wide x2 (10 slots, 9 used)
  const spacer = document.createElement('div');
  numpadEl.appendChild(spacer);

  // ---------- History (undo/redo) ----------
  function snapshot() {
    return {
      values: state.values.map((row) => row.slice()),
      notes: state.notes.map((row) => row.map((s) => new Set(s))),
    };
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 200) state.history.shift();
    state.future = [];
    updateUndoRedoButtons();
  }
  function undo() {
    if (state.history.length === 0) return;
    state.future.push(snapshot());
    const prev = state.history.pop();
    state.values = prev.values;
    state.notes = prev.notes;
    updateUndoRedoButtons();
    renderAll();
    checkSolved();
  }
  function redo() {
    if (state.future.length === 0) return;
    state.history.push(snapshot());
    const next = state.future.pop();
    state.values = next.values;
    state.notes = next.notes;
    updateUndoRedoButtons();
    renderAll();
    checkSolved();
  }
  function updateUndoRedoButtons() {
    btnUndo.disabled = state.history.length === 0;
    btnRedo.disabled = state.future.length === 0;
  }

  // ---------- Game lifecycle ----------
  function newGame(difficulty) {
    state.difficulty = difficulty || state.difficulty;
    diffLabelEl.textContent = DIFF_LABELS[state.difficulty];
    diffRow.querySelectorAll('.diff-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.diff === state.difficulty);
    });

    const { puzzle, solution } = Engine.generatePuzzle(state.difficulty);
    state.puzzle = puzzle;
    state.solution = solution;
    state.values = puzzle.map((row) => row.slice());
    state.notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
    state.given = puzzle.map((row) => row.map((v) => v !== 0));
    state.selectedCell = null;
    state.selectedNumber = null;
    state.activeTool = null;
    state.history = [];
    state.future = [];
    state.mistakes = 0;
    state.solved = false;
    statusBanner.classList.remove('show');
    updateMistakesDisplay();

    updateUndoRedoButtons();
    startTimer();
    renderAll();
  }

  function startTimer() {
    clearInterval(state.timerInterval);
    state.startTime = Date.now();
    state.elapsedBeforePause = 0;
    state.timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }
  function stopTimer() {
    clearInterval(state.timerInterval);
  }
  function updateTimerDisplay() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }

  function updateMistakesDisplay() {
    mistakesEl.textContent = `실수 ${state.mistakes}`;
  }

  function clearPeerNotes(row, col, num) {
    for (let x = 0; x < 9; x++) {
      if (x !== col) state.notes[row][x].delete(num);
      if (x !== row) state.notes[x][col].delete(num);
    }
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const rr = startRow + r, cc = startCol + c;
        if (rr !== row || cc !== col) state.notes[rr][cc].delete(num);
      }
    }
  }

  function hasNoteConflict(row, col, num) {
    for (let x = 0; x < 9; x++) {
      if (x !== col && state.values[row][x] === num) return true;
      if (x !== row && state.values[x][col] === num) return true;
    }
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const rr = startRow + r, cc = startCol + c;
        if ((rr !== row || cc !== col) && state.values[rr][cc] === num) return true;
      }
    }
    return false;
  }

  function checkSolved() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (state.values[r][c] !== state.solution[r][c]) return;
      }
    }
    state.solved = true;
    stopTimer();
    statusBanner.classList.add('show');
  }

  // ---------- Interaction: cell selection / value application ----------
  function selectCell(r, c) {
    state.selectedCell = [r, c];
    renderAll();
  }

  function applyNumberFirstClick(r, c) {
    // number-first mode: a tool (number or erase) must be pre-selected; clicking board applies it
    if (state.given[r][c]) { selectCell(r, c); return; }

    if (state.activeTool === 'erase') {
      eraseCell(r, c);
      selectCell(r, c);
      return;
    }
    if (state.selectedNumber != null) {
      if (state.activeTool === 'note') {
        toggleNote(r, c, state.selectedNumber);
      } else {
        setValue(r, c, state.selectedNumber);
      }
      selectCell(r, c);
      return;
    }
    // nothing selected yet — just select the cell
    selectCell(r, c);
  }

  function applyClassicClick(r, c) {
    // classic mode: click cell first, selection only. Number/erase applied via numpad afterwards.
    if (state.settings.clickToSelect && state.given[r][c] === false && state.values[r][c] !== 0) {
      state.selectedNumber = state.values[r][c];
    }
    selectCell(r, c);
  }

  function onCellPointerDown(r, c) {
    state.isDragging = true;
    if (state.settings.numberFirst) {
      applyNumberFirstClick(r, c);
    } else {
      applyClassicClick(r, c);
    }
  }

  function onCellPointerEnter(r, c) {
    if (!state.isDragging || !state.settings.dragInput) return;
    if (state.given[r][c]) return;

    if (state.settings.numberFirst) {
      if (state.activeTool === 'erase') {
        eraseCell(r, c);
      } else if (state.selectedNumber != null) {
        if (state.activeTool === 'note') toggleNote(r, c, state.selectedNumber, true);
        else setValue(r, c, state.selectedNumber);
      }
    } else {
      // classic drag: only meaningful with a tool active (note/erase) + number chosen
      if (state.activeTool === 'erase') {
        eraseCell(r, c);
      } else if (state.activeTool === 'note' && state.selectedNumber != null) {
        toggleNote(r, c, state.selectedNumber, true);
      }
    }
    renderAll();
  }

  function setValue(r, c, num) {
    if (state.given[r][c]) return;
    pushHistory();
    state.values[r][c] = num;
    state.notes[r][c].clear();
    clearPeerNotes(r, c, num);
    if (num !== state.solution[r][c]) {
      state.mistakes++;
      updateMistakesDisplay();
    }
    renderAll();
    checkSolved();
  }

  function eraseCell(r, c) {
    if (state.given[r][c]) return;
    if (state.values[r][c] === 0 && state.notes[r][c].size === 0) return;
    pushHistory();
    state.values[r][c] = 0;
    state.notes[r][c].clear();
    renderAll();
  }

  function toggleNote(r, c, num, forceAddOnly) {
    if (state.given[r][c] || state.values[r][c] !== 0) return;
    pushHistory();
    const set = state.notes[r][c];
    if (forceAddOnly) {
      set.add(num);
    } else {
      if (set.has(num)) set.delete(num); else set.add(num);
    }
    renderAll();
  }

  // ---------- Numpad / tool button handling ----------
  function onNumberButtonClick(n) {
    if (state.settings.numberFirst) {
      // select this number as the active tool payload
      state.selectedNumber = (state.selectedNumber === n && state.activeTool !== 'erase') ? null : n;
      if (state.activeTool === 'erase') state.activeTool = null;
      renderAll();
      return;
    }
    // classic mode: a cell must already be selected
    if (!state.selectedCell) return;
    const [r, c] = state.selectedCell;
    if (state.given[r][c]) return;
    if (state.activeTool === 'note') {
      toggleNote(r, c, n);
    } else {
      setValue(r, c, n);
      state.selectedNumber = n;
    }
    renderAll();
  }

  function setActiveTool(tool) {
    state.activeTool = state.activeTool === tool ? null : tool;
    renderAll();
  }

  btnNote.addEventListener('click', () => setActiveTool('note'));
  btnErase.addEventListener('click', () => {
    if (!state.settings.numberFirst && state.selectedCell) {
      const [r, c] = state.selectedCell;
      eraseCell(r, c);
    }
    setActiveTool('erase');
  });
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnNewGame.addEventListener('click', () => newGame(state.difficulty));

  diffRow.querySelectorAll('.diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => newGame(btn.dataset.diff));
  });

  // ---------- Settings toggles ----------
  toggleDarkMode.addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
  });
  toggleNumberFirst.addEventListener('change', (e) => {
    state.settings.numberFirst = e.target.checked;
    state.selectedNumber = null;
    state.activeTool = null;
    renderAll();
  });
  toggleClickSelect.addEventListener('change', (e) => { state.settings.clickToSelect = e.target.checked; });
  toggleDrag.addEventListener('change', (e) => { state.settings.dragInput = e.target.checked; });
  toggleErrors.addEventListener('change', (e) => { state.settings.showErrors = e.target.checked; renderAll(); });
  toggleSameNum.addEventListener('change', (e) => { state.settings.highlightSameNumber = e.target.checked; renderAll(); });

  // ---------- Keyboard controls ----------
  document.addEventListener('keydown', (e) => {
    const key = e.key;

    if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }

    if (key === 'n' || key === 'N') { setActiveTool('note'); return; }

    if (/^[1-9]$/.test(key) && state.settings.numberFirst) {
      e.preventDefault();
      onNumberButtonClick(parseInt(key, 10));
      return;
    }

    if (!state.selectedCell) {
      if (key.startsWith('Arrow')) {
        state.selectedCell = [0, 0];
        renderAll();
      }
      return;
    }
    let [r, c] = state.selectedCell;

    if (key.startsWith('Arrow')) {
      e.preventDefault();
      if (key === 'ArrowUp') r = Math.max(0, r - 1);
      if (key === 'ArrowDown') r = Math.min(8, r + 1);
      if (key === 'ArrowLeft') c = Math.max(0, c - 1);
      if (key === 'ArrowRight') c = Math.min(8, c + 1);
      selectCell(r, c);
      return;
    }

    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault();
      eraseCell(r, c);
      return;
    }

    if (/^[1-9]$/.test(key)) {
      e.preventDefault();
      const num = parseInt(key, 10);
      if (state.given[r][c]) return;
      if (e.shiftKey || state.activeTool === 'note') {
        toggleNote(r, c, num);
        state.selectedNumber = num;
        renderAll();
      } else {
        setValue(r, c, num);
        state.selectedNumber = num;
        renderAll();
      }
    }
  });

  // ---------- Rendering ----------
  function renderAll() {
    renderBoard();
    renderNumpad();
    renderTools();
  }

  function renderBoard() {
    const sel = state.selectedCell;
    const selCellVal = sel ? state.values[sel[0]][sel[1]] : 0;
    const selVal = selCellVal !== 0 ? selCellVal : (state.selectedNumber || 0);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = cellEls[r][c];
        const val = state.values[r][c];
        const isGiven = state.given[r][c];

        cell.innerHTML = '';
        cell.classList.remove('given', 'entered', 'error', 'peer', 'same-num', 'selected', 'note-match');

        if (val !== 0) {
          cell.textContent = val;
          cell.classList.add(isGiven ? 'given' : 'entered');
        } else if (state.notes[r][c].size > 0) {
          const grid = document.createElement('div');
          grid.className = 'notes-grid';
          for (let n = 1; n <= 9; n++) {
            const span = document.createElement('span');
            if (state.notes[r][c].has(n)) {
              span.textContent = n;
              if (state.settings.showErrors && hasNoteConflict(r, c, n)) {
                span.classList.add('note-error');
              } else if (state.settings.highlightSameNumber && selVal !== 0 && n === selVal) {
                span.classList.add('note-selected');
              }
            }
            grid.appendChild(span);
          }
          cell.appendChild(grid);
        }

        if (state.settings.showErrors && val !== 0 && val !== state.solution[r][c]) {
          cell.classList.add('error');
        }

        if (sel) {
          const [sr, sc] = sel;
          const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3);
          if (r === sr || c === sc || sameBox) cell.classList.add('peer');
          if (r === sr && c === sc) cell.classList.add('selected');
        }

        if (state.settings.highlightSameNumber && selVal !== 0 && val === selVal && !(sel && r === sel[0] && c === sel[1])) {
          cell.classList.add('same-num');
        } else if (state.settings.highlightSameNumber && selVal !== 0 && val === 0 && state.notes[r][c].has(selVal)) {
          cell.classList.add('note-match');
        }
      }
    }
  }

  function renderNumpad() {
    // count how many of each number are placed (for exhausted styling)
    const counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const v = state.values[r][c];
      if (v) counts[v]++;
    }
    numBtns.forEach((btn) => {
      const n = parseInt(btn.dataset.num, 10);
      btn.classList.toggle('active', state.settings.numberFirst && state.selectedNumber === n && state.activeTool !== 'erase');
      btn.classList.toggle('exhausted', counts[n] >= 9);
    });
  }

  function renderTools() {
    btnNote.classList.toggle('active', state.activeTool === 'note');
    btnErase.classList.toggle('active', state.activeTool === 'erase');
  }

  // ---------- Init ----------
  newGame('medium');
})();
