/* ================================================================
   CRICKET MATCH TIME PREDICTOR – FULL LOGIC
   ================================================================ */

'use strict';

// ============================================================
// STATE
// ============================================================
const STATE = {
  // Match info
  teamA: 'TEAM A',
  teamB: 'TEAM B',
  target: 160,
  totalOvers: 20,
  innings: 1,

  // Scoring
  runs: 0,
  wickets: 0,
  legalBalls: 0,        // counts for overs (excludes wides/nb)
  totalBalls: 0,        // all deliveries

  // Extras
  extras: 0,
  wides: 0,
  noBalls: 0,
  byes: 0,
  legByes: 0,

  // Boundaries
  fours: 0,
  sixes: 0,

  // Current over balls (display)
  thisOverBalls: [],    // array of {type, runs, display}
  prevOverBalls: [],

  // Partnership
  partnershipRuns: 0,
  partnershipBalls: 0,

  // Per-over tracking {over: runRate}
  overRunRates: [],
  overRunsPerOver: [],  // runs scored each over

  // Time tracking (seconds)
  totalAddedSeconds: 0,
  totalReducedSeconds: 0,

  // Time breakdown
  addedWides: 0,
  addedNB: 0,
  addedDRS: 0,
  addedWickets: 0,
  addedOvers: 0,
  addedRain: 0,
  addedOther: 0,
  reducedBoundaries: 0,
  reducedSixes: 0,
  reducedFast: 0,
  reducedDew: 0,
  reducedOther: 0,

  // Match conditions
  isDew: false,
  isRain: false,
  rainCount: 0,

  // Base time (minutes from midnight)
  baseTimeMinutes: 0,   // set from settings
  matchStartTime: null, // Date object

  // Per-over fast bonus
  currentOverStartTime: null,
  oversCompleted: 0,

  // Player stats
  striker: { name: 'Y. Jaiswal', runs: 0, balls: 0, fours: 0, sixes: 0, initials: 'YJ' },
  nonStriker: { name: 'S. Sooryavanshi', runs: 0, balls: 0, fours: 0, sixes: 0, initials: 'SS' },
  bowler: { name: 'V. Chakravarthy', overs: 0, legalBalls: 0, runs: 0, wickets: 0, wides: 0, nb: 0, initials: 'VC' },

  // History
  eventHistory: [],
  undoStack: [],

  // DRS
  drsCount: 0,

  // Scorecard
  dismissals: [],
  bowlerList: [],

  // Time shift history (per event)
  timeShiftHistory: [],   // [{added, reduced, event, over}]

  // Time elapsed
  elapsedInterval: null,
};

// ============================================================
// TIME CONFIG (seconds per event)
// ============================================================
const TIME_COST = {
  dot:             8,
  '1':             9,
  '2':             10,
  '3':             12,
  '4':             12,
  '6':             15,
  wide:            14,
  noball:          16,
  bye:             9,
  legbye:          9,
  overthrow:       5,
  bowled:          35,
  lbw:             35,
  caught:          40,
  runout:          50,
  stumping:        35,
  hitwkt:          35,
  drs:             120,
  appeal:          5,
  fieldchange:     10,
  freehit:         5,
  equipment:       30,
  'batter-reset':  15,
  'over-complete': 30,
  'bowler-change': 20,
  'innings-break': 0,
  rain:            600,
};

const TIME_REDUCE = {
  four:    0,      // handled via reducedBoundaries
  six:     0,      // handled via reducedSixes
  fastOver: 10,
  dew:     5,
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  initBaseTime();
  updateAllUI();
  initCharts();
  startClock();
  loadSavedMatches();
  startElapsedTimer();
  initSettings();
});

function initBaseTime() {
  const input = document.getElementById('start-time-input');
  const val = input ? input.value : '20:00';
  const [h, m] = val.split(':').map(Number);
  STATE.baseTimeMinutes = h * 60 + m;
  // Base match expected ~3.5 hours (210 min) for T20
  // So base end time = baseTimeMinutes + 210 min
  STATE.matchStartTime = new Date();
}

function updateStartTime() {
  const val = document.getElementById('start-time-input').value;
  const [h, m] = val.split(':').map(Number);
  STATE.baseTimeMinutes = h * 60 + m;
  updateTimePrediction();
}

function updateTarget() {
  STATE.target = parseInt(document.getElementById('target-input').value) || 160;
  updateAllUI();
}

function updateTotalOvers() {
  STATE.totalOvers = parseInt(document.getElementById('total-overs-input').value) || 20;
  updateAllUI();
}

function updateTeamNames() {
  STATE.teamA = document.getElementById('team-a-input').value || 'TEAM A';
  STATE.teamB = document.getElementById('team-b-input').value || 'TEAM B';
  document.getElementById('team-a-name').textContent = STATE.teamA;
  document.getElementById('team-b-name').textContent = STATE.teamB;
  document.getElementById('team-a-logo').textContent = STATE.teamA.substring(0, 3).toUpperCase();
  document.getElementById('team-b-logo').textContent = STATE.teamB.substring(0, 3).toUpperCase();
}

function updatePlayers() {
  STATE.striker.name = document.getElementById('striker-name-input').value || 'Striker';
  STATE.nonStriker.name = document.getElementById('nonstriker-name-input').value || 'Non-Striker';
  STATE.bowler.name = document.getElementById('bowler-name-input').value || 'Bowler';
  STATE.striker.initials = getInitials(STATE.striker.name);
  STATE.nonStriker.initials = getInitials(STATE.nonStriker.name);
  STATE.bowler.initials = getInitials(STATE.bowler.name);
  updatePlayerUI();
}

function initSettings() {
  updateTeamNames();
  updatePlayers();
}

function getInitials(name) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2);
}

