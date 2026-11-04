// Shared poem source for every page.
(() => {
  const bank = [
    'catch as many fish as you want',
    'something grows in every watered dirt',
    'we either will or will not grow old',
    'what do you do to soothe your nerves from forming an idea',
    'what happened yesterday, in your life',
    'the sky on my face, the reward me',
    'and also my sun which I don’t really look at',
    'hearing geese before I see them',
    'lean in and miss',
    'turned on by the responsibility of looking after it',
    'where I could meet you in your mind',
    'does love constrain your vision?',
    'could i trade some future time and spend it with you',
    'picking you up like dirt on the road',
    'swimming against the current, staying in the same place',
    'no one ideal form or type',
    'i assume, against any ideal',
    'tumbling through the hand',
  ];
  let pool = [];
  // Every page calls poemLine(). Return one short string.
  window.poemLine = () => {
    if (typeof window.markovLine === 'function') return window.markovLine();
    if (!pool.length) pool = bank.slice().sort(() => Math.random() - 0.5);
    return pool.pop();
  };
})();