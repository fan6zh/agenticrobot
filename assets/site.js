(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const steps = ['observe', 'reconstruct', 'render', 'simulation', 'adapt'];
  const choices = { observe: ['observe'], reconstruct: ['reconstruct'], render: ['comparison', 'lab'], simulation: ['code', 'rl'], adapt: ['finetune', 'world'] };
  const routes = { observe: 'observe', reconstruct: 'reconstruct', comparison: 'render', lab: 'blender-render', code: 'code-as-policy', rl: 'reinforcement-learning', finetune: 'adapt', world: 'world-action-model' };
  const names = { observe: 'Real observations', reconstruct: 'Real to simulation', comparison: 'MuJoCo and Blender', lab: 'Blender render', code: 'Code as Policy', rl: 'Reinforcement learning', finetune: 'π0.5 fine-tuning', world: 'World-action model' };
  const remembered = Object.fromEntries(steps.map(step => [step, choices[step][0]]));
  const board = $('#workflow-board');
  const toolbar = $('.player-toolbar');
  const message = $('#media-message');
  const playButton = $('#stage-play');
  const progress = $('#stage-progress');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let step = 'observe', view = 'observe', clips = [], master = null;
  let playing = false, completed = false, userPaused = false, visible = false;
  let generation = 0, playRequest = 0, tickId = 0, wipeId = 0, context = -1, events = null;
  let resumeWhenVisible = false, filmWasPlaying = false;

  function ensureSource(video) {
    if (!video.getAttribute('src') && video.dataset.src) {
      video.src = video.dataset.src;
      video.load();
    }
    video.muted = true;
  }

  function metadata(video) {
    ensureSource(video);
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => done(new Error('Video load timed out')), 15000);
      const ready = () => done();
      const failed = () => done(new Error('Video could not be loaded'));
      function done(error) {
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', ready);
        video.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      }
      video.addEventListener('loadedmetadata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
    });
  }

  function updatePlayButton() {
    playButton.setAttribute('aria-label', playing ? 'Pause videos' : completed ? 'Replay videos' : 'Play videos');
    $('use', playButton).setAttribute('href', playing ? '#i-pause' : completed ? '#i-replay' : '#i-play');
    board.dataset.playing = String(playing);
  }

  function pause(user = false) {
    playRequest++;
    if (user) userPaused = true;
    clips.forEach(video => video.pause());
    playing = false;
    cancelAnimationFrame(tickId);
    updatePlayButton();
  }

  function updateContext() {
    if (view !== 'world' || !master) return;
    const next = Math.min(5, Math.max(0, Math.floor(master.currentTime / (16 / 7.5))));
    if (next === context) return;
    context = next;
    $('#future-keyframes').dataset.context = String(context);
    $$('[data-future]').forEach(image => { image.src = `assets/images/world-${context}-future-${image.dataset.future}.jpg`; });
  }

  function updateTime() {
    if (!master || !Number.isFinite(master.duration)) return;
    const fraction = Math.min(1, Math.max(0, master.currentTime / master.duration));
    progress.value = String(Math.round(fraction * 1000));
    const seconds = Math.floor(master.currentTime);
    $('#stage-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    progress.setAttribute('aria-valuetext', `${seconds} of ${Math.round(master.duration)} seconds`);
    updateContext();
  }

  function seek(fraction) {
    completed = false;
    clips.forEach(video => {
      if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration - .001, fraction * video.duration));
    });
    updateTime();
    updatePlayButton();
  }

  function tick() {
    if (!playing || !master) return;
    const fraction = master.duration ? master.currentTime / master.duration : 0;
    clips.slice(1).forEach(video => {
      if (!Number.isFinite(video.duration) || !Number.isFinite(master.duration)) return;
      video.playbackRate = video.duration / master.duration;
      const wanted = Math.min(video.duration - .001, fraction * video.duration);
      if (Math.abs(video.currentTime - wanted) > .16) video.currentTime = Math.max(0, wanted);
    });
    updateTime();
    tickId = requestAnimationFrame(tick);
  }

  async function play() {
    if (!master) return;
    const mine = generation;
    const request = ++playRequest;
    userPaused = false;
    try {
      await Promise.all(clips.map(metadata));
      if (mine !== generation || request !== playRequest) return;
      if (completed || master.ended || master.currentTime >= master.duration - .04) seek(0);
      clips.slice(1).forEach(video => { video.playbackRate = video.duration / master.duration; });
      await Promise.allSettled(clips.map(video => video.play()));
      if (mine !== generation || request !== playRequest) return;
      playing = !master.paused;
      message.hidden = playing;
      if (!playing) message.textContent = 'Press play to start this view.';
      updatePlayButton();
      cancelAnimationFrame(tickId);
      if (playing) tick();
    } catch {
      if (mine !== generation || request !== playRequest) return;
      message.textContent = 'This video could not be loaded. Try replaying the view.';
      message.hidden = false;
    }
  }

  function setReveal(value) {
    const amount = Math.max(0, Math.min(100, Number(value)));
    const comparison = $('#appearance-comparison');
    comparison.style.setProperty('--reveal', `${amount}%`);
    comparison.dataset.edge = amount < 5 ? 'start' : amount > 95 ? 'end' : 'middle';
    $('.comparison-range').value = String(Math.round(amount));
  }

  function animateWipe() {
    cancelAnimationFrame(wipeId);
    if (reduceMotion.matches) { setReveal(50); return; }
    const start = performance.now();
    setReveal(0);
    function frame(now) {
      if (view !== 'comparison') return;
      const fraction = Math.min(1, (now - start) / 4000);
      setReveal(fraction * fraction * (3 - 2 * fraction) * 100);
      if (fraction < 1) wipeId = requestAnimationFrame(frame);
    }
    wipeId = requestAnimationFrame(frame);
  }

  function updateAgent() {
    const rl = view === 'rl';
    $('#policy-agent-title').textContent = rl ? 'Codex trains and evaluates' : 'Codex develops control code';
    $('#policy-agent-copy').textContent = rl ? 'Implements image-based SAC, sets up rewards and runs simulation trials to inspect learned behavior.' : 'Writes and tests the task controller, inspects the trajectory and prepares rendered observations.';
    const world = view === 'world';
    $('#adapt-agent-title').textContent = world ? 'Codex builds and inspects' : 'Codex prepares and fine-tunes';
    $('#adapt-agent-copy').textContent = world ? 'Builds the visual prediction prototype and inspects future motion alongside the recorded observations.' : 'Prepares the datasets, configures π0.5 fine-tuning and reviews the resulting behavior.';
  }

  async function activate(nextStep, nextView, options = {}) {
    if (!choices[nextStep]?.includes(nextView)) return;
    const mine = ++generation;
    pause();
    events?.abort();
    events = new AbortController();
    cancelAnimationFrame(wipeId);
    step = nextStep;
    view = nextView;
    remembered[step] = view;
    completed = false;
    userPaused = false;
    resumeWhenVisible = false;
    context = -1;
    message.hidden = true;
    $$('.step-tab').forEach(tab => {
      const selected = tab.dataset.step === step;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const tabList = $('.workflow-tabs');
    const selectedTab = $('.step-tab[aria-selected="true"]');
    if (tabList.scrollWidth > tabList.clientWidth) {
      tabList.scrollTo({ left: selectedTab.offsetLeft - (tabList.clientWidth - selectedTab.offsetWidth) / 2, behavior: reduceMotion.matches ? 'instant' : 'smooth' });
    }
    $$('.stage-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== step; });
    const panel = $(`[data-panel="${step}"]`);
    $$('.stage-view', panel).forEach(item => { item.hidden = item.dataset.view !== view; });
    $$('[data-subview]', panel).forEach(tab => {
      const selected = tab.dataset.subview === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    board.dataset.step = step;
    board.dataset.view = view;
    $('#workflow-position').textContent = names[view];
    $('#previous-step').disabled = steps.indexOf(step) === 0;
    const nextName = ['reconstruct', 'render', 'develop policies', 'adapt & predict', 'the start'][steps.indexOf(step)];
    $('#next-step').innerHTML = `${step === 'adapt' ? 'Back to' : 'Next:'} ${nextName} <svg class="icon"><use href="#i-arrow"/></svg>`;
    progress.value = '0';
    $('#stage-time').textContent = '0:00';
    updateAgent();
    if (options.history !== false) {
      try { history.pushState(null, '', `#${routes[view]}`); } catch { location.hash = routes[view]; }
    }
    clips = $$('video', $(`[data-view="${view}"]`, panel));
    master = clips[0];
    updatePlayButton();
    master.addEventListener('timeupdate', updateTime, { signal: events.signal });
    master.addEventListener('seeked', updateTime, { signal: events.signal });
    master.addEventListener('ended', () => {
      pause();
      completed = true;
      clips.slice(1).forEach(video => { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - .001); });
      updateTime();
      progress.value = '1000';
      updatePlayButton();
    }, { signal: events.signal });
    if (view === 'comparison') setReveal(reduceMotion.matches ? 50 : 0);
    try {
      await Promise.all(clips.map(metadata));
      if (mine !== generation) return;
      seek(0);
      const shouldPlay = !reduceMotion.matches && visible && !document.hidden && !dialog.open;
      if (shouldPlay) {
        await play();
        if (mine === generation && view === 'comparison') animateWipe();
      }
    } catch {
      if (mine !== generation) return;
      message.textContent = 'This video could not be loaded. Try replaying the view.';
      message.hidden = false;
    }
  }

  function route() {
    const hash = location.hash.slice(1);
    for (const item of steps) {
      const match = choices[item].find(key => routes[key] === hash);
      if (match) { activate(item, match, { history: false }); return; }
    }
    if (!master) activate('observe', 'observe', { history: false });
  }

  $$('.step-tab').forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.step, remembered[tab.dataset.step], { gesture: true })));
  $$('[data-subview]').forEach(tab => tab.addEventListener('click', () => activate(step, tab.dataset.subview, { gesture: true })));
  $$('[role="tablist"]').forEach(list => list.addEventListener('keydown', event => {
    const tabs = $$('[role="tab"]', list);
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[target].focus({ preventScroll: true });
    tabs[target].scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'auto' });
    tabs[target].click();
  }));
  $('#next-step').addEventListener('click', () => {
    const next = steps[(steps.indexOf(step) + 1) % steps.length];
    activate(next, remembered[next], { gesture: true });
  });
  $('#previous-step').addEventListener('click', () => {
    const previous = steps[Math.max(0, steps.indexOf(step) - 1)];
    activate(previous, remembered[previous], { gesture: true });
  });
  playButton.addEventListener('click', () => playing ? pause(true) : play());
  $('#stage-replay').addEventListener('click', async () => { seek(0); await play(); });
  progress.addEventListener('input', () => seek(Number(progress.value) / 1000));
  $('.comparison-range').addEventListener('input', event => { cancelAnimationFrame(wipeId); setReveal(event.target.value); });
  $('.comparison-range').addEventListener('pointerdown', () => cancelAnimationFrame(wipeId));
  $('#animate-comparison').addEventListener('click', () => { play(); animateWipe(); });

  const toolbarHome = toolbar.parentElement;
  function restoreToolbar() {
    if (!document.fullscreenElement && toolbar.parentElement !== toolbarHome) toolbarHome.insertBefore(toolbar, message);
  }
  $('#stage-fullscreen').addEventListener('click', async () => {
    const activeView = $(`[data-view="${view}"]`);
    if (!activeView.requestFullscreen) return;
    activeView.append(toolbar);
    try { await activeView.requestFullscreen(); } catch { restoreToolbar(); }
  });
  document.addEventListener('fullscreenchange', restoreToolbar);

  const dialog = $('#film-dialog');
  const film = $('#overview-film');
  $$('[data-open-film]').forEach(button => button.addEventListener('click', () => {
    filmWasPlaying = playing;
    pause();
    ensureSource(film);
    dialog.showModal();
    film.currentTime = 0;
    film.play().catch(() => {});
    $('#close-film').focus();
  }));
  $('#close-film').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { film.pause(); if (filmWasPlaying && visible) play(); });

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible && playing) { resumeWhenVisible = true; pause(); }
    else if (visible && !userPaused && !completed && !dialog.open && !reduceMotion.matches) {
      if (resumeWhenVisible || !playing) { resumeWhenVisible = false; play(); }
    }
  }, { threshold: .08 }).observe(board);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { resumeWhenVisible = true; pause(); }
    else if (!document.hidden && visible && resumeWhenVisible && !userPaused && !dialog.open) { resumeWhenVisible = false; play(); }
  });
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  route();
})();