// ============================================================
// MAIN EVENT HANDLER
// ============================================================
function addEvent(type) {
  // Animate button
  const btnMap = {
    dot: 'btn-dot', '1': 'btn-1', '2': 'btn-2', '3': 'btn-3',
    '4': 'btn-4', '6': 'btn-6', wide: 'btn-wide', noball: 'btn-nb',
    bye: 'btn-bye', legbye: 'btn-lb', overthrow: 'btn-overthrow',
    bowled: 'btn-bowled', caught: 'btn-caught', lbw: 'btn-lbw',
    runout: 'btn-runout', stumping: 'btn-stumping', hitwkt: 'btn-hitwkt',
    drs: 'btn-drs', appeal: 'btn-appeal', fieldchange: 'btn-fieldchange',
    freehit: 'btn-freehit', equipment: 'btn-equipment',
    'batter-reset': 'btn-batter-reset',
    'over-complete': 'btn-over', 'bowler-change': 'btn-bowler',
    'innings-break': 'btn-innings',
  };
  const btnId = btnMap[type];
  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.add('btn-clicked');
      setTimeout(() => btn.classList.remove('btn-clicked'), 200);
    }
  }

  // Save undo snapshot
  STATE.undoStack.push(JSON.parse(JSON.stringify({
    runs: STATE.runs, wickets: STATE.wickets,
    legalBalls: STATE.legalBalls, totalBalls: STATE.totalBalls,
    extras: STATE.extras, wides: STATE.wides, noBalls: STATE.noBalls,
    byes: STATE.byes, legByes: STATE.legByes,
    fours: STATE.fours, sixes: STATE.sixes,
    partnershipRuns: STATE.partnershipRuns, partnershipBalls: STATE.partnershipBalls,
    totalAddedSeconds: STATE.totalAddedSeconds,
    totalReducedSeconds: STATE.totalReducedSeconds,
    addedWides: STATE.addedWides, addedNB: STATE.addedNB,
    addedDRS: STATE.addedDRS, addedWickets: STATE.addedWickets,
    addedOvers: STATE.addedOvers, addedRain: STATE.addedRain, addedOther: STATE.addedOther,
    reducedBoundaries: STATE.reducedBoundaries, reducedSixes: STATE.reducedSixes,
    reducedFast: STATE.reducedFast, reducedDew: STATE.reducedDew, reducedOther: STATE.reducedOther,
    striker: JSON.parse(JSON.stringify(STATE.striker)),
    nonStriker: JSON.parse(JSON.stringify(STATE.nonStriker)),
    bowler: JSON.parse(JSON.stringify(STATE.bowler)),
    thisOverBalls: [...STATE.thisOverBalls],
    eventHistory: [...STATE.eventHistory],
    timeShiftHistory: [...STATE.timeShiftHistory],
    drsCount: STATE.drsCount,
    oversCompleted: STATE.oversCompleted,
  })));

  let addedSec = TIME_COST[type] || 0;
  let reducedSec = 0;
  let ballDisplay = '';
  let ballClass = '';
  let isLegal = true;
  let scoreAdded = 0;

  const currentBallNumber = getBallStr();

  switch (type) {
    case 'dot':
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      ballDisplay = '0'; ballClass = 'dot'; break;

    case '1': case '2': case '3':
      scoreAdded = parseInt(type);
      STATE.runs += scoreAdded;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.runs += scoreAdded; STATE.striker.balls++;
      STATE.partnershipRuns += scoreAdded; STATE.partnershipBalls++;
      ballDisplay = type; ballClass = `run-${type}`;
      // Rotate strike for odd runs
      if (scoreAdded % 2 === 1) swapBatters();
      break;

    case '4':
      scoreAdded = 4;
      STATE.runs += 4; STATE.fours++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.runs += 4; STATE.striker.balls++; STATE.striker.fours++;
      STATE.partnershipRuns += 4; STATE.partnershipBalls++;
      STATE.bowler.runs += 4;
      reducedSec = 1;  // slight bonus for quick run
      STATE.reducedBoundaries++;
      ballDisplay = '4'; ballClass = 'four'; break;

    case '6':
      scoreAdded = 6;
      STATE.runs += 6; STATE.sixes++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.runs += 6; STATE.striker.balls++; STATE.striker.sixes++;
      STATE.partnershipRuns += 6; STATE.partnershipBalls++;
      STATE.bowler.runs += 6;
      reducedSec = 1;
      STATE.reducedSixes++;
      ballDisplay = '6'; ballClass = 'six'; break;

    case 'wide':
      STATE.extras++; STATE.wides++; STATE.runs++;
      STATE.bowler.runs++; STATE.bowler.wides++;
      STATE.totalBalls++;
      isLegal = false;
      STATE.addedWides += addedSec;
      ballDisplay = 'WD'; ballClass = 'wide'; break;

    case 'noball':
      STATE.extras++; STATE.noBalls++; STATE.runs++;
      STATE.bowler.runs++; STATE.bowler.nb++;
      STATE.totalBalls++;
      isLegal = false;
      STATE.addedNB += addedSec;
      ballDisplay = 'NB'; ballClass = 'noball'; break;

    case 'bye':
      STATE.extras++; STATE.byes++; STATE.runs++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.partnershipRuns++; STATE.partnershipBalls++;
      ballDisplay = 'B'; ballClass = 'bye'; break;

    case 'legbye':
      STATE.extras++; STATE.legByes++; STATE.runs++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.partnershipRuns++; STATE.partnershipBalls++;
      ballDisplay = 'LB'; ballClass = 'legbye'; break;

    case 'overthrow':
      STATE.runs += 4; scoreAdded = 4;
      STATE.extras += 4;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.partnershipBalls++;
      ballDisplay = 'OT'; ballClass = 'four'; break;

    // WICKETS
    case 'bowled':
    case 'lbw':
    case 'stumping':
    case 'hitwkt':
      STATE.wickets++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      STATE.bowler.wickets++;
      STATE.addedWickets += addedSec;
      recordDismissal(STATE.striker, type, STATE.bowler.name);
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket'; break;

    case 'caught':
      STATE.wickets++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      STATE.bowler.wickets++;
      STATE.addedWickets += addedSec;
      recordDismissal(STATE.striker, 'caught', STATE.bowler.name);
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket'; break;

    case 'runout':
      STATE.wickets++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      STATE.addedWickets += addedSec;
      recordDismissal(STATE.striker, 'run out', '(run out)');
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket'; break;

    case 'drs':
      STATE.drsCount++;
      STATE.addedDRS += addedSec;
      ballDisplay = 'DRS'; ballClass = 'noball';
      isLegal = false; break;

    case 'appeal':
      STATE.addedOther += addedSec;
      ballDisplay = 'APP'; ballClass = 'dot';
      isLegal = false; break;

    case 'fieldchange':
    case 'equipment':
    case 'batter-reset':
    case 'bowler-change':
    case 'freehit':
      STATE.addedOther += addedSec;
      isLegal = false; break;

    case 'over-complete':
      // Complete current over
      completeOver();
      STATE.addedOvers += addedSec;
      isLegal = false; break;

    case 'innings-break':
      STATE.addedOther += 600;
      addedSec = 600;
      showInningsBreak();
      isLegal = false; break;
  }

  // Update bowler legal balls
  if (isLegal && !['drs','appeal','fieldchange','equipment','batter-reset','bowler-change','freehit','over-complete','innings-break'].includes(type)) {
    STATE.bowler.legalBalls++;
    STATE.bowler.overs = Math.floor(STATE.bowler.legalBalls / 6) + (STATE.bowler.legalBalls % 6) / 10;
  }

  // Add to time totals
  STATE.totalAddedSeconds += addedSec;
  STATE.totalReducedSeconds += reducedSec;

  // Time shift record
  const net = addedSec - reducedSec;
  STATE.timeShiftHistory.push({
    added: addedSec,
    reduced: reducedSec,
    net: net,
    event: type,
    over: parseFloat(getOversDisplay()),
  });

  // Add ball to over display
  if (ballDisplay && type !== 'over-complete' && type !== 'innings-break') {
    STATE.thisOverBalls.push({ display: ballDisplay, class: ballClass });
  }

  // Auto over complete when 6 legal balls
  if (STATE.legalBalls % 6 === 0 && STATE.legalBalls > 0 && isLegal && type !== 'over-complete') {
    setTimeout(() => addEvent('over-complete'), 100);
  }

  // Add to event history
  const histEntry = {
    type, ballDisplay, ballClass,
    score: `${STATE.runs}/${STATE.wickets}`,
    overs: getOversDisplay(),
    timeShift: net,
    timestamp: new Date().toLocaleTimeString(),
  };
  STATE.eventHistory.unshift(histEntry);

  // Update UI
  updateAllUI();
  updateCharts();
  updateHistoryUI();
  saveToLocalStorage();

  // Flash score
  if (scoreAdded > 0) {
    const el = document.getElementById('score-runs');
    el.classList.add('flash-score');
    setTimeout(() => el.classList.remove('flash-score'), 600);
  }
  if (['bowled','caught','lbw','runout','stumping','hitwkt'].includes(type)) {
    const el = document.getElementById('score-wickets');
    el.classList.add('flash-wicket');
    setTimeout(() => el.classList.remove('flash-wicket'), 800);
  }

  // Update last time shift display
  updateTimeShiftDisplay(addedSec, reducedSec, type);
}

