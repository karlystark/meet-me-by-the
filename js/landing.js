/* LANDING PAGE: a single circle in the center of the screen. Each click draws a new line to a new circle and places a short poem fragment near it. After TOTAL_NUMBER_CIRCLES circles, clicking the last one fills the screen and transitions the page to ENTER_URL. Needs poems.js loaded first, because it calls poemLine() */

(() => {
  const ENTER_URL = './pages/blackout.html'; // page to navigate to after last click
  const TOTAL_NUMBER_CIRCLES = 10; // circles in the map; clicking the last one enters
  const NS = 'http://www.w3.org/2000/svg'; // SVG namespace, don't change
  const svg = document.getElementById('stage'); // full-screen SVG where everything is drawn onto
  const hint = document.getElementById('hint');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; // TRUE if user wants less animation

  // Current window size. Functions will return the live size.
  const W = () => innerWidth, H = () => innerHeight;

  // Base line length, scales with screen and shrinks as TOTAL_NUMBER_CIRCLES grows so bigger map still fits. Smaller divisor means longer lines.
  const unit = () => Math.min(W(), H()) / (1.5 + TOTAL_NUMBER_CIRCLES * 0.2);

  const nodes = [];   // every circle created so far: { x, y , circle, halo, clicked }
  const lines = [];   // every line drawn so far as [x1, y1, x2, y2], for crossing checks

// Do two line segments cross each other? True if segment from point A to point B crosses segment s. Matters because every new line starts exactly where the previous one ended. Returns Boolean.
  const crosses = (ax, ay, bx, by, s) => {
    const [cx, cy, dx, dy] = s;
    // which side of the line P --> Q does point R fall on? Returns -1, 0, or 1.
    const orientation = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    // segments cross when each one's endpoints fall on opposite sides of the other
    return orientation(ax, ay, bx, by, cx, cy) * orientation(ax, ay, bx, by, dx, dy) < 0 &&
      orientation(cx, cy, dx, dy, ax, ay) * orientation(cx, cy, dx, dy, bx, by) < 0;
  };

  // Shared state: busy blocks clicks while an animation is running and heading is the angle (in radians) of the most recent line
  let busy = false, heading = Math.random() * Math.PI * 2;

  // Ease out curve, with t representing progress from 0 to 1. returns eased progress from 0 to 1.
  const ease = t => 1 - Math.pow(1 - t, 3);

// Runs an animation: Calls function (fn) every frame with eased progress for a given number of milliseconds (ms) and returns a Promise
  function tween(ms, fn) {
    return new Promise(res => {
      if (reduceMotion) {
        fn(1);
        return res();
      }
      const startTime = performance.now();
      (function step(now) {
        // clamped to 0..1 so the first frame's timestamp can be slightly earlier but can't produce negative values
        const progress = Math.max(0, Math.min(1, (now - startTime) / ms));
        fn(ease(progress));
        progress < 1 ? requestAnimationFrame(step) : res();
      })(startTime);
    });
  }

// Creates SVG element, sets attributes, and adds it to parent
  function makeEl(name, attrs, parent = svg) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  // ---- poetry layer ----
  const words = makeEl('g', { id: 'words' });   // holds every poem's text, sits above lines, below circles

  const rndNum = (a, b) => a + Math.random() * (b - a); // random number between a and b
  const rndArrayItem = arr => arr[Math.floor(Math.random() * arr.length)]; // random item from an array

  // one entry per poem section placed so far, grouped by poem (oldest first). each entry is a list of rectangles, one per text chunk so new text can steer away from old text.
  const history = [];

  // Area where two rectangles overlap, or 0 if they don't. Used to score how badly a piece of text collides with others. Returns number representing overlap area in square pixels
  const overlap = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };

  /* Places one poem fragment near a circle, scattered as short chunks of 2 to 3 words with varied size, tilt and style. For each chunk it tries up to 30 positions, scores each one for collisions and off-screen spill, and keeps the best. Older poems dim so the newest stays the clearest. Chunks fade in one after another.*/
  function placeWords(node) {
    // get poem line and break it into chunks of 2 to 3 words
    const poemSplit = poemLine().trim().split(' ').filter(Boolean);
    const chunks = [];
    for (let i = 0; i < poemSplit.length;) {
      const numWords= 2 + Math.floor(Math.random() * 2); // 2 or 3 words per chunk
      chunks.push(poemSplit.slice(i, i + numWords).join(' '));
      i += numWords;
    }

    // older poems recede so the newest one stays readable. opacity 68%, floor 20%.
    words.querySelectorAll('.poem').forEach(group => {
      const newOpacity = Math.max(0.2, (parseFloat(group.dataset.newOpacity) || 1) * 0.68);
      group.dataset.newOpacity = newOpacity; group.style.opacity = newOpacity;
    });

    // group holding this poem's text elements
    const g = makeEl('g', { class: 'poem' }, words);
    // list of rectangles for this poem, added to history
    const mine = []; history.push(mine);
    // which side of circle does the text grow towards? always toward the screen center, so it has room.
    const sx = node.x < W() / 2 ? 1 : -1, sy = node.y < H() / 2 ? 1 : -1;
    // size scale, smaller text on phones
    const k = W() < 600 ? 0.72 : 1, step = 30 * k;
    // where first chunk's baseline starts
    const y0 = sy > 0 ? node.y + 28 : node.y - 28 - (chunks.length - 1) * step;
    // padding added around each chunk when checking collisions, margin to keep from screen edge
    const pad = 8, m = 14;

    // place each chunk
    chunks.forEach((chunkText, chunkPosition) => {
      let fontSize = rndArrayItem([15, 18, 24, 34, 52]) * k;
      const rotationDegrees = Math.random() < 0.1 ? rndArrayItem([-90, 90]) : rndNum(-8, 8); // rarely turned on its side
      const t = makeEl('text', {}, g);
      t.textContent = chunkText;

      if (fontSize <= 18 * k && Math.random() < 0.5) {
        t.style.textTransform = 'uppercase';
        t.style.letterSpacing = '.25em';
        fontSize *= 0.72;
      } else if (Math.random() < 0.35) t.style.fontStyle = 'italic';
      t.style.fontSize = fontSize + 'px';
      t.style.opacity = 0; // invisible until its fade-in at the end

      // try 30 candidate spots and keep the lowest-cost one
      let best = null;

      for (let i = 0; i < 30; i++) {
        const flip = i >= 15 && Math.random() < 0.5 ? -1 : 1; // late tries may switch side of circle
        const side = sx * flip, spread = i * 4; // search area widens with each try
        const x = node.x + side * (16 + (chunkPosition % 2 ? rndNum(10, 60) : rndNum(0, 14))) + rndNum(-spread, spread); // odd chunks are staggered outward
        const y = y0 + chunkPosition * step + rndNum(-8, 8) + rndNum(-spread, spread);
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.setAttribute('text-anchor', side > 0 ? 'start' : 'end');
        t.setAttribute('transform', `rotate(${rotationDegrees} ${x} ${y})`);
        const r = t.getBoundingClientRect(); // where the text really lands on teh screen (includes rotation)

        // how far it would need to move to stay inside the screen margin
        let dx = 0, dy = 0;
        if (r.left < m) dx = m - r.left; else if (r.right > W() - m) dx = W() - m - r.right;
        if (r.top < m) dy = m - r.top; else if (r.bottom > H() - m) dy = H() - m - r.bottom;

        const box = {
          left: r.left + dx - pad,
          right: r.right + dx + pad,
          top: r.top + dy - pad,
          bottom: r.bottom + dy + pad
        };

        // how bad this spot is (lower is better)
        let cost = (Math.abs(dx) + Math.abs(dy)) * 200;

        history.forEach((poem, hi) => {
          const age = history.length - 1 - hi; // 0 = poem being placed now
          const wgt = age === 0 ? 1 : Math.max(0.15, 0.5 ** age); // old, faded poems matter less
          poem.forEach(b => { cost += overlap(box, b) * wgt; });
        });

        nodes.forEach(otherNode => {
          cost += overlap(box, { left: otherNode.x - 8, right: otherNode.x + 8, top: otherNode.y - 8, bottom: otherNode.y + 8 }) * 2;
        });

        if (!best || cost < best.cost) best = { cost, x, y, side, dx, dy, box };
        if (cost === 0) break; // perfect spot, stop searching
      }

      // lock in the winner, including the nudge that keeps it on screen
      t.setAttribute('x', best.x);
      t.setAttribute('y', best.y);
      t.setAttribute('text-anchor', best.side > 0 ? 'start' : 'end');
      t.setAttribute('transform', `translate(${best.dx} ${best.dy}) rotate(${rotationDegrees} ${best.x} ${best.y})`);

      mine.push(best.box);
      t.getBoundingClientRect();   // forces browser to apply opacity 0 first, so fade in actually animates
      t.style.transition = `opacity 2s ${chunkPosition * 500}ms`; // each chunk fades in 0.5s after the previous one
      t.style.opacity = 1;
    });
  }

  // Creates a clickable circle at (x, y) with a pulsing halo, wires up its click, keyboard, and hover events, and schedules its poem. Circle starts at radius 0. Returns the node {x , y , circle, halo, clicked }
  function makeNode(x, y) {
    // pulsing ring around the circle
    const halo = makeEl('circle', { class: 'halo', cx: x, cy: y, r: 0 });
    const circle = makeEl('circle', {
      class: 'node', cx: x, cy: y, r: 0, tabindex: 0, role: 'button',
      'aria-label': 'Continue'
    });
    const node = { x, y, circle, halo, clicked: false }; // clicked becomes true once this circle has been used
    nodes.push(node);

    setTimeout(() => placeWords(node), reduceMotion ? 0 : 400);
    // gentle breathing halo (skipped with reduced motion)
    if (!reduceMotion) {
      halo.animate([{ r: '10px', opacity: .35 }, { r: '26px', opacity: 0 }],
        { duration: 2400, iterations: Infinity, easing: 'ease-out' });
    }
    const go = () => advance(node);

    circle.addEventListener('click', go);
    // keyboard users can press Enter or Space
    circle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
    // live circles grow slightly on hover
    circle.addEventListener('pointerenter', () => { if (!node.clicked) circle.setAttribute('r', 8); });
    circle.addEventListener('pointerleave', () => { if (!node.clicked) circle.setAttribute('r', 6); });
    return node;
  }

/* Chooses where the next circle goes. Tries up to 80 random angles, mostly near the current line, and accepts first endpoint that stays inside the screen margin, isn't too close to an existing circle, and makes the new line cross an existing one. If nothing qualifies, it heads toward the screen center. Returns endpoint and angle used to reach it: { x: number, y: number, angleLine: number } */
  function pickTarget(from) {
    const lineLength = unit() * (0.75 + Math.random() * 0.6); // each line is 75% to 135% of teh base length
    const screenMargin = 40;
    let chosenEndpoint = null;

    for (let i = 0; i < 80; i++) {
      const spread = i < 50 ? 2.2 : Math.PI;   // wider turns let lines double back and cross
      const angleLine = heading + (Math.random() - 0.5) * 2 * spread;
      const x = from.x + Math.cos(angleLine) * lineLength, y = from.y + Math.sin(angleLine) * lineLength;

      if (x < screenMargin || x > W() - screenMargin || y < screenMargin || y > H() - screenMargin) continue;

      if (nodes.some(existingNode => Math.hypot(existingNode.x - x, existingNode.y - y) < lineLength * 0.35)) continue;

      // early tries must cross an existing line (once there are a couple to cross)
      if (i < 40 && lines.length >= 2 && !lines.some(existingSegment => crosses(from.x, from.y, x, y, existingSegment))) continue;

      chosenEndpoint = { x, y, angleLine };
      break;
    }
    // fallback if every try failed: head toward center of the screen
    if (!chosenEndpoint) {
      const angleLine = Math.atan2(H() / 2 - from.y, W() / 2 - from.x);
      chosenEndpoint = {
        x: from.x + Math.cos(angleLine) * lineLength,
        y: from.y + Math.sin(angleLine) * lineLength, angleLine
      };
    }
    return chosenEndpoint;
  }

  /* Runs when a circle is clicked. Ignores if an animation is running or the circle isn't the newest one. Sends visitor onward if this is the last circle, otherwise hollows out the clicked circle, draws an animated line to a new target, and grows a new circle at its end. */
  async function advance(node) {
    if (busy || node.clicked) return;
    busy = true;
    hint.classList.remove('on');
    const idx = nodes.indexOf(node);

    if (idx !== nodes.length - 1) { busy = false; return; }   // only the newest circle is live

    if (nodes.length >= TOTAL_NUMBER_CIRCLES) return enter(node); // last circle, leave the page

    // mark the circle as used, hollow it out and take it out of keyboard tab order
    node.clicked = true;
    node.circle.classList.add('spent');
    node.circle.setAttribute('r', 6);
    node.circle.removeAttribute('tabindex');

    const target = pickTarget(node);
    heading = target.angleLine; // remember the direction for the next line
    lines.push([node.x, node.y, target.x, target.y]); // record teh segment for future crossing checks

    // draw the line growing from the clicked circle toward the target
    const line = makeEl('line', { class: 'line', x1: node.x, y1: node.y, x2: node.x, y2: node.y });
    svg.insertBefore(line, svg.firstChild);

    await tween(650, p => {
      line.setAttribute('x2', node.x + (target.x - node.x) * p);
      line.setAttribute('y2', node.y + (target.y - node.y) * p);
    });

    // grow the next circle at the end of the line, then hand focus to it for keyboard users
    const next = makeNode(target.x, target.y);
    await tween(450, p => next.circle.setAttribute('r', 6 * p));
    next.circle.focus({ preventScroll: true });
    busy = false;
  }

  // The exit, fades out the poem and expands the last circle until it floods the screen, then goes to ENTER_URL
  async function enter(node) {
    node.circle.style.pointerEvents = 'none';
    node.halo.remove();
    words.style.opacity = 0;
    node.circle.setAttribute('r', 6);
    const R = Math.hypot(W(), H()); // the screen diagonal, a radius guaranteed to cover everything
    await tween(1100, p => node.circle.setAttribute('r', 6 + (R - 6) * p * p));
    if (ENTER_URL) { location.href = ENTER_URL; return; }
    document.getElementById('site').classList.add('on');
  }

  // first circle at the center of the screen
  const first = makeNode(W() / 2, H() / 2);
  tween(700, p => first.circle.setAttribute('r', 6 * p)).then(() => {
    first.circle.focus({ preventScroll: true });
    setTimeout(() => hint.classList.add('on'), 1800); // the 'click' hint appears after a short pause
  });
})();
