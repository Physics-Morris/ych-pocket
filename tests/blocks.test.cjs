const assert = require('node:assert/strict');
const {Game,COLS,ROWS,matrix} = require('../blocks/engine.js');
function runTests() {
  const results=[];
  let seed=42;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const test=(name,fn)=>{const game=new Game({random});game.start();fn(game);results.push('PASS '+name);};
  const empty=g=>{g.board=Array.from({length:ROWS},()=>Array(COLS).fill(null));};
  const piece=(g,type,x,y,rotation=0)=>{g.current={type,x,y,rotation};g.lastRotation=null;};
  const fourWell=g=>{empty(g);for(let y=18;y<22;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'J');g.board[10][0]='Z';piece(g,'I',2,18,1);};
  test('seven-piece bags contain every piece once, with six previews',g=>{
    const sequence=[];
    for(let i=0;i<70;i++){sequence.push(g.current.type);empty(g);g.spawn();assert.equal(g.queue.length,6);}
    for(let i=0;i<70;i+=7)assert.equal(new Set(sequence.slice(i,i+7)).size,7);
  });
  test('pieces cannot cross walls, floor, or settled blocks',g=>{
    piece(g,'O',-1,18);assert(g.valid(g.current));assert(!g.move(-1));
    piece(g,'O',7,18);assert(!g.move(1));
    piece(g,'O',3,20);assert(!g.down());
    piece(g,'O',3,18);g.board[20][4]='J';assert(!g.down());
  });
  test('four rotations restore each shape without shifting in open space',g=>{
    for(const type of ['I','O','T','J','L','S','Z']){
      piece(g,type,3,6);const before=JSON.stringify(g.cells());
      for(let i=0;i<4;i++)assert(g.rotate(1));
      assert.equal(JSON.stringify(g.cells()),before);
    }
    assert.equal(matrix('T').flat().filter(Boolean).length,4);
  });
  test('SRS wall and floor kicks make tight rotations possible',g=>{
    piece(g,'T',-1,5,1);assert(g.valid(g.current));assert(g.rotate(-1));assert.equal(g.current.x,0);
    piece(g,'I',-2,5,1);assert(g.rotate(-1));assert.equal(g.current.x,0);
    piece(g,'T',3,20,0);assert(g.rotate(1));assert(g.current.y<20);assert(g.valid(g.current));
  });
  test('failed rotation leaves position and orientation untouched',g=>{
    piece(g,'T',3,10);const before=JSON.stringify(g.current),cells=g.cells();
    g.board=g.board.map(()=>Array(10).fill('J'));for(const [x,y]of cells)g.board[y][x]=null;
    assert(!g.rotate(1));assert.equal(JSON.stringify(g.current),before);
  });
  test('ghost landing matches hard drop and awards two points per row',g=>{
    piece(g,'T',3,2);const ghost=g.ghost(),distance=ghost.y-g.current.y,cells=g.cells(ghost);
    g.hardDrop();assert.equal(g.score,distance*2);assert.equal(g.pieces,1);
    for(const [x,y]of cells)assert.equal(g.board[y][x],'T');
  });
  test('hold is limited to once per piece and resets swapped rotation',g=>{
    const first=g.current.type,next=g.queue[0];assert(g.hold());assert.equal(g.held,first);assert.equal(g.current.type,next);
    assert(!g.hold());g.hardDrop();assert(!g.holdUsed);g.rotate(1);assert(g.hold());
    assert.equal(g.current.type,first);assert.equal(g.current.rotation,0);assert.equal(g.current.x,3);
  });
  test('one, two, three, and four lines collapse and score correctly',g=>{
    for(const count of [1,2,3,4]){
      g.reset();g.start();empty(g);g.board[8][0]='Z';
      for(let y=22-count;y<22;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'J');
      piece(g,'I',2,18,1);g.lock();
      assert.equal(g.lines,count);assert.equal(g.score,[0,100,300,500,800][count]);
      assert.equal(g.board[8+count][0],'Z');assert.equal(g.board.length,22);
    }
  });
  test('consecutive difficult clears award back-to-back and combo bonuses',g=>{
    fourWell(g);g.lock();assert.equal(g.score,800);
    fourWell(g);g.lock();assert.equal(g.score,800+1200+50);assert.equal(g.combo,1);
    piece(g,'O',6,20);g.lock();assert.equal(g.combo,-1);assert(g.backToBack);
  });
  test('all-clear boards earn the perfect-clear bonus',g=>{
    for(let y=18;y<22;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'J');
    piece(g,'I',2,18,1);g.lock();assert.equal(g.score,2800);assert(g.board.every(row=>row.every(c=>!c)));
  });
  test('T-spin scoring needs a rotation and three occupied corners',g=>{
    piece(g,'T',3,19,0);g.board[19][3]='J';g.board[19][5]='J';g.board[21][3]='J';
    assert.equal(g.spinType(),'');g.lastRotation={kick:0};assert.equal(g.spinType(),'full');
    g.lock();assert.equal(g.score,400);
  });
  test('lock delay allows adjustment but expires after repeated floor moves',g=>{
    piece(g,'O',3,20);g.update(100);g.update(100);assert.equal(g.pieces,0);
    for(let i=0;i<15;i++){g.move(i%2?-1:1);g.update(100);}
    assert.equal(g.lockResets,15);for(let i=0;i<9;i++){g.move(i%2?1:-1);g.update(100);}
    assert(g.pieces>=1);
  });
  test('landing leaves time to rotate, then starts a fresh lock delay',g=>{
    piece(g,'T',3,20);for(let i=0;i<7;i++)g.update(100);
    assert.equal(g.pieces,0);assert.equal(g.lockClock,700);
    assert(g.rotate(1),'piece should rotate even just before locking');assert.equal(g.lockClock,0);
    for(let i=0;i<7;i++)g.update(100);assert.equal(g.pieces,0);
    g.update(100);assert.equal(g.pieces,1);
  });
  test('soft drop scores, level increases, and gravity gets faster',g=>{
    assert(g.down(true));assert.equal(g.score,1);const speed=g.interval;
    g.lines=9;empty(g);g.board[21]=Array.from({length:10},(_,x)=>x===4?null:'J');
    piece(g,'I',2,18,1);g.lock();assert.equal(g.level,2);assert(g.interval<speed);
  });
  test('pause freezes time, falling and inputs, then resumes',g=>{
    const before=JSON.stringify(g.current);g.pause();g.update(100);g.move(1);g.rotate();g.hardDrop();g.hold();
    assert.equal(g.elapsed,0);assert.equal(JSON.stringify(g.current),before);
    g.resume();g.update(100);assert.equal(g.elapsed,100);
  });
  test('spawn collision ends the round without overwriting the stack',g=>{
    g.board[2]=Array(10).fill('Z');const before=JSON.stringify(g.board);g.spawn('T');
    assert.equal(g.status,'over');g.hardDrop();assert.equal(JSON.stringify(g.board),before);
  });
  test('Sprint finishes at forty lines, Rush ends at two minutes',g=>{
    g.reset('sprint');g.start();g.lines=36;fourWell(g);g.lock();assert.equal(g.status,'won');
    g.reset('ultra');g.start();g.elapsed=119950;g.update(100);assert.equal(g.status,'won');assert.equal(g.elapsed,120000);
  });
  test('restart clears the old round and restores mode state',g=>{
    g.hardDrop();g.hold();g.reset('sprint');assert.equal(g.status,'ready');assert.equal(g.lines,0);assert.equal(g.score,0);
    assert.equal(g.held,null);assert.equal(g.elapsed,0);assert(g.board.every(row=>row.every(c=>!c)));
  });
  test('long randomized play preserves board and piece invariants',g=>{
    for(let i=0;i<20000;i++){
      if(!g.active){g.reset();g.start();}
      const r=random();if(r<.16)g.move(-1);else if(r<.32)g.move(1);else if(r<.42)g.rotate(1);else if(r<.48)g.rotate(-1);else if(r<.50)g.hold();else if(r<.54)g.hardDrop();
      g.update(16,r>.8);
      assert.equal(g.board.length,22);assert(g.board.every(row=>row.length===10));assert(Number.isFinite(g.score));
      if(g.active)assert(g.valid(g.current));
    }
  });
  return results;
}
if(require.main===module)console.log(runTests().join('\n'));
module.exports=runTests;