// ============================================================
// HELPER: OVERS DISPLAY
// ============================================================
function getOversDisplay() {
  const completedOvers = Math.floor(STATE.legalBalls / 6);
  const ballsInOver = STATE.legalBalls % 6;
  return `${completedOvers}.${ballsInOver}`;
}

function getBallStr() {
  const completedOvers = Math.floor(STATE.legalBalls / 6);
  const ballsInOver = STATE.legalBalls % 6;
  return `${completedOvers}.${ballsInOver}`;
}

// ============================================================
// OVER COMPLETE
// ============================================================
function completeOver() {
  const runsThisOver = STATE.thisOverBalls
    .filter(b => !['WD','NB','APP','DRS'].includes(b.display))
    .reduce((acc, b) => {
      const n = parseInt(b.display);
      return acc + (isNaN(n) ? (b.display === 'W' ? 0 : 0) : n);
    }, 0);

  // Fast over bonus: if over completed quickly (under 3 min = 180 sec assumed), give reduction
  const fastBonus = runsThisOver >= 8 ? TIME_REDUCE.fastOver : (runsThisOver >= 6 ? 5 : 0);
  STATE.totalReducedSeconds += fastBonus;
  STATE.reducedFast += fastBonus;

  // Dew bonus
  if (STATE.isDew) {
    STATE.totalReducedSeconds += TIME_REDUCE.dew;
    STATE.reducedDew += TIME_REDUCE.dew;
  }

  STATE.overRunsPerOver.push(runsThisOver);

  // Calculate CRR for this over
  const completedOvers = Math.floor(STATE.legalBalls / 6) || 1;
  STATE.overRunRates.push({
    over: completedOvers,
    rr: parseFloat((STATE.runs / completedOvers).toFixed(2)),
  });

  STATE.oversCompleted++;

  // Rotate batters at end of over
  swapBatters();

  // Save prev over balls
  STATE.prevOverBalls = [...STATE.thisOverBalls];
  STATE.thisOverBalls = [];

  // Add bowler to list if not exists
  updateBowlerList();
}

function updateBowlerList() {
  const existing = STATE.bowlerList.find(b => b.name === STATE.bowler.name);
  if (!existing) {
    STATE.bowlerList.push({
      name: STATE.bowler.name,
      overs: STATE.bowler.legalBalls,
      runs: STATE.bowler.runs,
      wickets: STATE.bowler.wickets,
    });
  } else {
    existing.overs = STATE.bowler.legalBalls;
    existing.runs = STATE.bowler.runs;
    existing.wickets = STATE.bowler.wickets;
  }
  updateScorecardUI();
}

