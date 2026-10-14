document.documentElement.classList.add('js');

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menuToggle.hidden = false;

function closeMenu() {
  navigation.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
}

menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute(
    'aria-label',
    open ? 'Close navigation' : 'Open navigation',
  );
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    menuToggle.getAttribute('aria-expanded') === 'true'
  ) {
    closeMenu();
    menuToggle.focus();
  }
});
window.matchMedia('(max-width: 620px)').addEventListener('change', closeMenu);

const films = {
  sintel: {
    title: 'Sintel',
    meta: '2010 · Fantasy, Adventure · 15 min',
    description: 'Some journeys take you further than you ever imagined.',
    image: 'assets/films/sintel-backdrop.jpg',
    alt: 'Sintel faces an adversary in a mountainous landscape',
    page: 'https://studio.blender.org/films/sintel/',
    video: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    videoTitle: 'Sintel — official trailer',
    playLabel: 'Play trailer',
  },
  bunny: {
    title: 'Big Buck Bunny',
    meta: '2008 · Comedy, Animation · 10 min',
    description:
      'A gentle giant. Three woodland bullies. One very eventful afternoon.',
    image: 'assets/films/bunny-poster.jpg',
    alt: 'Big Buck Bunny and the woodland characters from the Blender open film',
    page: 'https://studio.blender.org/films/big-buck-bunny/',
    video: 'https://media.w3.org/2010/05/bunny/movie.mp4',
    videoTitle: 'Big Buck Bunny — open film',
    playLabel: 'Play open film',
  },
  elephants: {
    title: 'Elephants Dream',
    meta: '2006 · Sci-fi, Animation · 11 min',
    description: 'Two unlikely companions. One extraordinary mechanical world.',
    image: 'assets/films/elephants-dream.jpg',
    alt: 'Artwork for Elephants Dream, the first Blender open movie',
    page: 'https://studio.blender.org/films/elephants-dream/',
  },
  tears: {
    title: 'Tears of Steel',
    meta: '2012 · Sci-fi, Action · 12 min',
    description:
      'In a future Amsterdam, the past might be the only way forward.',
    image: 'assets/films/tears-of-steel.jpg',
    alt: 'A scene from Tears of Steel set in a future Amsterdam',
    page: 'https://studio.blender.org/films/tears-of-steel/',
  },
};

const filmCards = [...document.querySelectorAll('[data-film]')];
const featuredArt = document.querySelector('#featured-art');
const playButton = document.querySelector('#preview-play');
const filmInfo = document.querySelector('#film-info');
let selectedFilm = films.sintel;

playButton.hidden = false;
filmCards.forEach((card, index) => {
  card.addEventListener('click', () => {
    selectedFilm = films[card.dataset.film];
    document.querySelector('#featured-title').textContent = selectedFilm.title;
    document.querySelector('#featured-meta').textContent = selectedFilm.meta;
    document.querySelector('#featured-description').textContent =
      selectedFilm.description;
    document.querySelector('#film-index').textContent = String(
      index + 1,
    ).padStart(2, '0');
    featuredArt.src = selectedFilm.image;
    featuredArt.alt = selectedFilm.alt;
    filmInfo.href = selectedFilm.page;
    playButton.hidden = !selectedFilm.video;
    if (selectedFilm.video)
      playButton.querySelector('span').textContent = selectedFilm.playLabel;
    filmCards.forEach((item) => {
      const active = card === item;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  });
});

const dialog = document.querySelector('#film-dialog');
const video = document.querySelector('#preview-video');
const videoStatus = document.querySelector('#video-status');

playButton.addEventListener('click', () => {
  if (!selectedFilm.video) return;
  document.querySelector('#dialog-title').textContent = selectedFilm.videoTitle;
  document.querySelector('#video-source').href = selectedFilm.video;
  videoStatus.textContent = '';
  video.poster = selectedFilm.image;
  video.src = selectedFilm.video;
  dialog.showModal();
  video.play().catch(() => {
    if (dialog.open && !video.error)
      videoStatus.textContent = 'Use the video controls to start playback.';
  });
});
document
  .querySelector('#close-dialog')
  .addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  if (
    event.target === dialog &&
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom)
  )
    dialog.close();
});
dialog.addEventListener('close', () => {
  video.pause();
  video.removeAttribute('src');
  video.load();
  playButton.focus({ preventScroll: true });
});
video.addEventListener('error', () => {
  if (dialog.open)
    videoStatus.textContent =
      'The video could not be loaded. You can try the direct video link below.';
});
video.addEventListener('playing', () => {
  videoStatus.textContent = '';
});

// Native buttons, roving focus, and arrow keys follow the ARIA tabs pattern.
const platformTabs = [...document.querySelectorAll('[data-platform]')];
const platformPanels = [...document.querySelectorAll('.platform-panel')];
document.querySelector('.platform-tabs').hidden = false;

function selectPlatform(tab, focus = false) {
  platformTabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  platformPanels.forEach((panel) => {
    panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  });
  if (focus) tab.focus();
}
platformTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectPlatform(tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % platformTabs.length;
    if (event.key === 'ArrowLeft')
      next = (index - 1 + platformTabs.length) % platformTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = platformTabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectPlatform(platformTabs[next], true);
    }
  });
});
selectPlatform(platformTabs[0]);

const copyButton = document.querySelector('.copy-button');
const copyStatus = document.querySelector('.copy-status');
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  const code = document.querySelector('#start-command');
  try {
    await navigator.clipboard.writeText(code.textContent.trim());
    copyStatus.textContent = 'Commands copied. Ready for your terminal.';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'Commands selected. Press Ctrl+C or ⌘C to copy.';
  }
});
