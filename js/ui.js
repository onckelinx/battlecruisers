/* Battlecruisers — rendering, input and game flow. */
(function () {
  'use strict';

  var R = BC.rules;
  var AI = BC.ai;
  var SIZE = R.SIZE;
  var STORE_KEY = 'battlecruisers.level';
  var COMPUTER_DELAY = 600;

  function $(id) { return document.getElementById(id); }

  var els = {
    level: $('level'),
    newGame: $('new-game'),
    status: $('status'),
    setup: $('setup'),
    roster: $('roster'),
    rotate: $('rotate'),
    random: $('random'),
    clear: $('clear'),
    start: $('start'),
    result: $('result'),
    resultTitle: $('result-title'),
    resultText: $('result-text'),
    playAgain: $('play-again'),
    playerWrap: $('player-wrap'),
    enemyWrap: $('enemy-wrap'),
    playerBoard: $('player-board'),
    enemyBoard: $('enemy-board'),
    playerFleet: $('player-fleet'),
    enemyFleet: $('enemy-fleet')
  };

  var state;
  var timer = null;

  // ---- Settings ----

  function loadLevel() {
    try {
      var v = localStorage.getItem(STORE_KEY);
      if (AI.LEVELS.indexOf(v) !== -1) return v;
    } catch (e) { /* storage unavailable */ }
    return 'normal';
  }

  function saveLevel(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* storage unavailable */ }
  }

  // ---- Building the DOM (once) ----

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function pipsEl(len) {
    var wrap = el('span', 'pips');
    for (var i = 0; i < len; i++) wrap.appendChild(el('span', 'pip'));
    return wrap;
  }

  function buildBoard(container) {
    container.appendChild(el('span', 'label'));
    for (var c = 0; c < SIZE; c++) container.appendChild(el('span', 'label', R.COLS[c]));
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      container.appendChild(el('span', 'label', String(r + 1)));
      var row = [];
      for (c = 0; c < SIZE; c++) {
        var b = el('button', 'cell');
        b.type = 'button';
        b.dataset.r = r;
        b.dataset.c = c;
        b.setAttribute('aria-label', R.coord(r, c));
        container.appendChild(b);
        row.push(b);
      }
      cells.push(row);
    }
    return cells;
  }

  function buildFleet(list) {
    return R.FLEET.map(function (s) {
      var li = el('li');
      li.appendChild(el('span', '', s.name));
      li.appendChild(pipsEl(s.len));
      list.appendChild(li);
      return li;
    });
  }

  function buildRoster() {
    return R.FLEET.map(function (s, i) {
      var b = el('button', 'ship-btn');
      b.type = 'button';
      b.appendChild(el('span', '', s.name));
      b.appendChild(pipsEl(s.len));
      b.addEventListener('click', function () { onRosterClick(i); });
      els.roster.appendChild(b);
      return b;
    });
  }

  var playerCells = buildBoard(els.playerBoard);
  var enemyCells = buildBoard(els.enemyBoard);
  var playerFleetItems = buildFleet(els.playerFleet);
  var enemyFleetItems = buildFleet(els.enemyFleet);
  var rosterItems = buildRoster();

  // ---- Game flow ----

  function newGame() {
    clearTimeout(timer);
    state = {
      phase: 'setup',
      player: R.createBoard(),
      enemy: R.createBoard(),
      selected: 0,
      dir: 'h',
      hover: null,
      turn: 'player',
      stats: { player: { shots: 0, hits: 0 }, computer: { shots: 0, hits: 0 } },
      last: { player: null, computer: null }
    };
    setStatus(setupMessage());
    render();
  }

  function nextUnplaced() {
    for (var i = 0; i < state.player.ships.length; i++) {
      if (!state.player.ships[i].cells.length) return i;
    }
    return -1;
  }

  function setupMessage() {
    if (state.selected !== -1) {
      var s = state.player.ships[state.selected];
      return 'Place your ' + s.name + ' (' + s.len + ' squares) on your board. ' +
        'Press R or right-click to rotate. Ships may not touch.';
    }
    if (R.fleetPlaced(state.player)) return 'Fleet ready. Press Start battle when you are.';
    return 'Pick a ship to place.';
  }

  // Top-left square of the selected ship when hovering (r, c), kept inside the board.
  function anchor(r, c) {
    var len = state.player.ships[state.selected].len;
    return state.dir === 'h' ? [r, Math.min(c, SIZE - len)] : [Math.min(r, SIZE - len), c];
  }

  function rotate() {
    if (state.phase !== 'setup') return;
    state.dir = state.dir === 'h' ? 'v' : 'h';
    render();
  }

  function onRosterClick(i) {
    if (state.phase !== 'setup') return;
    var ship = state.player.ships[i];
    if (ship.cells.length) {
      state.dir = ship.dir;
      R.removeShip(state.player, i);
    }
    state.selected = i;
    setStatus(setupMessage());
    render();
  }

  function onPlayerClick(r, c) {
    if (state.phase !== 'setup') return;
    var board = state.player;
    var occupant = board.grid[r][c].ship;
    if (occupant !== -1) {
      // Pick a placed ship back up.
      state.dir = board.ships[occupant].dir;
      R.removeShip(board, occupant);
      state.selected = occupant;
    } else if (state.selected !== -1) {
      var p = anchor(r, c);
      if (R.placeShip(board, state.selected, p[0], p[1], state.dir)) state.selected = nextUnplaced();
    }
    setStatus(setupMessage());
    render();
  }

  function randomize() {
    if (state.phase !== 'setup') return;
    R.randomFleet(state.player);
    state.selected = -1;
    setStatus(setupMessage());
    render();
  }

  function clearBoard() {
    if (state.phase !== 'setup') return;
    R.clearFleet(state.player);
    state.selected = 0;
    state.dir = 'h';
    setStatus(setupMessage());
    render();
  }

  function startBattle() {
    if (state.phase !== 'setup' || !R.fleetPlaced(state.player)) return;
    R.randomFleet(state.enemy);
    state.phase = 'battle';
    state.turn = 'player';
    state.hover = null;
    setStatus('Battle stations! You fire first: pick a square in enemy waters.');
    render();
  }

  function onEnemyClick(r, c) {
    if (state.phase !== 'battle' || state.turn !== 'player') return;
    var res = R.fire(state.enemy, r, c);
    if (res.result === 'repeat') return;

    var s = state.stats.player;
    s.shots++;
    if (res.result !== 'miss') s.hits++;
    state.last.player = [r, c];

    var at = R.coord(r, c);
    var msg = res.result === 'miss' ? 'Miss at ' + at + '.'
      : res.result === 'hit' ? 'Hit at ' + at + '!'
      : 'You sank their ' + res.ship.name + '!';

    if (R.allSunk(state.enemy)) {
      endGame(true, msg + ' The enemy fleet is destroyed.');
      return;
    }
    state.turn = 'computer';
    state.playerMsg = msg;
    setStatus(msg + ' The computer is aiming…');
    render();
    timer = setTimeout(computerTurn, COMPUTER_DELAY);
  }

  function computerTurn() {
    if (state.phase !== 'battle') return;
    var board = state.player;
    var shot = AI.chooseShot(R.viewOf(board), R.remaining(board), els.level.value);
    var res = R.fire(board, shot[0], shot[1]);

    var s = state.stats.computer;
    s.shots++;
    if (res.result !== 'miss') s.hits++;
    state.last.computer = shot;

    var at = R.coord(shot[0], shot[1]);
    var msg = res.result === 'sunk' ? 'The computer sank your ' + res.ship.name + '!'
      : 'The computer fires at ' + at + (res.result === 'hit' ? ': hit!' : ': miss.');

    if (R.allSunk(board)) {
      endGame(false, msg + ' Your fleet is lost.');
      return;
    }
    state.turn = 'player';
    setStatus(state.playerMsg + ' ' + msg + ' Your turn.');
    render();
  }

  function endGame(won, msg) {
    state.phase = 'over';
    var p = state.stats.player;
    var accuracy = p.shots ? Math.round((100 * p.hits) / p.shots) : 0;
    var sunk = state.enemy.ships.filter(function (x) { return x.sunk; }).length;

    els.result.className = 'panel result ' + (won ? 'win' : 'loss');
    els.resultTitle.textContent = won ? 'Victory!' : 'Defeat';
    els.resultText.textContent = won
      ? 'You sank the enemy fleet in ' + p.shots + ' shots: ' + p.hits + ' hits, ' + accuracy + '% accuracy.'
      : 'The computer sank your fleet in ' + state.stats.computer.shots + ' shots. You fired ' + p.shots +
        ' shots with ' + accuracy + '% accuracy and sank ' + sunk + ' of ' + state.enemy.ships.length + ' ships.';
    setStatus(msg);
    render();
  }

  // ---- Rendering ----

  function setStatus(text) {
    els.status.textContent = text;
  }

  function previewCells() {
    if (state.phase !== 'setup' || state.selected === -1 || !state.hover) return null;
    var ship = state.player.ships[state.selected];
    var p = anchor(state.hover[0], state.hover[1]);
    var ok = R.canPlace(state.player, ship.len, p[0], p[1], state.dir, state.selected);
    var keys = {};
    R.shipCells(ship.len, p[0], p[1], state.dir).forEach(function (q) { keys[q[0] + ',' + q[1]] = true; });
    return { keys: keys, cls: ok ? 'preview-ok' : 'preview-bad' };
  }

  function renderBoard(cells, board, opts) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = board.grid[r][c];
        var ship = cell.ship !== -1 ? board.ships[cell.ship] : null;
        var cls = ['cell'];

        if (ship && (opts.own || opts.reveal || ship.sunk)) {
          var i = ship.dir === 'h' ? c - ship.cells[0][1] : r - ship.cells[0][0];
          cls.push('ship', ship.dir);
          if (i === 0) cls.push('bow');
          if (i === ship.len - 1) cls.push('stern');
        }
        if (cell.shot && ship) cls.push(ship.sunk ? 'sunk' : 'hit');
        if (cell.shot && !ship) cls.push('miss', 'known');
        if (cell.auto) cls.push('known');

        var open = !cell.shot && !cell.auto;
        if (open) cls.push('open');
        if (opts.last && opts.last[0] === r && opts.last[1] === c) cls.push('last');
        if (opts.preview && opts.preview.keys[r + ',' + c]) cls.push(opts.preview.cls);

        var b = cells[r][c];
        b.className = cls.join(' ');
        b.disabled = !(opts.clickable && (opts.own || open));
      }
    }
  }

  function renderFleet(items, board, own) {
    board.ships.forEach(function (ship, i) {
      var li = items[i];
      li.className = ship.sunk ? 'sunk' : '';
      var pips = li.querySelectorAll('.pip');
      for (var k = 0; k < pips.length; k++) {
        pips[k].className = own && k < ship.hits ? 'pip hit' : 'pip';
      }
    });
  }

  function render() {
    var setup = state.phase === 'setup';
    var battle = state.phase === 'battle';
    var over = state.phase === 'over';
    var playerTurn = battle && state.turn === 'player';

    els.setup.hidden = !setup;
    els.result.hidden = !over;
    els.level.disabled = battle;
    els.start.disabled = !R.fleetPlaced(state.player);

    rosterItems.forEach(function (b, i) {
      var placed = state.player.ships[i].cells.length > 0;
      b.className = 'ship-btn' + (i === state.selected ? ' selected' : '') + (placed ? ' placed' : '');
    });

    renderBoard(playerCells, state.player, {
      own: true,
      clickable: setup,
      preview: previewCells(),
      last: state.last.computer
    });
    renderBoard(enemyCells, state.enemy, {
      own: false,
      reveal: over,
      clickable: playerTurn,
      last: state.last.player
    });

    els.playerBoard.classList.toggle('placing', setup);
    els.enemyBoard.classList.toggle('targeting', playerTurn);
    els.enemyWrap.classList.toggle('active', playerTurn);
    els.playerWrap.classList.toggle('active', battle && !playerTurn);

    renderFleet(playerFleetItems, state.player, true);
    renderFleet(enemyFleetItems, state.enemy, false);
  }

  // ---- Input ----

  function cellAt(event) {
    var b = event.target.closest('.cell');
    return b ? [Number(b.dataset.r), Number(b.dataset.c)] : null;
  }

  function hoverAt(event) {
    if (state.phase !== 'setup') return;
    var p = cellAt(event);
    if (!p || (state.hover && state.hover[0] === p[0] && state.hover[1] === p[1])) return;
    state.hover = p;
    render();
  }

  els.playerBoard.addEventListener('click', function (e) {
    var p = cellAt(e);
    if (p) onPlayerClick(p[0], p[1]);
  });
  els.playerBoard.addEventListener('mouseover', hoverAt);
  els.playerBoard.addEventListener('focusin', hoverAt);
  els.playerBoard.addEventListener('mouseleave', function () {
    if (!state.hover) return;
    state.hover = null;
    render();
  });
  els.playerBoard.addEventListener('contextmenu', function (e) {
    if (state.phase !== 'setup') return;
    e.preventDefault();
    rotate();
  });

  els.enemyBoard.addEventListener('click', function (e) {
    var p = cellAt(e);
    if (p) onEnemyClick(p[0], p[1]);
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'SELECT') {
      rotate();
    }
  });

  els.rotate.addEventListener('click', rotate);
  els.random.addEventListener('click', randomize);
  els.clear.addEventListener('click', clearBoard);
  els.start.addEventListener('click', startBattle);
  els.playAgain.addEventListener('click', newGame);
  els.newGame.addEventListener('click', function () {
    if (state.phase === 'battle' && !window.confirm('Abandon this battle and start a new game?')) return;
    newGame();
  });
  els.level.addEventListener('change', function () { saveLevel(els.level.value); });

  els.level.value = loadLevel();
  newGame();
})();