// ============================================================
// SWAP BATTERS
// ============================================================
function swapBatters() {
  const temp = STATE.striker;
  STATE.striker = STATE.nonStriker;
  STATE.nonStriker = temp;
  updatePlayerUI();
}

// ============================================================
// WICKET HANDLING
// ============================================================
function recordDismissal(batter, mode, bowlerName) {
  STATE.dismissals.push({
    name: batter.name,
    runs: batter.runs,
    balls: batter.balls,
    fours: batter.fours,
    sixes: batter.sixes,
    sr: batter.balls > 0 ? ((batter.runs / batter.balls) * 100).toFixed(1) : '0.0',
    mode,
    bowler: bowlerName,
  });
  STATE.partnershipRuns = 0;
  STATE.partnershipBalls = 0;
}

function resetStriker() {
  const nextBatterNum = STATE.dismissals.length + 1;
  const names = ['Opening 2', 'Batter 3', 'Batter 4', 'Batter 5', 'Batter 6', 'Batter 7', 'Batter 8', 'Batter 9', 'Tailender'];
  STATE.striker = {
    name: names[Math.min(nextBatterNum, names.length - 1)],
    runs: 0, balls: 0, fours: 0, sixes: 0,
    initials: `B${nextBatterNum + 1}`,
  };
}

// ============================================================
// TIME PREDICTION ENGINE
// ============================================================
function computePredictedTime() {
  // Base end time = match start + 210 minutes (expected T20 duration)
  const baseEndMin = STATE.baseTimeMinutes + 210;
  const netSeconds = STATE.totalAddedSeconds - STATE.totalReducedSeconds;
  const predictedMin = baseEndMin + netSeconds / 60;

  const hours = Math.floor(predictedMin / 60) % 24;
  const mins = Math.round(predictedMin % 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const timeStr = `${h12}:${String(mins).padStart(2, '0')} ${period}`;

  // Base time display
  const bH = Math.floor(baseEndMin / 60) % 24;
  const bM = baseEndMin % 60;
  const bPeriod = bH >= 12 ? 'PM' : 'AM';
  const bH12 = bH % 12 === 0 ? 12 : bH % 12;
  const baseStr = `${bH12}:${String(bM).padStart(2, '0')} ${bPeriod}`;

  return { timeStr, baseStr, netSeconds };
}

function updateTimePrediction() {
  const { timeStr, baseStr, netSeconds } = computePredictedTime();
  document.getElementById('predicted-time-big').textContent = timeStr;
  document.getElementById('base-time-display').textContent = baseStr;

  const sign = netSeconds >= 0 ? '+' : '';
  const m = Math.floor(Math.abs(netSeconds) / 60);
  const s = Math.abs(netSeconds) % 60;
  const changeStr = `TOTAL CHANGE: ${sign}${m > 0 ? m + ' min ' : ''}${s} sec`;
  const changeEl = document.getElementById('total-change-display');
  changeEl.textContent = changeStr;
  changeEl.style.color = netSeconds > 0 ? 'var(--accent-red)' : (netSeconds < 0 ? 'var(--accent-green)' : 'var(--text-muted)');

  // Added/reduced breakdowns
  setText('added-time-total', `+ ${formatSec(STATE.totalAddedSeconds)}`);
  setText('reduced-time-total', `– ${formatSec(STATE.totalReducedSeconds)}`);
  setText('added-wides', `+${formatSec(STATE.addedWides)}`);
  setText('added-nb', `+${formatSec(STATE.addedNB)}`);
  setText('added-drs', `+${formatSec(STATE.addedDRS)}`);
  setText('added-wickets', `+${formatSec(STATE.addedWickets)}`);
  setText('added-overs', `+${formatSec(STATE.addedOvers)}`);
  setText('added-rain', `+${formatSec(STATE.addedRain)}`);
  setText('added-other', `+${formatSec(STATE.addedOther)}`);
  setText('reduced-boundaries', `-${formatSec(STATE.reducedBoundaries)}`);
  setText('reduced-sixes', `-${formatSec(STATE.reducedSixes)}`);
  setText('reduced-fast', `-${formatSec(STATE.reducedFast)}`);
  setText('reduced-dew', `-${formatSec(STATE.reducedDew)}`);
  setText('reduced-other', `-${formatSec(STATE.reducedOther)}`);

  // Confidence
  const confidence = computeConfidence();
  const circle = document.getElementById('confidence-circle');
  const circumference = 2 * Math.PI * 40;
  const dash = (confidence / 100) * circumference;
  circle.style.strokeDasharray = `${dash.toFixed(1)} ${circumference.toFixed(1)}`;
  document.getElementById('confidence-text').textContent = `${confidence}%`;

  // Factors
  updateFactors();
}

function computeConfidence() {
  let score = 70; // base
  const overs = Math.floor(STATE.legalBalls / 6);
  score += Math.min(20, overs * 2);  // more overs = more confident
  if (STATE.isRain) score -= 20;
  if (STATE.drsCount > 2) score -= 5;
  if (STATE.wickets >= 7) score -= 10;
  return Math.max(10, Math.min(99, score));
}

function updateFactors() {
  const f = {
    weather: STATE.isRain ? 'Bad' : 'Good',
    pitch: STATE.sixes > 4 ? 'Batting' : (STATE.wickets > 4 ? 'Bowling' : 'Neutral'),
    dew: STATE.isDew ? 'High' : 'Low',
    overrate: STATE.oversCompleted > 0 ? 'Good' : 'Pending',
    interruptions: STATE.isRain ? 'Rain' : (STATE.drsCount > 0 ? 'DRS' : 'None'),
  };
  setTextClass('f-weather', f.weather, f.weather === 'Good' ? 'good' : 'bad');
  setTextClass('f-pitch', f.pitch, 'warn');
  setTextClass('f-dew', f.dew, f.dew === 'High' ? 'warn' : 'good');
  setTextClass('f-overrate', f.overrate, f.overrate === 'Good' ? 'good' : '');
  setTextClass('f-interruptions', f.interruptions, f.interruptions === 'None' ? 'good' : 'bad');
}

function formatSec(sec) {
  if (sec === 0) return '0 sec';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0 && s > 0) return `${m} min ${s} sec`;
  if (m > 0) return `${m} min 0 sec`;
  return `${s} sec`;
}

