/**
 * Blackout poetry page. The page opens as one dense paragraph of words. The paragraph is divided into "stretches"vof consecutive words, and a short poem line is hidden inside each stretch, in reading order. Each click blacks out every word in the next stretch except the hidden poem words, which stay visible (underlined) and read as a poem. A "new poem" button builds a fresh paragraph.
 *
 * Needs poems.js loaded first, because it calls poemLine().
 * Expects these elements: #text (the paragraph), #hint (the "click" text), #again (the "new poem" button).
 */
(() => {
  const NEXT_URL = null; // page to go to after the last stretch (null = stay on this page)
  const NUMBER_OF_STRETCHES = 8; // number of clicks; each click blacks out one stretch of text
  const WORDS_PER_STRETCH = 22; // how many words make up one stretch
  const MAX_POEM_WORDS = 6;  // a hidden poem line is cut to at most this many words

  // CSS class names. These must match the rules in the page's stylesheet: .w = any word, .x = a blacked-out word, .k = a kept poem word (underlined)
  const CLASS_WORD = 'w';
  const CLASS_BLACKED_OUT = 'x';
  const CLASS_KEPT = 'k';

  const textContainer = document.getElementById('text');
  const hint = document.getElementById('hint');
  const newPoemButton = document.getElementById('again');
  const nextPageButton = document.getElementById('next');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;   // true if the visitor wants less animation

  // The words on the page, grouped by stretch. wordsByStretch[2][5] is the 6th word of the 3rd stretch. Each entry is { element, isPoemWord }: element    - the <span> on the page, isPoemWord - true if this word is part of the hidden poem (it stays visible when blacked out)
  const wordsByStretch = [];

  // How many stretches have been blacked out so far (also the index of the next one to reveal).
  let stretchesRevealed = 0;

  /**
   * Builds a fresh paragraph and resets the click count. For each stretch it takes WORDS_PER_STRETCH filler words, then replaces a few of them (at random positions) with the words of one poem line. The poem words keep their reading order, so once the filler is blacked out what remains reads as the poem.
   *
   * Filler words come from many generated lines, so the paragraph looks like ordinary text. Every word is a <span> ending in a space, so blacked-out words join into continuous bars.
   */
  function buildParagraph() {
    // Start from a clean slate.
    textContainer.innerHTML = '';
    wordsByStretch.length = 0;
    stretchesRevealed = 0;

    // Collect enough filler words for every stretch by pulling words from many generated lines.
    const fillerWords = [];
    while (fillerWords.length < NUMBER_OF_STRETCHES * WORDS_PER_STRETCH) {
      fillerWords.push(...poemLine().split(' ').filter(Boolean));
    }

    for (let stretchIndex = 0; stretchIndex < NUMBER_OF_STRETCHES; stretchIndex++) {
      // The poem line hidden in this stretch, trimmed to a few words.
      const poemWords = poemLine().split(' ').filter(Boolean).slice(0, MAX_POEM_WORDS);

      // Choose which positions in the stretch will hold poem words: shuffle all positions, take as many as there are poem words, then sort them so the words stay in reading order.
      const poemPositions = [...Array(WORDS_PER_STRETCH).keys()]
        .sort(() => Math.random() - 0.5)
        .slice(0, poemWords.length)
        .sort((positionA, positionB) => positionA - positionB);

      let nextPoemWordIndex = 0; // which poem word to place next
      const stretchWords = [];  // this stretch's word objects

      for (let positionInStretch = 0; positionInStretch < WORDS_PER_STRETCH; positionInStretch++) {
        const isPoemWord = poemPositions.includes(positionInStretch);
        const wordText = isPoemWord
          ? poemWords[nextPoemWordIndex++]
          : fillerWords[stretchIndex * WORDS_PER_STRETCH + positionInStretch];

        // The trailing space lives inside the span so blacked-out words form one unbroken bar.
        const wordSpan = document.createElement('span');
        wordSpan.className = CLASS_WORD;
        wordSpan.textContent = wordText + ' ';
        textContainer.appendChild(wordSpan);

        stretchWords.push({ element: wordSpan, isPoemWord });
      }
      wordsByStretch.push(stretchWords);
    }
  }
  buildParagraph();

  /**
   * Blacks out one stretch: filler words get covered by a black bar, one after another; poem words are marked so they stay visible and underlined. Then scrolls the stretch into view (helpful on phones, where the paragraph is taller than the screen).
   */
  function blackOutStretch(stretchIndex) {
    let blackedOutCount = 0; // used to stagger the blackout so it sweeps across the stretch
    wordsByStretch[stretchIndex].forEach(({ element, isPoemWord }) => {
      if (isPoemWord) {
        element.classList.add(CLASS_KEPT);
      } else {
        // Each blacked-out word starts 30ms after the previous one (no delay with reduced motion).
        element.style.transitionDelay = (reduceMotion ? 0 : blackedOutCount++ * 30) + 'ms';
        element.classList.add(CLASS_BLACKED_OUT);
      }
    });

    wordsByStretch[stretchIndex][0].element.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }

  /**
   Click anywhere on the page: blacks out the next stretch. After the last stretch, a click fades the page to black and continues to NEXT_URL (if one is set).
   */
  document.addEventListener('click', () => {
    hint.classList.remove('on');

    if (stretchesRevealed < NUMBER_OF_STRETCHES) {
      blackOutStretch(stretchesRevealed++);

      // After the final stretch, offer a way onward.
      if (stretchesRevealed >= NUMBER_OF_STRETCHES && NEXT_URL) {
        hint.textContent = 'continue';
        hint.classList.add('on');
      }
    } else if (NEXT_URL) {
      document.documentElement.classList.add('out');   // the stylesheet fades the page to black
      setTimeout(() => { location.href = NEXT_URL; }, 1100);
    }
  });

  /**
   * "New poem" button: fades the paragraph out, builds a brand new one (new filler and new hidden poems, so the Markov generator is called again), scrolls back to the top and fades it back in. Works at any point, even partway through a poem.
   */
  newPoemButton.addEventListener('click', event => {
    event.stopPropagation(); // don't let this count as a page click, or it would black out a stretch
    textContainer.style.opacity = 0;

    // Wait for the fade-out to finish before swapping the text.
    setTimeout(() => {
      buildParagraph();
      scrollTo({ top: 0, behavior: 'auto' });
      textContainer.style.opacity = ''; // back to the stylesheet's value, which fades it in
      hint.textContent = 'click';
      hint.classList.add('on');
    }, reduceMotion ? 0 : 500);
  });

  // Next page direct
  nextPageButton.addEventListener('click', event => {
    window.location = '../pages/seams.html';
  });

  // Show the "click" hint after a short pause.
  setTimeout(() => hint.classList.add('on'), 1800);
})();