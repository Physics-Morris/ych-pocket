/* Falling-block rules, independent of rendering and input. */
(() => {
  'use strict';
  const COLS = 10, ROWS = 22, HIDDEN = 2;
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
  };
  // SRS offsets: x right, y up. Convert y when applying to the board.
  const NORMAL_KICKS = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };
  const I_KICKS = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };
  const matrix = (type, rotation = 0) => {
    let result = SHAPES[type].map(row => [...row]);
    if (type !== 'O') for (let r = 0; r < rotation; r++) result = result[0].map((_, x) => result.map(row => row[x]).reverse());
    return result;
  };

  class Game {
    constructor({ random = Math.random, onEvent = () => {}, lockDelay = 800 } = {}) {
      this.random = random;
      this.onEvent = onEvent;
      this.lockDelay = lockDelay;
      this.reset();
    }
    reset(mode = 'marathon') {
      this.mode = ['marathon','sprint','ultra'].includes(mode) ? mode : 'marathon';
      this.board = Array.from({length:ROWS}, () => Array(COLS).fill(null));
      this.queue = []; this.bag = [];
      this.current = null; this.held = null; this.holdUsed = false;
      this.score = 0; this.lines = 0; this.level = 1; this.elapsed = 0;
      this.combo = -1; this.backToBack = false; this.pieces = 0;
      this.status = 'ready'; this.fallClock = 0; this.lockClock = 0; this.lockResets = 0;
      this.lastRotation = null;
      this.refill(); this.spawn();
    }
    get interval() { return Math.max(55, 850 * Math.pow(.79, this.level - 1)); }
    get active() { return this.status === 'playing'; }
    refill() {
      while (this.queue.length < 6) {
        if (!this.bag.length) {
          this.bag = Object.keys(SHAPES);
          for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
          }
        }
        this.queue.push(this.bag.pop());
      }
    }
    spawn(type = null) {
      this.current = { type: type || this.queue.shift(), x: 3, y: 1, rotation: 0 };
      this.refill();
      this.fallClock = 0; this.lockClock = 0; this.lockResets = 0; this.lastRotation = null;
      if (!this.valid(this.current)) this.finish('over');
    }
    cells(piece = this.current) {
      if (!piece) return [];
      const cells = [];
      matrix(piece.type, piece.rotation).forEach((row,y) => row.forEach((filled,x) => { if (filled) cells.push([piece.x+x,piece.y+y]); }));
      return cells;
    }
    valid(piece) { return this.cells(piece).every(([x,y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !this.board[y][x]); }
    grounded() { return !this.valid({...this.current, y:this.current.y+1}); }
    start() { if (this.status === 'ready') this.status = 'playing'; }
    pause() { if (this.active) this.status = 'paused'; }
    resume() { if (this.status === 'paused') this.status = 'playing'; }
    finish(status) { this.status = status; this.onEvent({type:'finish',status}); }
    resetLock(wasGrounded) {
      if (wasGrounded && this.lockResets < 15) { this.lockClock = 0; this.lockResets++; }
    }
    move(dx) {
      if (!this.active || ![-1,1].includes(dx)) return false;
      const candidate = {...this.current,x:this.current.x+dx};
      if (!this.valid(candidate)) return false;
      const grounded = this.grounded();
      this.current = candidate; this.lastRotation = null;
      this.resetLock(grounded); return true;
    }
    rotate(direction = 1) {
      if (!this.active || ![-1,1].includes(direction)) return false;
      const from = this.current.rotation, to = (from + direction + 4) % 4;
      const kicks = this.current.type === 'O' ? [[0,0]] : (this.current.type === 'I' ? I_KICKS : NORMAL_KICKS)[`${from}>${to}`];
      for (let i = 0; i < kicks.length; i++) {
        const [dx,dy] = kicks[i], candidate = {...this.current, x:this.current.x+dx, y:this.current.y-dy, rotation:to};
        if (!this.valid(candidate)) continue;
        const grounded = this.grounded();
        this.current = candidate; this.lastRotation = {kick:i}; this.resetLock(grounded);
        this.onEvent({type:'rotate'}); return true;
      }
      return false;
    }
    down(soft = false) {
      if (!this.active) return false;
      const candidate = {...this.current,y:this.current.y+1};
      if (!this.valid(candidate)) return false;
      this.current = candidate; this.lastRotation = null; this.lockClock = 0;
      if (soft) this.score++;
      return true;
    }
    ghost() {
      const piece = {...this.current};
      while (this.valid({...piece,y:piece.y+1})) piece.y++;
      return piece;
    }
    hardDrop() {
      if (!this.active) return;
      const landing = this.ghost(), distance = landing.y - this.current.y;
      this.score += distance * 2;
      if (distance) this.lastRotation = null;
      this.current = landing; this.lock();
    }
    hold() {
      if (!this.active || this.holdUsed) return false;
      const outgoing = this.current.type, incoming = this.held;
      this.held = outgoing; this.spawn(incoming); this.holdUsed = true;
      this.onEvent({type:'hold'}); return true;
    }
    spinType() {
      if (this.current.type !== 'T' || !this.lastRotation) return '';
      const x = this.current.x+1, y = this.current.y+1;
      const blocked = (cx,cy) => cx<0 || cx>=COLS || cy<0 || cy>=ROWS || Boolean(this.board[cy][cx]);
      const corners = [blocked(x-1,y-1),blocked(x+1,y-1),blocked(x+1,y+1),blocked(x-1,y+1)];
      if (corners.filter(Boolean).length < 3) return '';
      const faces = [[0,1],[1,2],[2,3],[3,0]][this.current.rotation];
      return (faces.every(i=>corners[i]) || this.lastRotation.kick === 4) ? 'full' : 'mini';
    }
    lock() {
      if (!this.active) return;
      const spin = this.spinType();
      for (const [x,y] of this.cells()) this.board[y][x] = this.current.type;
      const cleared = [];
      this.board.forEach((row,y) => { if (row.every(Boolean)) cleared.push(y); });
      this.board = this.board.filter((_,y) => !cleared.includes(y));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
      const count = cleared.length, difficult = count > 0 && (count === 4 || Boolean(spin));
      let base = spin === 'full' ? [400,800,1200,1600][count] : spin === 'mini' ? [100,200,400][count] : [0,100,300,500,800][count];
      if (difficult && this.backToBack) base *= 1.5;
      if (count) {
        this.combo++;
        base += Math.max(0,this.combo) * 50;
        this.backToBack = difficult;
      } else this.combo = -1;
      const perfect = count > 0 && this.board.every(row=>row.every(cell=>!cell));
      if (perfect) base += [0,800,1200,1800,2000][count];
      const gained = base * this.level;
      this.score += gained; this.lines += count; this.level = 1 + Math.floor(this.lines / 10); this.pieces++;
      this.onEvent({type:count?'clear':'lock',count,rows:cleared,spin,combo:this.combo,perfect,gained});
      this.holdUsed = false;
      if (this.mode === 'sprint' && this.lines >= 40) { this.finish('won'); return; }
      if (this.board.slice(0,HIDDEN).some(row=>row.some(Boolean))) { this.finish('over'); return; }
      this.spawn();
    }
    update(ms, soft = false) {
      if (!this.active || !Number.isFinite(ms) || ms <= 0) return;
      ms = Math.min(ms,100);
      this.elapsed += ms;
      if (this.mode === 'ultra' && this.elapsed >= 120000) { this.elapsed = 120000; this.finish('won'); return; }
      this.fallClock += ms;
      const interval = soft ? Math.min(35,this.interval) : this.interval;
      while (this.fallClock >= interval && this.active) {
        this.fallClock -= interval;
        if (!this.down(soft)) { this.fallClock = 0; break; }
      }
      if (this.grounded()) {
        this.lockClock += ms;
        if (this.lockClock >= this.lockDelay) this.lock();
      } else this.lockClock = 0;
    }
  }
  const api = {Game,matrix,COLS,ROWS,HIDDEN,SHAPES};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.YCHBlocks = api;
})();