// ============================================================
// UPDATE ALL UI
// ============================================================
function updateAllUI() {
  updateScoreboard();
  updateMatchInfoCard();
  updateOverSummary();
  updatePlayerUI();
  updateTimePrediction();
  updateAnalytics();
  updateQuickStats();
}

function updateScoreboard() {
  const overs = getOversDisplay();
  const crr = STATE.legalBalls > 0 ? ((STATE.runs / (STATE.legalBalls / 6))).toFixed(2) : '0.00';
  const ballsLeft = STATE.totalOvers * 6 - STATE.legalBalls;
  const rrr = STATE.innings === 2 && ballsLeft > 0
    ? (((STATE.target - STATE.runs) / (ballsLeft / 6))).toFixed(2)
    : '—';

  setText('score-runs', STATE.runs);
  setText('score-wickets', STATE.wickets);
  setText('overs-display', overs);
  setText('crr-val', crr);
  setText('rrr-val', rrr);
  setText('target-val', STATE.innings === 2 ? STATE.target : '—');
  setText('extras-display', STATE.extras);
  setText('extras-bar-val', STATE.extras);
  setText('wd-count', STATE.wides);
  setText('nb-count', STATE.noBalls);
  setText('bye-count', STATE.byes);
  setText('lb-count', STATE.legByes);

  // This over balls in header
  renderHeaderOverBalls();
}

function updateMatchInfoCard() {
  const overs = getOversDisplay();
  const crr = STATE.legalBalls > 0 ? ((STATE.runs / (STATE.legalBalls / 6))).toFixed(2) : '0.00';
  const totalPartnershipBalls = STATE.partnershipBalls;

  setText('ms-score', `${STATE.runs}/${STATE.wickets}`);
  setText('ms-overs', overs);
  setText('ms-rr', crr);
  setText('ms-partnership', STATE.partnershipRuns);
  setText('ms-partnership-balls', totalPartnershipBalls);
  setText('ms-extras', STATE.extras);
  setText('ms-wickets', STATE.wickets);
  setText('fours-count', STATE.fours);
  setText('sixes-count', STATE.sixes);

  // Partnership ring
  const partPct = Math.min(100, (STATE.partnershipRuns / Math.max(1, STATE.target)) * 100);
  const ring = document.getElementById('partnership-ring');
  if (ring) ring.style.strokeDasharray = `${partPct.toFixed(1)}, 100`;

  // Last event
  if (STATE.eventHistory.length > 0) {
    const last = STATE.eventHistory[0];
    const display = getEventLabel(last.type);
    setText('ms-last-event', display);
  }
}

function getEventLabel(type) {
  const labels = {
    dot: '• Dot Ball', '1': '1 Run', '2': '2 Runs', '3': '3 Runs',
    '4': '⚡ FOUR!', '6': '💥 SIX!',
    wide: 'Wide', noball: 'No Ball', bye: 'Bye', legbye: 'Leg Bye', overthrow: 'Overthrow',
    bowled: '🏏 BOWLED!', caught: '🚀 CAUGHT!', lbw: 'LBW', runout: '🏃 RUN OUT!',
    stumping: 'Stumped', hitwkt: 'Hit Wicket',
    drs: '📺 DRS', appeal: 'Appeal', fieldchange: 'Field Change',
    freehit: '🎯 Free Hit', equipment: 'Equipment', 'batter-reset': 'Batter Reset',
    'over-complete': '✅ Over Done', 'bowler-change': 'Bowler Change',
    'innings-break': '🔔 Innings Break',
  };
  return labels[type] || type;
}

function updateOverSummary() {
  setText('os-overs', getOversDisplay());

  // Calculate this over runs
  const thisOverRuns = STATE.thisOverBalls.reduce((acc, b) => {
    const n = parseInt(b.display);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
  setText('os-this-over-runs', thisOverRuns);

  // Render current over balls
  renderBallChips('over-balls-display', STATE.thisOverBalls);
  renderBallChips('prev-over-display', STATE.prevOverBalls);
}

function renderBallChips(containerId, balls) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!balls || balls.length === 0) {
    el.innerHTML = '<span class="ball-chip empty">—</span>';
    return;
  }
  el.innerHTML = balls.map(b => `<span class="ball-chip ${b.class}">${b.display}</span>`).join('');
}

function renderHeaderOverBalls() {
  const el = document.getElementById('this-over-balls');
  if (!el) return;
  const balls = STATE.thisOverBalls;
  if (!balls || balls.length === 0) {
    el.innerHTML = '<span class="ball-chip empty">—</span>';
    return;
  }
  el.innerHTML = balls.map(b => `<span class="ball-chip ${b.class}">${b.display}</span>`).join('');
}

