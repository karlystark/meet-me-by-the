/**
 * Seams: 12 lines of the poem is on screen at once, one fragment per row. Each row is split at a
 * natural break and a circle (referred to here as the "seam") marks the break. Clicking a seam trades that row's
 * second half with another row's second half & a curved line is drawn between the two seams,
 * the halves slide past each other, and both rows now read as new lines. Old lines fade but
 * stay, so the page slowly collects a web, marking every swap.
 */
(() => {
  const NUMBER_OF_LINES = 12;      // number of fragments shown on the page
  const SLIDE_MS = 1000;           // how long the halves take to trade places
  const TRACE_DRAW_MS = 700;       // how long the connecting line takes to draw
  const MAX_TRACES_KEPT = 14;      // oldest connecting lines are removed past this many
  const NS = 'http://www.w3.org/2000/svg';

  /**
   * I can choose where each line breaks. The key is the line exactly as it appears in poems.js (this is important). The
   * value is how many words stay on the LEFT of the circle (the rest go to the right).
   * Any line not listed here is split automatically (after a comma, otherwise near the middle).
   */
  const MANUAL_BREAKS = {
    'catch as many fish as you want': 3,                       // catch as many | fish as you want
    'something grows in every watered dirt': 3,                // something grows in | every watered dirt
    'we either will or will not grow old': 5,                 // you either will or will | not grow old
    'what do you do to soothe your nerves from forming an idea': 6, // what do you do to soothe | your nerves from forming an idea
    'what happened yesterday, in your life': 3,                // what happened yesterday, | in your life
    'the sky on my face, the reward me': 5,                    // the sky on my face, | the reward me
    'and also my sun which I don’t really look at': 4,         // and also my sun | which I don't really look at
    'hearing geese before I see them': 2,                      // hearing geese | before I see them
    'lean in and miss': 2,                                     // lean in | and miss
    'turned on by the responsibility of looking after it': 6,  // turned on by the responsibility of | looking after it
    'where I could meet you in your mind': 4,                  // where I could meet | you in your mind
    'does love constrain your vision?': 3,                     // does love constrain | your vision?
    'swimming against the current, staying in the same place': 4,  // swimming against the current, | staying in the same place
  };

  const poemContainer = document.getElementById('poem');
  const traceLayer = document.getElementById('traces');
  const hint = document.getElementById('hint');
  const restoreButton = document.getElementById('restore'); // restores poem back to its original pairings
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const randomBetween = (low, high) => low + Math.random() * (high - low); // random number between any given low and high value

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  /** Splits a line in two:
   * 1) At the break chosen in MANUAL_BREAKS if there is one
   * 2) Otherwise after its first comma
   * 3) Otherwise at the word boundary closest to the middle. */
  function splitAtSeam(line) {
    const words = line.trim().split(' ').filter(Boolean);

    if (words.length < 2) return { leftHalf: words.join(' '), rightHalf: '' };

    // manual break wins over the automatic one
    const chosenBreak = MANUAL_BREAKS[line.trim()];

    if (Number.isInteger(chosenBreak) && chosenBreak > 0 && chosenBreak < words.length) {
      return { leftHalf: words.slice(0, chosenBreak).join(' '), rightHalf: words.slice(chosenBreak).join(' ') };
    }

    let splitIndex = words.findIndex((word, index) => index < words.length - 1 && /[,;:]$/.test(word));

    if (splitIndex !== -1) {
      splitIndex += 1;   // keep the comma word on the left
    } else {
      let smallestDifference = Infinity;
      splitIndex = 1;

      for (let candidate = 1; candidate < words.length; candidate++) {
        const leftLength = words.slice(0, candidate).join(' ').length;
        const rightLength = words.slice(candidate).join(' ').length;
        const difference = Math.abs(leftLength - rightLength);

        if (difference < smallestDifference) {
          smallestDifference = difference;
          splitIndex = candidate;
        }
      }
    }
    return { leftHalf: words.slice(0, splitIndex).join(' '), rightHalf: words.slice(splitIndex).join(' ') };
  }

  // Gather distinct lines from the shared poem source.
  const originalLines = [];

  for (let attempt = 0; originalLines.length < NUMBER_OF_LINES && attempt < NUMBER_OF_LINES * 6; attempt++) {
    const line = poemLine();
    if (!originalLines.includes(line)) originalLines.push(line);
  }

  let rows = [];          // current text of every row: { leftHalf, rightHalf }
  let rowElements = [];   // matching page elements: { rowElement, leftElement, seamButton, rightElement }
  let swapCount = 0;
  let isBusy = false;     // true while a swap is animating, so extra clicks are ignored

  /** Draws every row from the current `rows` data. */
  function renderRows() {
    //clear DOM
    poemContainer.querySelectorAll('.row').forEach(row => row.remove());
    // create each row with a left, seam, and right element
    rowElements = rows.map((rowData, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'row';

      const leftElement = document.createElement('span');
      leftElement.className = 'left';
      leftElement.textContent = rowData.leftHalf;

      const seamButton = document.createElement('button');
      seamButton.className = 'seam';
      seamButton.type = 'button';
      seamButton.setAttribute('aria-label', 'Swap the ending of this line with another');
      seamButton.addEventListener('click', () => swapEndings(rowIndex));

      const rightElement = document.createElement('span');
      rightElement.className = 'right';
      rightElement.textContent = rowData.rightHalf;

      rowElement.append(leftElement, seamButton, rightElement);
      poemContainer.appendChild(rowElement);
      return { rowElement, leftElement, seamButton, rightElement };
    });
  }

  /** Starts over from the original poem and clears the web of lines. */
  function restoreOriginal() {
    if (isBusy) return;
    rows = originalLines.map(splitAtSeam);
    traceLayer.innerHTML = '';
    renderRows();
  }

  /** Picks the row to swap with: random, preferring rows at least two away so the line is a visible span. */
  function pickPartnerIndex(rowIndex) {
    const allOthers = rows.map((_, index) => index).filter(index => index !== rowIndex);
    const farOnes = allOthers.filter(index => Math.abs(index - rowIndex) >= 2);
    const choices = farOnes.length ? farOnes : allOthers;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  /** A single ring that expands from a seam and fades, to light up the swap. */
  function pulse(seamButton) {
    if (reduceMotion) return;

    const ring = document.createElement('span');
    ring.className = 'pulse';
    seamButton.appendChild(ring);

    ring.animate(
      [{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(3.2)', opacity: 0 }],
      { duration: 900, easing: 'ease-out' }
    ).onfinish = () => ring.remove();
  }

  /**
   * Draws a curved line between two seams (bulging sideways so it doesn't run along the circles'
   * shared column) and fades all earlier lines a step. Resolves when the line is fully drawn.
   */
  function drawTrace(fromSeam, toSeam) {
    const containerBox = poemContainer.getBoundingClientRect();
    const centerOf = element => {
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2 - containerBox.left, y: box.top + box.height / 2 - containerBox.top };
    };
    const start = centerOf(fromSeam), end = centerOf(toSeam);
    const sideways = (Math.random() < 0.5 ? -1 : 1) * Math.min(randomBetween(90, 220), containerBox.width / 2 - 12);
    const rise = end.y - start.y;

    // older lines recede
    const existingTraces = [...traceLayer.querySelectorAll('.trace')];

    existingTraces.forEach(oldTrace => {
      const fadedOpacity = Math.max(0.08, (parseFloat(oldTrace.dataset.opacity) || 1) * 0.7);
      oldTrace.dataset.opacity = fadedOpacity;
      oldTrace.style.opacity = fadedOpacity;
    });

    while (traceLayer.querySelectorAll('.trace').length >= MAX_TRACES_KEPT) traceLayer.querySelector('.trace').remove();

    const trace = document.createElementNS(NS, 'path');
    trace.setAttribute('class', 'trace');
    trace.setAttribute('pathLength', 1);
    trace.setAttribute('d',
      `M${start.x} ${start.y}C${start.x + sideways} ${start.y + rise * 0.15} ${start.x + sideways} ${start.y + rise * 0.85} ${end.x} ${end.y}`);
    trace.style.strokeDasharray = 1;
    trace.style.strokeDashoffset = reduceMotion ? 0 : 1;
    traceLayer.appendChild(trace);

    if (reduceMotion) return Promise.resolve();

    return trace.animate(
      [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: TRACE_DRAW_MS, easing: 'ease-out', fill: 'forwards' }
    ).finished;
  }

  /** Slides a right half along a bowed path to a new height. Returns the animation. */
  function slide(rightElement, verticalDistance, bulge) {
    rightElement.classList.add('moving');

    return rightElement.animate([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${bulge}px, ${verticalDistance / 2}px)`, offset: 0.5 },
      { transform: `translate(0, ${verticalDistance}px)` }
    ], { duration: SLIDE_MS, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
  }

  /** Trades the right half of one row with the right half of another, with the line-and-slide animation. */
  async function swapEndings(rowIndex) {
    if (isBusy) return;
    isBusy = true;
    hint.classList.remove('on');

    const partnerIndex = pickPartnerIndex(rowIndex);
    const first = rowElements[rowIndex], second = rowElements[partnerIndex];

    pulse(first.seamButton);
    const traceDrawn = drawTrace(first.seamButton, second.seamButton);
    traceDrawn.then(() => pulse(second.seamButton));

    if (!reduceMotion) {
      await wait(200);   // the line leads; the words follow
      const centerOf = element => { const box = element.getBoundingClientRect(); return box.top + box.height / 2; };
      const distance = centerOf(second.rightElement) - centerOf(first.rightElement);
      const slides = [slide(first.rightElement, distance, 18), slide(second.rightElement, -distance, 70)];
      await Promise.all(slides.map(animation => animation.finished));

      // swap the text first, then drop the animation, so nothing flickers back
      swapRightHalves(rowIndex, partnerIndex);
      slides.forEach(animation => animation.cancel());
      first.rightElement.classList.remove('moving');
      second.rightElement.classList.remove('moving');
    } else {
      swapRightHalves(rowIndex, partnerIndex);
    }

    swapCount++;
    if (swapCount < 3) { hint.textContent = 'again, anywhere'; hint.classList.add('on'); }
    isBusy = false;
  }

  /** Exchanges the right halves in the data and on the page. */
  function swapRightHalves(rowIndexA, rowIndexB) {
    const rightHalfA = rows[rowIndexA].rightHalf;
    rows[rowIndexA].rightHalf = rows[rowIndexB].rightHalf;
    rows[rowIndexB].rightHalf = rightHalfA;
    rowElements[rowIndexA].rightElement.textContent = rows[rowIndexA].rightHalf;
    rowElements[rowIndexB].rightElement.textContent = rows[rowIndexB].rightHalf;
  }

  restoreButton.addEventListener('click', restoreOriginal);
  addEventListener('resize', () => { traceLayer.innerHTML = ''; });   // line positions go stale when the layout changes

  restoreOriginal();
  setTimeout(() => hint.classList.add('on'), 1800);
})();