(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const {Game,matrix,COLS,ROWS,HIDDEN} = window.YCHBlocks;
  const colors = {I:'#45d9ec',O:'#fbd34c',T:'#b485f1',J:'#508cf0',L:'#ff9b48',S:'#8cdb65',Z:'#fa6483'};
  const names = {marathon:'MARATHON',sprint:'40-LINE SPRINT',ultra:'2-MINUTE RUSH'};
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const dialogs = [...document.querySelectorAll('dialog')];
  const sideways = matchMedia('(orientation: portrait)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const inputs = new Map();
  let lastTime = 0, audio = null, sound = false, selectedMode = 'marathon';
  let resumeAfterDialog = false, effectUntil = 0, effectRows = [], savedBest = {}, previewKey = '';
  const text = (id,value) => { const el = $(id); if (el.textContent !== String(value)) el.textContent = value; };
  const announce = value => text('announcement',value);
  const hasDialog = () => dialogs.some(dialog=>dialog.open);
  const time = ms => `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
  const preciseTime = ms => `${time(ms)}.${Math.floor(ms%1000/10).toString().padStart(2,'0')}`;
  try {
    sound = localStorage.getItem('ych-blocks-sound') === 'true';
    const stored = JSON.parse(localStorage.getItem('ych-blocks-best'));
    if (stored && typeof stored === 'object') for (const mode of Object.keys(names)) if (Number.isFinite(stored[mode]) && stored[mode]>=0) savedBest[mode]=stored[mode];
  } catch { /* Play also works without storage. */ }

  function tone(frequency,duration=.08,volume=.035,delay=0) {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audio) audio = new Audio();
      if (audio.state === 'suspended') audio.resume().catch(()=>{});
      const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+delay;
      oscillator.type='triangle'; oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(volume,start); gain.gain.exponentialRampToValueAtTime(.001,start+duration);
      oscillator.connect(gain).connect(audio.destination); oscillator.start(start); oscillator.stop(start+duration+.01);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    } catch { /* Audio is optional. */ }
  }
  function saveRecord() {
    let candidate = game.score;
    if (game.mode === 'sprint') {
      if (game.status !== 'won') return;
      candidate = game.elapsed;
      if (savedBest.sprint && candidate>=savedBest.sprint) return;
    } else if (candidate <= (savedBest[game.mode]||0)) return;
    savedBest[game.mode]=candidate;
    try {localStorage.setItem('ych-blocks-best',JSON.stringify(savedBest));} catch { /* Optional. */ }
  }
  function eventReceived(event) {
    if (event.type === 'rotate') tone(380,.045,.018);
    if (event.type === 'hold') tone(280,.07,.025);
    if (event.type === 'lock') tone(110,.07,.04);
    if (event.type === 'clear') {
      let label = event.perfect ? 'ALL CLEAR!' : event.spin ? `${event.spin==='mini'?'MINI ':''}T-SPIN` : ['','SINGLE','DOUBLE','TRIPLE','FOUR LINES!'][event.count];
      if (event.combo > 0) label += ` · ${event.combo} COMBO`;
      text('clear-message',`${label} +${event.gained}`);
      $('clear-message').hidden=false; effectUntil=performance.now()+850; effectRows=event.rows;
      announce(`${label}. ${game.lines} lines, ${game.score} points.`);
      [440,554,660,event.count===4?880:740].forEach((f,i)=>tone(f,.13,.04,i*.045));
    }
    if (event.type === 'finish') {
      release(); saveRecord();
      if (event.status==='won') [523,659,784,1046].forEach((f,i)=>tone(f,.22,.05,i*.1));
      else tone(100,.35,.06);
      announce(event.status==='won'?`Finished! ${game.score} points in ${preciseTime(game.elapsed)}.`:`Game over. ${game.score} points and ${game.lines} lines.`);
    }
  }
  const game = new Game({onEvent:eventReceived});

  function tile(context,x,y,size,type,ghost=false) {
    const gap = Math.max(1,size*.065), inner=size-gap*2;
    if (ghost) {
      context.strokeStyle=colors[type]+'99';context.lineWidth=Math.max(1,size*.07);
      context.strokeRect(x+gap+1,y+gap+1,inner-2,inner-2);return;
    }
    context.fillStyle=colors[type];context.fillRect(x+gap,y+gap,inner,inner);
    context.fillStyle='#ffffff65';context.fillRect(x+gap,y+gap,inner,Math.max(1,size*.1));
    context.fillRect(x+gap,y+gap,Math.max(1,size*.07),inner);
    context.fillStyle='#00000030';context.fillRect(x+gap,y+size-gap-size*.11,inner,size*.11);
    context.strokeStyle='#0000001f';context.lineWidth=1;context.strokeRect(x+size*.25,y+size*.25,size*.5,size*.5);
  }
  function drawPreview(preview,type,dim=false) {
    const context=preview.getContext('2d'); context.clearRect(0,0,preview.width,preview.height);
    if (!type) {
      context.strokeStyle='#16151225';context.setLineDash([4,4]);context.strokeRect(55,15,50,32);context.setLineDash([]);return;
    }
    const cells=[];matrix(type).forEach((row,y)=>row.forEach((value,x)=>{if(value)cells.push([x,y]);}));
    const minX=Math.min(...cells.map(c=>c[0])),maxX=Math.max(...cells.map(c=>c[0]));
    const minY=Math.min(...cells.map(c=>c[1])),maxY=Math.max(...cells.map(c=>c[1]));
    const size=Math.min(24,(preview.width-18)/(maxX-minX+1),(preview.height-10)/(maxY-minY+1));
    const ox=(preview.width-(maxX-minX+1)*size)/2,oy=(preview.height-(maxY-minY+1)*size)/2;
    context.globalAlpha=dim?.35:1;
    cells.forEach(([x,y])=>tile(context,ox+(x-minX)*size,oy+(y-minY)*size,size,type));
    context.globalAlpha=1;
  }
  function render() {
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if (!width || !height) return;
    const sx=width/COLS,sy=height/(ROWS-HIDDEN);
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#101625';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#28324788';ctx.lineWidth=.5;
    for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(x*sx,0);ctx.lineTo(x*sx,height);ctx.stroke();}
    for(let y=1;y<20;y++){ctx.beginPath();ctx.moveTo(0,y*sy);ctx.lineTo(width,y*sy);ctx.stroke();}
    ctx.save();ctx.scale(sx,sy);
    const drawCell=(x,y,type,ghost=false)=>{if(y>=HIDDEN){ctx.save();ctx.translate(x,y-HIDDEN);ctx.scale(1/24,1/24);tile(ctx,0,0,24,type,ghost);ctx.restore();}};
    game.board.forEach((row,y)=>row.forEach((type,x)=>{if(type)drawCell(x,y,type);}));
    if (!['over','won'].includes(game.status)) {
      for(const [x,y] of game.cells(game.ghost()))drawCell(x,y,game.current.type,true);
      for(const [x,y] of game.cells())drawCell(x,y,game.current.type);
    }
    ctx.restore();
    if (effectUntil>performance.now() && !reducedMotion.matches) {
      ctx.fillStyle=`rgba(196,231,12,${Math.max(0,(effectUntil-performance.now()-550)/1000)})`;
      effectRows.forEach(y=>{if(y>=HIDDEN)ctx.fillRect(0,(y-HIDDEN)*sy,width,sy);});
    } else if (performance.now()>=effectUntil) $('clear-message').hidden=true;
    updateHUD();
  }
  function resize() {
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);render();
  }
  function updateHUD() {
    text('score',String(game.score).padStart(6,'0'));text('level',String(game.level).padStart(2,'0'));
    text('best',game.mode==='sprint'?(savedBest.sprint?preciseTime(savedBest.sprint):'—'):String(savedBest[game.mode]||0));
    text('mode-label',names[game.mode]);text('clock',time(game.mode==='ultra'?Math.max(0,120000-game.elapsed):game.elapsed));
    text('lines',game.mode==='sprint'?`${game.lines} / 40 LINES`:`${String(game.lines).padStart(2,'0')} LINES`);
    text('goal',game.mode==='sprint'?`${Math.max(0,40-game.lines)} LINES TO GO.`:game.mode==='ultra'?'MAKE EVERY SECOND COUNT.':'KEEP IT GOING.');
    text('goal-copy',game.mode==='sprint'?'Your fastest finish wins.':game.mode==='ultra'?'Two minutes. Your best score.':'Every 10 lines, a little faster.');
    text('hold-note',game.holdUsed?'AVAILABLE NEXT PIECE':'SAVE FOR LATER');
    const landed=game.active&&game.grounded();
    text('landing-label',landed?'TURN NOW':'10 × 20');
    $('lock-meter').classList.toggle('active',landed);
    $('lock-fill').style.transform=`scaleX(${landed?Math.max(0,1-game.lockClock/game.lockDelay):0})`;
    $('hold').disabled=!game.active||game.holdUsed;
    text('pause-label',game.status==='paused'?'RESUME':'PAUSE');$('pause').setAttribute('aria-label',game.status==='paused'?'Resume game':'Pause game');
    $('pause').disabled=!['playing','paused'].includes(game.status);
    document.querySelectorAll('[data-action]:not(#hold)').forEach(button=>{button.disabled=!game.active;});
    const key=game.held+String(game.holdUsed)+game.queue.join('');
    if(key!==previewKey){drawPreview($('hold-preview'),game.held,game.holdUsed);document.querySelectorAll('#next-list canvas').forEach((p,i)=>drawPreview(p,game.queue[i]));previewKey=key;}
    const overlay=$('board-overlay');overlay.hidden=game.active||hasDialog();
    if (!overlay.hidden) {
      const status=game.status;
      text('overlay-eyebrow',status==='ready'?'READY WHEN YOU ARE':status==='paused'?'TAKE YOUR TIME':status==='won'?'NICELY DONE':'THERE’S ALWAYS ANOTHER ROUND');
      text('overlay-title',status==='ready'?'MAKE ROOM.':status==='paused'?'ON PAUSE.':status==='won'?'YOU DID IT!':'ONE MORE?');
      text('overlay-copy',status==='ready'?'Fill a row. Clear your head.':status==='paused'?'Your blocks are right here.':game.mode==='sprint'&&status==='won'?`40 lines · ${preciseTime(game.elapsed)}`:`${game.score.toLocaleString()} points · ${game.lines} lines`);
      text('play',status==='ready'?'LET’S PLAY →':status==='paused'?'KEEP GOING →':'PLAY AGAIN →');
    }
    const label=`${names[game.mode]}. ${game.status}. ${game.score} points, ${game.lines} lines, level ${game.level}.`;
    if(canvas.getAttribute('aria-label')!==label)canvas.setAttribute('aria-label',label);
  }
  function release() {inputs.clear();document.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));}
  function action(name) {
    if (!game.active || hasDialog()) return;
    if(name==='left')game.move(-1);
    if(name==='right')game.move(1);
    if(name==='down')game.down(true);
    if(name==='cw')game.rotate(1);
    if(name==='ccw')game.rotate(-1);
    if(name==='hold')game.hold();
    if(name==='drop')game.hardDrop();
    render();
  }
  function press(id,name,button=null) {
    if(!game.active||hasDialog()||inputs.has(id))return;
    inputs.set(id,{name,button,clock:0,next:155});button?.classList.add('pressed');action(name);
  }
  function unpress(id) {const entry=inputs.get(id);inputs.delete(id);if(entry?.button&&![...inputs.values()].some(e=>e.button===entry.button))entry.button.classList.remove('pressed');}
  document.querySelectorAll('[data-action]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);press('p'+event.pointerId,button.dataset.action,button);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,event=>unpress('p'+event.pointerId)));
    button.addEventListener('click',event=>{if(event.detail===0)action(button.dataset.action);});
    button.addEventListener('contextmenu',event=>event.preventDefault());
  });
  const keys={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:'cw',x:'cw',z:'ccw',c:'hold',Shift:'hold',' ':'drop'};
  function togglePause() {if(hasDialog())return;release();if(game.active){game.pause();saveRecord();}else game.resume();lastTime=0;render();}
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||hasDialog()||event.target.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))return;
    const key=event.key.length===1?event.key.toLowerCase():event.key;
    if(key==='p'||key==='Escape'){event.preventDefault();if(!event.repeat)togglePause();return;}
    if(!(key in keys))return;event.preventDefault();if(event.repeat)return;
    press('k'+key,keys[key]);
  });
  document.addEventListener('keyup',event=>unpress('k'+(event.key.length===1?event.key.toLowerCase():event.key)));
  function suspend() {release();resumeAfterDialog=false;if(game.active){game.pause();saveRecord();}lastTime=0;render();}
  window.addEventListener('blur',suspend);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  window.addEventListener('pagehide',()=>{suspend();saveRecord();});
  sideways.addEventListener('change',()=>{release();lastTime=0;resize();});
  $('pause').addEventListener('click',togglePause);
  $('play').addEventListener('click',()=>{
    release();
    if(game.status==='paused')game.resume();
    else {if(game.status!=='ready')game.reset(game.mode);game.start();}
    lastTime=0;render();tone(440,.09);
  });
  function openDialog(dialog) {resumeAfterDialog=game.active;game.pause();release();dialog.showModal();render();}
  function selectMode(mode) {
    selectedMode=mode;document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    text('start-new',`START ${names[mode]} →`);
  }
  $('restart').addEventListener('click',()=>{selectMode(game.mode);text('restart-note',game.status==='ready'?'Pick a mode and make yourself at home.':'Your current round will be replaced when you start.');openDialog($('new-dialog'));});
  $('help').addEventListener('click',()=>openDialog($('help-dialog')));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.mode)));
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  dialogs.forEach(dialog=>dialog.addEventListener('close',()=>{if(resumeAfterDialog&&game.status==='paused')game.resume();resumeAfterDialog=false;lastTime=0;render();}));
  $('start-new').addEventListener('click',()=>{saveRecord();resumeAfterDialog=false;$('new-dialog').close();game.reset(selectedMode);game.start();release();effectUntil=0;lastTime=0;render();tone(440,.09);});
  function updateSound() {$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',`Turn sound ${sound?'off':'on'}`);text('sound-label',sound?'ON':'OFF');}
  $('sound').addEventListener('click',()=>{sound=!sound;updateSound();try{localStorage.setItem('ych-blocks-sound',String(sound));}catch{}tone(440,.1);});updateSound();
  $('fullscreen').addEventListener('click',async()=>{
    const root=document.documentElement,request=root.requestFullscreen||root.webkitRequestFullscreen,exit=document.exitFullscreen||document.webkitExitFullscreen;
    try{if((document.fullscreenElement||document.webkitFullscreenElement)&&exit)await exit.call(document);else if(request)await request.call(root);else openDialog($('screen-dialog'));}catch{openDialog($('screen-dialog'));}
  });
  function loop(now) {
    const dt=lastTime?Math.min(now-lastTime,100):0;lastTime=now;
    if(game.active&&!hasDialog()) {
      // Most recently pressed horizontal direction wins; multi-touch down still works.
      const lateral=[...inputs.values()].filter(e=>e.name==='left'||e.name==='right').at(-1);
      if(lateral){lateral.clock+=dt;while(lateral.clock>=lateral.next){action(lateral.name);lateral.next+=45;}}
      game.update(dt,[...inputs.values()].some(e=>e.name==='down'));
    }
    render();requestAnimationFrame(loop);
  }
  new ResizeObserver(resize).observe($('board'));
  resize();requestAnimationFrame(loop);
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('../sw.js').catch(()=>{});
})();