function updatePlayerUI() {
  // Striker
  const s = STATE.striker;
  setText('striker-name', s.name);
  setText('striker-runs', s.runs);
  setText('striker-balls', s.balls);
  setText('striker-fours', s.fours);
  setText('striker-sixes', s.sixes);
  const ssr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
  setText('striker-sr', ssr);
  setText('striker-avatar', s.initials || getInitials(s.name));
  const srBarPct = Math.min(100, parseFloat(ssr) / 2);
  const srBar = document.getElementById('striker-sr-bar');
  if (srBar) srBar.style.width = `${srBarPct}%`;

  // Non-striker
  const ns = STATE.nonStriker;
  setText('nonstriker-name', ns.name);
  setText('nonstriker-runs', ns.runs);
  setText('nonstriker-balls', ns.balls);
  setText('nonstriker-fours', ns.fours);
  setText('nonstriker-sixes', ns.sixes);
  const nsr = ns.balls > 0 ? ((ns.runs / ns.balls) * 100).toFixed(1) : '0.0';
  setText('nonstriker-sr', nsr);
  setText('nonstriker-avatar', ns.initials || getInitials(ns.name));

  // Bowler
  const bw = STATE.bowler;
  const bwLegalBalls = bw.legalBalls;
  const bwOvers = `${Math.floor(bwLegalBalls / 6)}.${bwLegalBalls % 6}`;
  setText('bowler-name', bw.name);
  setText('bowler-overs', bwOvers);
  setText('bowler-runs', bw.runs);
  setText('bowler-wkts', bw.wickets);
  const bwEcon = bwLegalBalls > 0 ? (bw.runs / (bwLegalBalls / 6)).toFixed(2) : '0.00';
  setText('bowler-econ', bwEcon);
  setText('bowler-wides', bw.wides);
  setText('bowler-nb', bw.nb);
  setText('bowler-avatar', bw.initials || getInitials(bw.name));
}

function updateQuickStats() {
  const ballsLeft = STATE.totalOvers * 6 - STATE.legalBalls;
  const runsNeeded = STATE.innings === 2 ? Math.max(0, STATE.target - STATE.runs) : '—';
  setText('qs-balls-left', ballsLeft);
  setText('qs-runs-needed', runsNeeded);
  setText('qs-events', STATE.eventHistory.length);
}

function updateAnalytics() {
  const totalDeliveries = STATE.legalBalls || 1;
  const dotPct = Math.round((STATE.eventHistory.filter(e => e.type === 'dot').length / totalDeliveries) * 100);
  const boundaryPct = Math.round(((STATE.fours + STATE.sixes) / totalDeliveries) * 100);
  const extraPct = Math.round((STATE.extras / (STATE.runs || 1)) * 100);
  const oversCompleted = Math.floor(STATE.legalBalls / 6) || 1;
  const avgPerOver = (STATE.runs / oversCompleted).toFixed(1);
  const projected = Math.round(parseFloat(avgPerOver) * STATE.totalOvers);
  const wicketRate = STATE.legalBalls > 0 ? ((STATE.wickets / STATE.legalBalls) * 6).toFixed(1) : '0';

  setText('a-dot-pct', `${dotPct}%`);
  setText('a-boundary-pct', `${boundaryPct}%`);
  setText('a-extra-pct', `${extraPct}%`);
  setText('a-avg-over', avgPerOver);
  setText('a-projected', projected);
  setText('a-wicket-rate', `${wicketRate} per 6`);

  setStyleProp('a-dot-bar', 'width', `${Math.min(100, dotPct)}%`);
  setStyleProp('a-boundary-bar', 'width', `${Math.min(100, boundaryPct)}%`);
  setStyleProp('a-extra-bar', 'width', `${Math.min(100, extraPct)}%`);
}

function updateScorecardUI() {
  // Batting
  const tbody = document.getElementById('scorecard-body');
  if (tbody) {
    if (STATE.dismissals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No dismissals yet</td></tr>';
    } else {
      tbody.innerHTML = STATE.dismissals.map(d => `
        <tr>
          <td>${d.name}</td>
          <td style="color:var(--text-muted);font-size:0.65rem;">${d.mode} b ${d.bowler}</td>
          <td style="font-weight:700;color:var(--text-primary);">${d.runs}</td>
          <td>${d.balls}</td>
          <td>${d.fours}</td>
          <td>${d.sixes}</td>
          <td style="color:var(--accent-yellow);">${d.sr}</td>
        </tr>
      `).join('');
    }
  }

  // Bowling
  const bbody = document.getElementById('bowling-body');
  if (bbody) {
    if (STATE.bowlerList.length === 0) {
      bbody.innerHTML = '<tr><td colspan="6" class="empty-row">—</td></tr>';
    } else {
      bbody.innerHTML = STATE.bowlerList.map(b => {
        const balls = b.overs;
        const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
        const econ = balls > 0 ? (b.runs / (balls / 6)).toFixed(2) : '0.00';
        return `<tr>
          <td>${b.name}</td>
          <td>${overs}</td>
          <td>0</td>
          <td>${b.runs}</td>
          <td style="color:var(--accent-red);font-weight:700;">${b.wickets}</td>
          <td style="color:var(--accent-yellow);">${econ}</td>
        </tr>`;
      }).join('');
    }
  }
}

// ============================================================
// HISTORY UI
// ============================================================
function updateHistoryUI() {
  const container = document.getElementById('history-list');
  if (!container) return;
  if (STATE.eventHistory.length === 0) {
    container.innerHTML = '<div class="empty-history">No events yet. Start adding balls!</div>';
    return;
  }
  container.innerHTML = STATE.eventHistory.slice(0, 60).map(e => {
    const ts = e.timeShift;
    const tsClass = ts <= 0 ? 'positive' : '';
    const tsSign = ts > 0 ? '+' : '';
    const label = getEventLabel(e.type);
    return `<div class="history-item">
      <span class="ball-chip ${e.ballClass} history-ball">${e.ballDisplay || '—'}</span>
      <div class="history-event">
        <div style="font-weight:600;color:var(--text-primary);font-size:0.72rem;">${label}</div>
        <div class="history-score">${e.score} | ${e.overs} ov | ${e.timestamp}</div>
      </div>
      <span class="history-time-shift ${tsClass}">${tsSign}${ts}s</span>
    </div>`;
  }).join('');
}

