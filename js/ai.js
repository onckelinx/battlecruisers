/* Battlecruisers — computer opponent.
   It only sees what a human would: a view grid of 'unknown' | 'miss' | 'hit' | 'sunk'
   cells and the lengths of the ships still afloat. */
(function () {
  'use strict';

  var BC = (window.BC = window.BC || {});
  var R = BC.rules;
  var SIZE = R.SIZE;
  var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function cellsWhere(view, test) {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (test(view[r][c], r, c)) out.push([r, c]);
      }
    }
    return out;
  }

  function isUnknown(v) {
    return v === 'unknown';
  }

  function unknownNeighbours(view, cells, dirs) {
    var out = [];
    cells.forEach(function (p) {
      dirs.forEach(function (d) {
        var r = p[0] + d[0], c = p[1] + d[1];
        if (R.inBounds(r, c) && view[r][c] === 'unknown') out.push([r, c]);
      });
    });
    return out;
  }

  // Ships can't touch, so the diagonal neighbours of a hit are always water.
  function deduce(view) {
    var known = view.map(function (row) { return row.slice(); });
    var hits = cellsWhere(view, function (v) { return v === 'hit'; });
    unknownNeighbours(view, hits, DIAG).forEach(function (p) {
      known[p[0]][p[1]] = 'miss';
    });
    return known;
  }

  // Easy: random shots, then tries random neighbours of a hit.
  function easy(view, rng) {
    var hits = cellsWhere(view, function (v) { return v === 'hit'; });
    var near = unknownNeighbours(view, hits, ORTHO);
    if (near.length) return pick(near, rng);
    return pick(cellsWhere(view, isUnknown), rng);
  }

  // Normal: hunt on a checkerboard, then follow the line of hits until the ship sinks.
  function normal(view, rng) {
    var known = deduce(view);
    var hits = cellsWhere(known, function (v) { return v === 'hit'; });

    if (hits.length) {
      // No-touch rule: all unsunk hits belong to the same ship.
      var candidates;
      if (hits.length === 1) {
        candidates = unknownNeighbours(known, hits, ORTHO);
      } else {
        var horizontal = hits[0][0] === hits[1][0];
        var dirs = horizontal ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        candidates = unknownNeighbours(known, hits, dirs);
      }
      if (candidates.length) return pick(candidates, rng);
    }

    var even = cellsWhere(known, function (v, r, c) { return v === 'unknown' && (r + c) % 2 === 0; });
    if (even.length) return pick(even, rng);
    var any = cellsWhere(known, isUnknown);
    return any.length ? pick(any, rng) : pick(cellsWhere(view, isUnknown), rng);
  }

  // Hard: count every placement of the remaining ships that fits what is known,
  // and fire at the cell most placements cover.
  function hard(view, lengths, rng) {
    var known = deduce(view);
    var hits = cellsWhere(known, function (v) { return v === 'hit'; });
    var score = view.map(function (row) { return row.map(function () { return 0; }); });

    lengths.forEach(function (len) {
      ['h', 'v'].forEach(function (dir) {
        for (var r = 0; r < SIZE; r++) {
          for (var c = 0; c < SIZE; c++) {
            var cells = R.shipCells(len, r, c, dir);
            var fits = true, covered = 0;
            for (var i = 0; i < cells.length && fits; i++) {
              var cr = cells[i][0], cc = cells[i][1];
              if (!R.inBounds(cr, cc)) { fits = false; break; }
              var v = known[cr][cc];
              if (v === 'miss' || v === 'sunk') fits = false;
              else if (v === 'hit') covered++;
            }
            // While a ship is wounded, only placements that explain all its hits count.
            if (!fits || covered !== hits.length) continue;
            cells.forEach(function (p) {
              if (known[p[0]][p[1]] === 'unknown') score[p[0]][p[1]]++;
            });
          }
        }
      });
    });

    var best = 0, bestCells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (known[r][c] !== 'unknown') continue;
        if (score[r][c] > best) { best = score[r][c]; bestCells = [[r, c]]; }
        else if (score[r][c] === best && best > 0) bestCells.push([r, c]);
      }
    }
    return bestCells.length ? pick(bestCells, rng) : normal(view, rng);
  }

  // Returns [row, col] of the next shot.
  function chooseShot(view, lengths, level, rng) {
    rng = rng || Math.random;
    if (level === 'easy') return easy(view, rng);
    if (level === 'hard') return hard(view, lengths, rng);
    return normal(view, rng);
  }

  BC.ai = { LEVELS: ['easy', 'normal', 'hard'], chooseShot: chooseShot };
})();
