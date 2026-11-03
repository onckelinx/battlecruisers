/* Battlecruisers — game rules. Pure logic, no DOM. */
(function () {
  'use strict';

  var BC = (window.BC = window.BC || {});

  var SIZE = 10;
  var COLS = 'ABCDEFGHIJ';
  var FLEET = [
    { name: 'Carrier', len: 5 },
    { name: 'Battlecruiser', len: 4 },
    { name: 'Cruiser', len: 3 },
    { name: 'Frigate', len: 3 },
    { name: 'Patrol boat', len: 2 }
  ];

  function createBoard() {
    var grid = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        // ship: index into board.ships, or -1 for open water
        // shot: fired upon; auto: known water next to a sunk ship
        row.push({ ship: -1, shot: false, auto: false });
      }
      grid.push(row);
    }
    var ships = FLEET.map(function (s) {
      return { name: s.name, len: s.len, dir: 'h', cells: [], hits: 0, sunk: false };
    });
    return { grid: grid, ships: ships };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function shipCells(len, r, c, dir) {
    var cells = [];
    for (var i = 0; i < len; i++) {
      cells.push(dir === 'h' ? [r, c + i] : [r + i, c]);
    }
    return cells;
  }

  // Ships may not overlap or touch, not even diagonally.
  // `ignore` is the index of a ship being moved, so it doesn't block itself.
  function canPlace(board, len, r, c, dir, ignore) {
    var cells = shipCells(len, r, c, dir);
    for (var i = 0; i < cells.length; i++) {
      var cr = cells[i][0], cc = cells[i][1];
      if (!inBounds(cr, cc)) return false;
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var nr = cr + dr, nc = cc + dc;
          if (!inBounds(nr, nc)) continue;
          var other = board.grid[nr][nc].ship;
          if (other !== -1 && other !== ignore) return false;
        }
      }
    }
    return true;
  }

  function removeShip(board, index) {
    var ship = board.ships[index];
    ship.cells.forEach(function (p) {
      board.grid[p[0]][p[1]].ship = -1;
    });
    ship.cells = [];
  }

  function placeShip(board, index, r, c, dir) {
    var ship = board.ships[index];
    if (!canPlace(board, ship.len, r, c, dir, index)) return false;
    removeShip(board, index);
    ship.dir = dir;
    ship.cells = shipCells(ship.len, r, c, dir);
    ship.cells.forEach(function (p) {
      board.grid[p[0]][p[1]].ship = index;
    });
    return true;
  }

  function clearFleet(board) {
    board.ships.forEach(function (_, i) {
      removeShip(board, i);
    });
  }

  function fleetPlaced(board) {
    return board.ships.every(function (s) {
      return s.cells.length > 0;
    });
  }

  function randomFleet(board, rng) {
    rng = rng || Math.random;
    for (var attempt = 0; attempt < 100; attempt++) {
      clearFleet(board);
      var ok = true;
      for (var i = 0; i < board.ships.length && ok; i++) {
        var placed = false;
        for (var t = 0; t < 200 && !placed; t++) {
          var dir = rng() < 0.5 ? 'h' : 'v';
          var r = Math.floor(rng() * SIZE);
          var c = Math.floor(rng() * SIZE);
          placed = placeShip(board, i, r, c, dir);
        }
        ok = placed;
      }
      if (ok) return board;
    }
    throw new Error('Could not place a random fleet');
  }

  // Mark every cell around a sunk ship as known water.
  function markAround(board, ship) {
    ship.cells.forEach(function (p) {
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var nr = p[0] + dr, nc = p[1] + dc;
          if (!inBounds(nr, nc)) continue;
          var cell = board.grid[nr][nc];
          if (cell.ship === -1 && !cell.shot) cell.auto = true;
        }
      }
    });
  }

  function fire(board, r, c) {
    var cell = board.grid[r][c];
    if (cell.shot || cell.auto) return { result: 'repeat' };
    cell.shot = true;
    if (cell.ship === -1) return { result: 'miss' };
    var ship = board.ships[cell.ship];
    ship.hits++;
    if (ship.hits === ship.len) {
      ship.sunk = true;
      markAround(board, ship);
      return { result: 'sunk', ship: ship };
    }
    return { result: 'hit', ship: ship };
  }

  function allSunk(board) {
    return board.ships.every(function (s) {
      return s.sunk;
    });
  }

  // What an opponent can see: 'unknown' | 'miss' | 'hit' | 'sunk' per cell.
  function viewOf(board) {
    return board.grid.map(function (row) {
      return row.map(function (cell) {
        if (cell.auto) return 'miss';
        if (!cell.shot) return 'unknown';
        if (cell.ship === -1) return 'miss';
        return board.ships[cell.ship].sunk ? 'sunk' : 'hit';
      });
    });
  }

  // Lengths of the ships still afloat (the fleet tracker shows this to both sides).
  function remaining(board) {
    return board.ships
      .filter(function (s) { return !s.sunk; })
      .map(function (s) { return s.len; });
  }

  function coord(r, c) {
    return COLS[c] + (r + 1);
  }

  BC.rules = {
    SIZE: SIZE,
    COLS: COLS,
    FLEET: FLEET,
    createBoard: createBoard,
    inBounds: inBounds,
    shipCells: shipCells,
    canPlace: canPlace,
    placeShip: placeShip,
    removeShip: removeShip,
    clearFleet: clearFleet,
    fleetPlaced: fleetPlaced,
    randomFleet: randomFleet,
    fire: fire,
    allSunk: allSunk,
    viewOf: viewOf,
    remaining: remaining,
    coord: coord
  };
})();