// ============================================================
// TIME SHIFT DISPLAY (RIGHT PANEL)
// ============================================================
function updateTimeShiftDisplay(added, reduced, type) {
  const net = added - reduced;
  const el = document.getElementById('time-shift-display');
  if (!el) return;
  const arrow = net > 0 ? '▲' : (net < 0 ? '▼' : '●');
  const color = net > 0 ? 'var(--accent-red)' : (net < 0 ? 'var(--accent-green)' : 'var(--text-muted)');
  const label = getEventLabel(type);
  el.innerHTML = `
    <span class="ts-arrow" style="color:${color};">${arrow} ${net > 0 ? '+' : ''}${net}s</span>
    <span class="ts-label">${label}</span>
  `;
}

// ============================================================
// CHARTS
// ============================================================
let rrChart = null;
let timelineChart = null;
let analyticsChart = null;

function initCharts() {
  Chart.defaults.color = '#8892a4';
  Chart.defaults.font.family = 'Inter';

  // Run Rate Trend
  const rrCtx = document.getElementById('rr-chart');
  if (rrCtx) {
    rrChart = new Chart(rrCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'CRR',
          data: [],
          borderColor: '#00d68f',
          backgroundColor: 'rgba(0,214,143,0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#00d68f',
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        }, {
          label: 'RRR',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 3],
          pointRadius: 0,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: true, labels: { font: { size: 10 }, boxWidth: 20 } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 9 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 9 } }, min: 0 },
        },
      },
    });
  }

  // Timeline chart
  const tlCtx = document.getElementById('timeline-chart');
  if (tlCtx) {
    timelineChart = new Chart(tlCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Added Time',
          data: [],
          backgroundColor: 'rgba(255,77,109,0.6)',
          borderColor: '#ff4d6d',
          borderWidth: 1,
          borderRadius: 3,
        }, {
          label: 'Reduced Time',
          data: [],
          backgroundColor: 'rgba(0,214,143,0.5)',
          borderColor: '#00d68f',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: true, labels: { font: { size: 9 }, boxWidth: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 0 } },
          y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { size: 8 } } },
        },
      },
    });
  }

  // Analytics chart
  const anCtx = document.getElementById('analytics-chart');
  if (anCtx) {
    analyticsChart = new Chart(anCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Runs per Over',
          data: [],
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 9 } }, min: 0 },
        },
      },
    });
  }
}

function updateCharts() {
  if (!rrChart || !timelineChart || !analyticsChart) return;

  // RR Trend (over-by-over)
  if (STATE.overRunRates.length > 0) {
    rrChart.data.labels = STATE.overRunRates.map(r => `Ov${r.over}`);
    rrChart.data.datasets[0].data = STATE.overRunRates.map(r => r.rr);
    // RRR line
    const ballsLeft = STATE.totalOvers * 6 - STATE.legalBalls;
    const rrr = ballsLeft > 0 ? ((STATE.target - STATE.runs) / (ballsLeft / 6)) : 0;
    rrChart.data.datasets[1].data = STATE.overRunRates.map(() => rrr.toFixed(2));
    rrChart.update();
  }

  // Timeline (last 20 events)
  const recent = STATE.timeShiftHistory.slice(-20);
  timelineChart.data.labels = recent.map((_, i) => i + 1);
  timelineChart.data.datasets[0].data = recent.map(e => e.added);
  timelineChart.data.datasets[1].data = recent.map(e => e.reduced);
  timelineChart.update();

  // Analytics chart
  if (STATE.overRunsPerOver.length > 0) {
    analyticsChart.data.labels = STATE.overRunsPerOver.map((_, i) => `Ov${i + 1}`);
    analyticsChart.data.datasets[0].data = STATE.overRunsPerOver;
    analyticsChart.update();
  }
}

// ============================================================
// TOGGLE RAIN / DEW
// ============================================================
function toggleRain() {
  STATE.isRain = !STATE.isRain;
  if (STATE.isRain) {
    STATE.totalAddedSeconds += TIME_COST.rain;
    STATE.addedRain += TIME_COST.rain;
    STATE.rainCount++;
  } else {
    // Remove the last rain addition
    const rainRemove = Math.min(STATE.totalAddedSeconds, TIME_COST.rain);
    STATE.totalAddedSeconds -= rainRemove;
    STATE.addedRain = Math.max(0, STATE.addedRain - rainRemove);
  }

  const btn = document.getElementById('rain-toggle-btn');
  const headerPill = document.getElementById('rain-pill-header');
  if (btn) {
    btn.textContent = STATE.isRain ? 'ON' : 'OFF';
    btn.className = `toggle-btn ${STATE.isRain ? 'on' : 'off'}`;
  }
  const rainBtn = document.getElementById('btn-rain');
  if (rainBtn) {
    rainBtn.style.background = STATE.isRain ? 'rgba(6,182,212,0.3)' : '';
    rainBtn.textContent = STATE.isRain ? '🌧 RAIN: ON' : '🌧 RAIN TOGGLE';
  }
  updateTimePrediction();
}

function toggleDew() {
  STATE.isDew = !STATE.isDew;
  const btn = document.getElementById('dew-toggle-btn');
  if (btn) {
    btn.textContent = STATE.isDew ? 'ON' : 'OFF';
    btn.className = `toggle-btn ${STATE.isDew ? 'on' : 'off'}`;
  }
  const dewBtn = document.getElementById('btn-dew');
  if (dewBtn) {
    dewBtn.style.background = STATE.isDew ? 'rgba(59,130,246,0.3)' : '';
    dewBtn.textContent = STATE.isDew ? '💧 DEW: ON' : '💧 DEW TOGGLE';
  }
  updateTimePrediction();
}

// ============================================================
// INNINGS BREAK
// ============================================================
function showInningsBreak() {
  const overlay = document.createElement('div');
  overlay.className = 'innings-overlay';
  overlay.id = 'innings-overlay';
  overlay.innerHTML = `
    <div class="innings-dialog">
      <h2>🔔 INNINGS BREAK</h2>
      <p>End of ${STATE.innings === 1 ? 'First' : 'Second'} Innings<br/>
      Score: <strong style="color:var(--accent-green)">${STATE.runs}/${STATE.wickets}</strong> in ${getOversDisplay()} overs</p>
      <p style="color:var(--accent-yellow);">+10 min delay added</p>
      <button onclick="closeInningsBreak()">START SECOND INNINGS</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeInningsBreak() {
  const overlay = document.getElementById('innings-overlay');
  if (overlay) overlay.remove();
  STATE.innings = 2;
  // Reset batting
  STATE.target = STATE.runs + 1;
  document.getElementById('target-input').value = STATE.target;
  STATE.runs = 0; STATE.wickets = 0; STATE.legalBalls = 0; STATE.totalBalls = 0;
  STATE.extras = 0; STATE.wides = 0; STATE.noBalls = 0; STATE.byes = 0; STATE.legByes = 0;
  STATE.fours = 0; STATE.sixes = 0;
  STATE.thisOverBalls = []; STATE.prevOverBalls = [];
  STATE.partnershipRuns = 0; STATE.partnershipBalls = 0;

  // Reset players
  STATE.striker = { name: 'Opener 1', runs: 0, balls: 0, fours: 0, sixes: 0, initials: 'O1' };
  STATE.nonStriker = { name: 'Opener 2', runs: 0, balls: 0, fours: 0, sixes: 0, initials: 'O2' };
  STATE.bowler = { name: STATE.bowler.name, overs: 0, legalBalls: 0, runs: 0, wickets: 0, wides: 0, nb: 0, initials: STATE.bowler.initials };
  STATE.oversCompleted = 0;
  STATE.dismissals = [];
  STATE.bowlerList = [];
  STATE.overRunRates = [];
  STATE.overRunsPerOver = [];

  updateAllUI();
}

// ============================================================
// UNDO
// ============================================================
function undoLast() {
  if (STATE.undoStack.length === 0) return;
  const prev = STATE.undoStack.pop();
  Object.assign(STATE, prev);
  updateAllUI();
  updateCharts();
  updateHistoryUI();
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const content = document.getElementById(`tab-${tab}`);
  const btn = document.getElementById(`nav-${tab}`);
  if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tab === 'analytics' || tab === 'scorecard') {
    updateScorecardUI();
    updateAnalytics();
    updateCharts();
  }
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const timeStr = `${h}:${String(m).padStart(2, '0')} ${period}`;
  setText('current-time-display', timeStr);
}

// ============================================================
// ELAPSED TIMER
// ============================================================
function startElapsedTimer() {
  STATE.matchStartTime = new Date();
  setInterval(() => {
    const now = new Date();
    const elapsedMs = now - STATE.matchStartTime;
    const tSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(tSec / 60);
    const s = tSec % 60;
    setText('qs-time-elapsed', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
  }, 1000);
}

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveToLocalStorage() {
  try {
    const snapshot = {
      runs: STATE.runs, wickets: STATE.wickets,
      legalBalls: STATE.legalBalls, totalBalls: STATE.totalBalls,
      extras: STATE.extras, fours: STATE.fours, sixes: STATE.sixes,
      totalAddedSeconds: STATE.totalAddedSeconds,
      totalReducedSeconds: STATE.totalReducedSeconds,
      eventHistory: STATE.eventHistory.slice(0, 50),
    };
    localStorage.setItem('cricket_state', JSON.stringify(snapshot));
  } catch (e) { /* ignore */ }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('cricket_state');
    if (saved) {
      // Don't auto-restore full state to avoid confusion on fresh load
      // Just keep it for saved matches
    }
  } catch (e) { /* ignore */ }
}

function saveMatch() {
  try {
    const matches = JSON.parse(localStorage.getItem('cricket_saved_matches') || '[]');
    const match = {
      id: Date.now(),
      teamA: STATE.teamA,
      teamB: STATE.teamB,
      score: `${STATE.runs}/${STATE.wickets}`,
      overs: getOversDisplay(),
      date: new Date().toLocaleDateString(),
      target: STATE.target,
    };
    matches.unshift(match);
    if (matches.length > 10) matches.pop();
    localStorage.setItem('cricket_saved_matches', JSON.stringify(matches));
    loadSavedMatches();
    alert('Match saved!');
  } catch (e) { /* ignore */ }
}

function loadSavedMatches() {
  try {
    const matches = JSON.parse(localStorage.getItem('cricket_saved_matches') || '[]');
    const container = document.getElementById('saved-matches-list');
    if (!container) return;
    if (matches.length === 0) {
      container.innerHTML = '<div class="empty-history">No saved matches.</div>';
      return;
    }
    container.innerHTML = matches.map(m => `
      <div class="saved-match-item">
        <div>
          <div class="sm-title">${m.teamA} vs ${m.teamB}</div>
          <div>${m.score} (${m.overs} ov) | ${m.date}</div>
        </div>
        <button onclick="deleteSavedMatch(${m.id})">Delete</button>
      </div>
    `).join('');
  } catch (e) { /* ignore */ }
}

function deleteSavedMatch(id) {
  try {
    let matches = JSON.parse(localStorage.getItem('cricket_saved_matches') || '[]');
    matches = matches.filter(m => m.id !== id);
    localStorage.setItem('cricket_saved_matches', JSON.stringify(matches));
    loadSavedMatches();
  } catch (e) { /* ignore */ }
}

function resetMatch() {
  if (!confirm('Reset the match? All data will be cleared.')) return;
  location.reload();
}

// ============================================================
// UTILITY
// ============================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setTextClass(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `factor-val ${cls}`;
}

function setStyleProp(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
