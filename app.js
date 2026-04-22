/* ================================================================
   CRICKET MATCH TIME PREDICTOR – FULL LOGIC
   ================================================================ */

'use strict';

// ============================================================
// CSK vs RCB – PLAYER ROSTERS
// ============================================================
const CSK_BATTING_ORDER = [
  { name: 'Ruturaj Gaikwad (c)', initials: 'RG' },
  { name: 'Urvil Patel',         initials: 'UP' },
  { name: 'Matthew Short',       initials: 'MS' },
  { name: 'Sarfaraz Khan',       initials: 'SK' },
  { name: 'Dewald Brevis',       initials: 'DB' },
  { name: 'Sanju Samson (wk)',   initials: 'SS' },
  { name: 'Shivam Dube',         initials: 'SD' },
  { name: 'Jamie Overton',       initials: 'JO' },
  { name: 'Anshul Kamboj',       initials: 'AK' },
  { name: 'Mukesh Choudhary',    initials: 'MC' },
  { name: 'Noor Ahmad',          initials: 'NA' },
];

const RCB_BOWLING_ORDER = [
  { name: 'Josh Hazlewood',    initials: 'JH' },
  { name: 'Bhuvneshwar Kumar', initials: 'BK' },
  { name: 'Rasikh Salam Dar',  initials: 'RS' },
  { name: 'Krunal Pandya',     initials: 'KP' },
  { name: 'Romario Shepherd',  initials: 'RO' },
];

const RCB_BATTING_ORDER = [
  { name: 'Phil Salt (wk)',    initials: 'PS' },
  { name: 'Virat Kohli',      initials: 'VK' },
  { name: 'Devdutt Padikkal', initials: 'DP' },
  { name: 'Rajat Patidar (c)',initials: 'RP' },
  { name: 'Tim David',        initials: 'TD' },
  { name: 'Jitesh Sharma (wk)',initials:'JS' },
  { name: 'Romario Shepherd', initials: 'RO' },
  { name: 'Krunal Pandya',    initials: 'KP' },
  { name: 'Bhuvneshwar Kumar',initials: 'BK' },
  { name: 'Josh Hazlewood',   initials: 'JH' },
  { name: 'Rasikh Salam Dar', initials: 'RS' },
];

let cskBatterIndex = 2; // next batter to come in after first 2 openers dismissed
let rcbBowlerIndex = 1; // next bowler to rotate to (Hazlewood is current=0)

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

  // Selection modal flags
  pendingBatterSelection: false,
  pendingBowlerSelection: false,

  // Real-time delay tracking
  wicketTimestamp: null,
  overCompleteTimestamp: null,

  // OpenAI
  openaiKey: '',
  aiPrediction: null,
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
  preSimulateCSKvsRCB();   // ← pre-load demo match
  initBaseTime();
  initCharts();
  updateAllUI();
  updateCharts();
  updateHistoryUI();
  updateScorecardUI();
  startClock();
  loadSavedMatches();
  startElapsedTimer();
  initSettings();
});

// ============================================================
// PRE-SIMULATE: CSK vs RCB (Demo state for judges)
// CSK batting, 8.4 overs done – mid-innings snapshot
// ============================================================
function preSimulateCSKvsRCB() {
  // Team names
  STATE.teamA   = 'CSK';
  STATE.teamB   = 'RCB';
  STATE.target  = 0;   // CSK batting first, no target yet
  STATE.innings = 1;
  STATE.totalOvers = 20;

  // Score state – 8.4 overs (52 legal balls)
  STATE.runs        = 78;
  STATE.wickets     = 2;
  STATE.legalBalls  = 52;
  STATE.totalBalls  = 56; // 52 legal + 4 extras (3 wide, 1 NB)
  STATE.extras      = 4;
  STATE.wides       = 3;
  STATE.noBalls     = 1;
  STATE.byes        = 0;
  STATE.legByes     = 0;
  STATE.fours       = 6;
  STATE.sixes       = 3;

  // Partnership – Matthew Short & Sarfaraz Khan (ongoing)
  STATE.partnershipRuns  = 38;
  STATE.partnershipBalls = 26;

  // ── CURRENT BATTERS ──────────────────────────────────────
  STATE.striker    = { name: 'Matthew Short',   runs: 33, balls: 19, fours: 4, sixes: 2, initials: 'MS' };
  STATE.nonStriker = { name: 'Sarfaraz Khan',   runs: 5,  balls: 7,  fours: 0, sixes: 0, initials: 'SK' };
  cskBatterIndex   = 4;  // next in: Dewald Brevis

  // ── CURRENT BOWLER ──────────────────────────────────────
  STATE.bowler = { name: 'Josh Hazlewood', overs: 2, legalBalls: 16, runs: 24, wickets: 1, wides: 1, nb: 0, initials: 'JH' };
  rcbBowlerIndex   = 1;  // next: Bhuvneshwar Kumar

  // ── DISMISSALS (scorecard) ───────────────────────────────
  STATE.dismissals = [
    {
      name: 'Ruturaj Gaikwad (c)', runs: 32, balls: 21,
      fours: 4, sixes: 1, sr: '152.4',
      mode: 'caught Kohli', bowler: 'Josh Hazlewood',
    },
    {
      name: 'Urvil Patel', runs: 3, balls: 5,
      fours: 0, sixes: 0, sr: '60.0',
      mode: 'bowled', bowler: 'Bhuvneshwar Kumar',
    },
  ];

  // ── BOWLER LIST (scorecard) ──────────────────────────────
  STATE.bowlerList = [
    { name: 'Josh Hazlewood',    overs: 16, runs: 24, wickets: 1 },
    { name: 'Bhuvneshwar Kumar', overs: 12, runs: 15, wickets: 1 },
    { name: 'Rasikh Salam Dar',  overs: 12, runs: 18, wickets: 0 },
    { name: 'Krunal Pandya',     overs:  6, runs: 12, wickets: 0 },
    { name: 'Romario Shepherd',  overs:  6, runs:  9, wickets: 0 },
  ];

  // ── OVER HISTORY (8 completed overs) ────────────────────
  const overRuns = [8, 7, 12, 6, 9, 11, 8, 8]; // 8 overs → 69 runs
  STATE.overRunsPerOver = [...overRuns];
  let cumRuns = 0;
  STATE.overRunRates = overRuns.map((r, i) => {
    cumRuns += r;
    return { over: i + 1, rr: parseFloat((cumRuns / (i + 1)).toFixed(2)) };
  });
  STATE.oversCompleted = 8;

  // ── CURRENT OVER BALLS (over 9: 4 balls played) ─────────
  STATE.thisOverBalls = [
    { display: '4',  class: 'four'  },
    { display: '1',  class: 'run-1' },
    { display: 'WD', class: 'wide'  },
    { display: '0',  class: 'dot'   },
  ];
  // This over: 4+1+0 = 5 runs (wide doesn't count for legal)

  // ── PREVIOUS OVER BALLS (over 8) ────────────────────────
  STATE.prevOverBalls = [
    { display: '1',  class: 'run-1' },
    { display: '6',  class: 'six'   },
    { display: '0',  class: 'dot'   },
    { display: '0',  class: 'dot'   },
    { display: '1',  class: 'run-1' },
    { display: '0',  class: 'dot'   },
  ];

  // ── TIME ADJUSTMENTS (pre-simulated over 8+ overs) ──────
  STATE.totalAddedSeconds   = 318;
  STATE.totalReducedSeconds = 76;
  STATE.addedWides    = 42;  // 3 × 14
  STATE.addedNB       = 16;  // 1 × 16
  STATE.addedDRS      = 120; // 1 DRS review
  STATE.addedWickets  = 75;  // caught(40) + bowled(35)
  STATE.addedOvers    = 60;  // partial over completes
  STATE.addedRain     = 0;
  STATE.addedOther    = 5;
  STATE.reducedBoundaries = 9;  // 6×1 + 3×1
  STATE.reducedSixes      = 3;
  STATE.reducedFast       = 50; // 5 fast overs × 10
  STATE.reducedDew        = 0;
  STATE.reducedOther      = 14;

  // ── TIME SHIFT HISTORY (for timeline chart) ──────────────
  STATE.timeShiftHistory = [
    { added:9,   reduced:0,  net:9,   event:'1',            over:0.1 },
    { added:12,  reduced:1,  net:11,  event:'4',            over:0.2 },
    { added:8,   reduced:0,  net:8,   event:'dot',          over:0.3 },
    { added:14,  reduced:0,  net:14,  event:'wide',         over:0.4 },
    { added:9,   reduced:0,  net:9,   event:'1',            over:1.1 },
    { added:40,  reduced:0,  net:40,  event:'caught',       over:2.1 },
    { added:120, reduced:0,  net:120, event:'drs',          over:3.2 },
    { added:15,  reduced:1,  net:14,  event:'6',            over:3.4 },
    { added:35,  reduced:0,  net:35,  event:'bowled',       over:4.3 },
    { added:30,  reduced:10, net:20,  event:'over-complete',over:5.0 },
    { added:12,  reduced:1,  net:11,  event:'4',            over:6.2 },
    { added:15,  reduced:1,  net:14,  event:'6',            over:7.1 },
    { added:30,  reduced:10, net:20,  event:'over-complete',over:8.0 },
    { added:12,  reduced:1,  net:11,  event:'4',            over:8.1 },
    { added:9,   reduced:0,  net:9,   event:'1',            over:8.2 },
    { added:14,  reduced:0,  net:14,  event:'wide',         over:8.3 },
    { added:8,   reduced:0,  net:8,   event:'dot',          over:8.4 },
  ];

  // ── EVENT HISTORY (recent, shown in History tab) ─────────
  STATE.eventHistory = [
    { type:'dot',          ballDisplay:'0',   ballClass:'dot',    score:'78/2', overs:'8.4', timeShift:8,  timestamp:'7:52 PM' },
    { type:'wide',         ballDisplay:'WD',  ballClass:'wide',   score:'78/2', overs:'8.3', timeShift:14, timestamp:'7:51 PM' },
    { type:'1',            ballDisplay:'1',   ballClass:'run-1',  score:'77/2', overs:'8.2', timeShift:9,  timestamp:'7:51 PM' },
    { type:'4',            ballDisplay:'4',   ballClass:'four',   score:'76/2', overs:'8.1', timeShift:11, timestamp:'7:50 PM' },
    { type:'over-complete',ballDisplay:'',    ballClass:'',       score:'72/2', overs:'8.0', timeShift:20, timestamp:'7:49 PM' },
    { type:'dot',          ballDisplay:'0',   ballClass:'dot',    score:'72/2', overs:'7.6', timeShift:8,  timestamp:'7:49 PM' },
    { type:'1',            ballDisplay:'1',   ballClass:'run-1',  score:'72/2', overs:'7.5', timeShift:9,  timestamp:'7:48 PM' },
    { type:'dot',          ballDisplay:'0',   ballClass:'dot',    score:'71/2', overs:'7.4', timeShift:8,  timestamp:'7:48 PM' },
    { type:'dot',          ballDisplay:'0',   ballClass:'dot',    score:'71/2', overs:'7.3', timeShift:8,  timestamp:'7:47 PM' },
    { type:'6',            ballDisplay:'6',   ballClass:'six',    score:'71/2', overs:'7.2', timeShift:14, timestamp:'7:47 PM' },
    { type:'1',            ballDisplay:'1',   ballClass:'run-1',  score:'65/2', overs:'7.1', timeShift:9,  timestamp:'7:46 PM' },
    { type:'over-complete',ballDisplay:'',    ballClass:'',       score:'64/2', overs:'7.0', timeShift:20, timestamp:'7:46 PM' },
    { type:'4',            ballDisplay:'4',   ballClass:'four',   score:'64/2', overs:'6.6', timeShift:11, timestamp:'7:45 PM' },
    { type:'6',            ballDisplay:'6',   ballClass:'six',    score:'60/2', overs:'6.5', timeShift:14, timestamp:'7:44 PM' },
    { type:'bowled',       ballDisplay:'W',   ballClass:'wicket', score:'54/2', overs:'4.3', timeShift:35, timestamp:'7:35 PM' },
    { type:'caught',       ballDisplay:'W',   ballClass:'wicket', score:'38/1', overs:'2.1', timeShift:40, timestamp:'7:25 PM' },
    { type:'drs',          ballDisplay:'DRS', ballClass:'noball', score:'34/0', overs:'3.2', timeShift:120,timestamp:'7:28 PM' },
  ];
}

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
  // Sync input fields to pre-simulated CSK vs RCB state
  const taInput  = document.getElementById('team-a-input');
  const tbInput  = document.getElementById('team-b-input');
  const tgtInput = document.getElementById('target-input');
  const strInput = document.getElementById('striker-name-input');
  const nsInput  = document.getElementById('nonstriker-name-input');
  const bwInput  = document.getElementById('bowler-name-input');
  if (taInput)  taInput.value  = 'CSK';
  if (tbInput)  tbInput.value  = 'RCB';
  if (tgtInput) tgtInput.value = '0';
  if (strInput) strInput.value = STATE.striker.name;
  if (nsInput)  nsInput.value  = STATE.nonStriker.name;
  if (bwInput)  bwInput.value  = STATE.bowler.name;
  updateTeamNames();
  updatePlayers();
}

function setState_BowlerNameInputs() {
  const bwInput = document.getElementById('bowler-name-input');
  if (bwInput) bwInput.value = STATE.bowler.name;
  updatePlayerUI();
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
      STATE.wicketTimestamp = Date.now();   // ⏱ start timing batter change
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket';
      setTimeout(function() { checkAllOut(); }, 400);
      break;

    case 'caught':
      STATE.wickets++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      STATE.bowler.wickets++;
      STATE.addedWickets += addedSec;
      recordDismissal(STATE.striker, 'caught', STATE.bowler.name);
      STATE.wicketTimestamp = Date.now();
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket';
      setTimeout(function() { checkAllOut(); }, 400);
      break;

    case 'runout':
      STATE.wickets++;
      STATE.legalBalls++; STATE.totalBalls++;
      STATE.striker.balls++;
      STATE.partnershipBalls++;
      STATE.addedWickets += addedSec;
      recordDismissal(STATE.striker, 'run out', '(run out)');
      STATE.wicketTimestamp = Date.now();
      resetStriker();
      ballDisplay = 'W'; ballClass = 'wicket';
      setTimeout(function() { checkAllOut(); }, 400);
      break;

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
    case 'freehit':
      STATE.addedOther += addedSec;
      isLegal = false; break;

    case 'bowler-change':
      // Cycle to next RCB bowler
      const bowlerRoster = STATE.innings === 1 ? RCB_BOWLING_ORDER : CSK_BATTING_ORDER.slice(7); // tail = bowl
      const nextBowler   = bowlerRoster[rcbBowlerIndex % bowlerRoster.length];
      rcbBowlerIndex++;
      // Save current bowler stats to list before switching
      updateBowlerList();
      STATE.bowler = {
        name: nextBowler.name,
        initials: nextBowler.initials,
        overs: 0, legalBalls: 0, runs: 0, wickets: 0, wides: 0, nb: 0,
      };
      setState_BowlerNameInputs();
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
// BATTER SELECTION MODAL
// ============================================================
function showBatterModal() {
  const dismissedNames = new Set(STATE.dismissals.map(d => d.name));
  const roster = STATE.innings === 1 ? CSK_BATTING_ORDER : RCB_BATTING_ORDER;
  const occupied = new Set([STATE.striker.name, STATE.nonStriker.name]);

  const remaining = roster.filter(b =>
    !dismissedNames.has(b.name) && !occupied.has(b.name)
  );

  const listEl = document.getElementById('batter-list');
  if (!listEl) return;

  if (remaining.length === 0) {
    listEl.innerHTML = '<div class="sel-empty">All batters dismissed! Match over.</div>';
  } else {
    listEl.innerHTML = remaining.map((b, idx) => {
      const pos  = roster.indexOf(b) + 1;
      const role = getPlayerRole(b.name);
      const safeN = b.name.replace(/"/g, '&quot;');
      return [
        '<button class="sel-player-btn" onclick="selectBatter(&quot;' + safeN + '&quot;,&quot;' + b.initials + '&quot;)">',
        '  <div class="sel-avatar csk-av">' + b.initials + '</div>',
        '  <div class="sel-player-info">',
        '    <div class="sel-player-name">' + b.name + '</div>',
        '    <div class="sel-player-meta">Batting Pos ' + pos + ' &nbsp;&#183;&nbsp; ' + role + '</div>',
        '  </div>',
        '  <span class="sel-arrow">&#8594;</span>',
        '</button>',
      ].join('');
    }).join('');
  }

  document.getElementById('batter-modal').classList.remove('sel-hidden');
}

function selectBatter(name, initials) {
  // ⏱ Measure real batter-change delay
  var delaySec = 0;
  if (STATE.wicketTimestamp) {
    delaySec = Math.round((Date.now() - STATE.wicketTimestamp) / 1000);
    STATE.wicketTimestamp = null;
    // Clamp to realistic range (5s–120s)
    delaySec = Math.max(5, Math.min(120, delaySec));
    STATE.totalAddedSeconds += delaySec;
    STATE.addedWickets      += delaySec;
    showTimingToast('🏏 ' + name, delaySec, 'Batter change');
  }

  STATE.striker = { name: name, initials: initials, runs: 0, balls: 0, fours: 0, sixes: 0 };
  STATE.partnershipRuns  = 0;
  STATE.partnershipBalls = 0;
  document.getElementById('batter-modal').classList.add('sel-hidden');
  var inp = document.getElementById('striker-name-input');
  if (inp) inp.value = name;
  updatePlayerUI();
  updateQuickStats();
  updateTimePrediction();
}

// ============================================================
// BOWLER SELECTION MODAL
// ============================================================
function showBowlerModal() {
  var nextOverNum = STATE.oversCompleted + 1;
  var overLabel   = document.getElementById('bowler-modal-over');
  if (overLabel) overLabel.textContent = nextOverNum;

  var roster = STATE.innings === 1 ? RCB_BOWLING_ORDER :
    CSK_BATTING_ORDER.filter(function(b) {
      return ['Jamie Overton','Anshul Kamboj','Mukesh Choudhary','Noor Ahmad'].indexOf(b.name) >= 0;
    });

  var maxOvers   = Math.ceil(STATE.totalOvers / 5);
  var lastBowler = STATE.bowler.name;
  var listEl     = document.getElementById('bowler-list');
  if (!listEl) return;

  listEl.innerHTML = roster.map(function(b, i) {
    var stats    = STATE.bowlerList.find(function(bl) { return bl.name === b.name; }) || { overs: 0, runs: 0, wickets: 0 };
    var balls    = stats.overs || 0;
    var oversStr = Math.floor(balls / 6) + '.' + (balls % 6);
    var econ     = balls > 0 ? (stats.runs / (balls / 6)).toFixed(1) : '0.0';
    var bowled   = Math.floor(balls / 6);
    var isMaxed  = bowled >= maxOvers;
    var isCurrent= b.name === lastBowler;
    var dis      = (isMaxed || isCurrent) ? 'disabled' : '';
    var cls      = isMaxed ? 'maxed' : (isCurrent ? 'current-b' : '');
    var badge    = isCurrent ? '<span class="sel-badge curr-badge">Last Bowled</span>' :
                  (isMaxed  ? '<span class="sel-badge max-badge">Quota Full</span>' : '');
    var arrow    = (isMaxed || isCurrent) ? '&#10005;' : '&#8594;';
    return [
      '<button class="sel-player-btn ' + cls + '" ' + dis + ' onclick="selectBowler(' + i + ')">',
      '  <div class="sel-avatar rcb-av">' + b.initials + '</div>',
      '  <div class="sel-player-info">',
      '    <div class="sel-player-name">' + b.name + ' ' + badge + '</div>',
      '    <div class="sel-player-meta">' + oversStr + ' ov &nbsp;&#183;&nbsp; ' + stats.runs + ' runs &nbsp;&#183;&nbsp; ' + stats.wickets + ' wkts &nbsp;&#183;&nbsp; Econ ' + econ + '</div>',
      '  </div>',
      '  <span class="sel-arrow">' + arrow + '</span>',
      '</button>',
    ].join('');
  }).join('');

  document.getElementById('bowler-modal').classList.remove('sel-hidden');
}

function selectBowler(index) {
  var roster = STATE.innings === 1 ? RCB_BOWLING_ORDER :
    CSK_BATTING_ORDER.filter(function(b) {
      return ['Jamie Overton','Anshul Kamboj','Mukesh Choudhary','Noor Ahmad'].indexOf(b.name) >= 0;
    });
  var chosen = roster[index];
  if (!chosen) return;

  // ⏱ Measure real bowler-change delay
  if (STATE.overCompleteTimestamp) {
    var delaySec = Math.round((Date.now() - STATE.overCompleteTimestamp) / 1000);
    STATE.overCompleteTimestamp = null;
    delaySec = Math.max(10, Math.min(180, delaySec));
    STATE.totalAddedSeconds += delaySec;
    STATE.addedOvers        += delaySec;
    showTimingToast('🎳 ' + chosen.name, delaySec, 'Bowler change');
  }

  var existingStats = STATE.bowlerList.find(function(b) { return b.name === chosen.name; });
  STATE.bowler = {
    name:       chosen.name,
    initials:   chosen.initials,
    legalBalls: existingStats ? existingStats.overs   : 0,
    runs:       existingStats ? existingStats.runs    : 0,
    wickets:    existingStats ? existingStats.wickets : 0,
    wides: 0, nb: 0,
    overs: existingStats ? (Math.floor(existingStats.overs / 6) + (existingStats.overs % 6) / 10) : 0,
  };

  document.getElementById('bowler-modal').classList.add('sel-hidden');
  var inp = document.getElementById('bowler-name-input');
  if (inp) inp.value = chosen.name;
  updatePlayerUI();
  updateScorecardUI();
  updateTimePrediction();
}

function getPlayerRole(name) {
  var wks = ['Sanju Samson (wk)','Phil Salt (wk)','Jitesh Sharma (wk)'];
  var ars  = ['Shivam Dube','Jamie Overton','Krunal Pandya','Romario Shepherd'];
  var bwls = RCB_BOWLING_ORDER.map(function(b){ return b.name; });
  if (wks.indexOf(name)  >= 0) return 'Wicket-Keeper';
  if (ars.indexOf(name)  >= 0) return 'All-Rounder';
  if (bwls.indexOf(name) >= 0) return 'Bowler';
  return 'Batsman';
}

// ============================================================
// TIMING TOAST  — shows how long player change took
// ============================================================
function showTimingToast(player, seconds, label) {
  var color   = seconds <= 30 ? '#00d68f' : seconds <= 60 ? '#f59e0b' : '#ff4d6d';
  var icon    = seconds <= 30 ? '⚡' : seconds <= 60 ? '⏱' : '🐢';
  var el      = document.createElement('div');
  el.className = 'timing-toast';
  el.innerHTML =
    '<div class="tt-row">' +
      '<span class="tt-icon">' + icon + '</span>' +
      '<span class="tt-label">' + label + '</span>' +
      '<span class="tt-sec" style="color:' + color + ';">+' + seconds + 's</span>' +
    '</div>' +
    '<div class="tt-player">' + player + '</div>' +
    '<div class="tt-bar-wrap"><div class="tt-bar" style="background:' + color + ';"></div></div>';
  document.body.appendChild(el);
  setTimeout(function() { el.classList.add('tt-show'); }, 50);
  setTimeout(function() {
    el.classList.remove('tt-show');
    setTimeout(function() { el.remove(); }, 400);
  }, 5000);
}

// ============================================================
// OPENAI API INTEGRATION
// ============================================================
function buildMatchPrompt() {
  var crr    = STATE.legalBalls > 0 ? (STATE.runs / (STATE.legalBalls / 6)).toFixed(2) : '0.00';
  var remain = (STATE.totalOvers * 6) - STATE.legalBalls;
  var target = STATE.target > 0 ? 'Target: ' + STATE.target + ', RRR: ' + (remain > 0 ? ((STATE.target - STATE.runs) / (remain / 6)).toFixed(2) : 'N/A') : 'First innings';
  var netSec = STATE.totalAddedSeconds - STATE.totalReducedSeconds;

  return 'You are an expert T20 cricket match-time analyst. Given the LIVE match data below, ' +
    'predict the exact time the match will end, accounting for realistic event delays.\n\n' +
    'MATCH: ' + STATE.teamA + ' vs ' + STATE.teamB + ' (T20, ' + STATE.totalOvers + ' overs)\n' +
    'INNINGS: ' + (STATE.innings === 1 ? '1st' : '2nd') + '\n' +
    'SCORE: ' + STATE.runs + '/' + STATE.wickets + ' in ' + getOversDisplay() + ' overs\n' +
    'CRR: ' + crr + ' | ' + target + '\n' +
    'STRIKER: ' + STATE.striker.name + ' — ' + STATE.striker.runs + '* off ' + STATE.striker.balls + '\n' +
    'BOWLER: ' + STATE.bowler.name + ' — ' + Math.floor(STATE.bowler.legalBalls/6) + '.' + (STATE.bowler.legalBalls%6) + ' ov, ' + STATE.bowler.runs + 'r, ' + STATE.bowler.wickets + 'w\n' +
    'EXTRAS: ' + STATE.extras + ' (WD:' + STATE.wides + ' NB:' + STATE.noBalls + ')\n' +
    'BOUNDARIES: ' + STATE.fours + ' fours, ' + STATE.sixes + ' sixes\n' +
    'DRS REVIEWS USED: ' + STATE.drsCount + '\n' +
    'TIME DELAYS ACCUMULATED: +' + STATE.totalAddedSeconds + 's added, -' + STATE.totalReducedSeconds + 's reduced (net: ' + netSec + 's)\n' +
    'MATCH START: ' + formatTimeFromMinutes(STATE.baseTimeMinutes) + '\n' +
    'DEW FACTOR: ' + (STATE.isDew ? 'YES' : 'NO') + '\n\n' +
    'Using T20 match pacing data (avg 25s per legal delivery), project event frequency ' +
    'for remaining ' + remain + ' balls and return ONLY this JSON:\n' +
    '{"endTime":"HH:MM AM/PM","confidence":85,"delayBreakdown":{"wides":30,"wickets":60,"overChanges":90,"drs":0},' +
    '"reasoning":"2-sentence explanation","pace":"X.X seconds per ball"}';
}

function formatTimeFromMinutes(totalMin) {
  var h = Math.floor(totalMin / 60) % 24;
  var m = totalMin % 60;
  var p = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + String(m).padStart(2,'0') + ' ' + p;
}

function getAIPrediction() {
  var btn = document.getElementById('ai-predict-btn');
  if (btn) { btn.textContent = '🤖 Thinking…'; btn.disabled = true; }

  var prompt = buildMatchPrompt();

  // Calls our Node.js proxy server — key is read from Render env var server-side
  fetch('/api/ai-predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.2,
    }),
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (btn) { btn.textContent = '🤖 AI Predict'; btn.disabled = false; }
    if (data.error) { showCustomAlert('AI Error', data.error.message, '🤖'); return; }
    try {
      var text = data.choices[0].message.content.trim();
      var json = JSON.parse(text.replace(/```json|```/g, '').trim());
      showAIInsightPanel(json);
      STATE.aiPrediction = json;
      var el = document.getElementById('predicted-time-big');
      if (el) {
        el.textContent = json.endTime;
        el.style.color = '#a78bfa';
        el.title = 'AI Predicted: ' + json.reasoning;
      }
    } catch(e) {
      showCustomAlert('Parse Error', 'Could not parse AI response: ' + (data.choices && data.choices[0] ? data.choices[0].message.content : 'empty'), '❌');
    }
  })
  .catch(function(e) {
    if (btn) { btn.textContent = '🤖 AI Predict'; btn.disabled = false; }
    showCustomAlert('Network Error', e.message, '🔌');
  });
}

function showAIInsightPanel(json) {
  var existing = document.getElementById('ai-insight-panel');
  if (existing) existing.remove();

  var conf    = json.confidence || 0;
  var confClr = conf >= 80 ? '#00d68f' : conf >= 60 ? '#f59e0b' : '#ff4d6d';
  var bd      = json.delayBreakdown || {};

  var html = '<div id="ai-insight-panel" class="ai-panel">' +
    '<div class="ai-panel-header">' +
    '<span class="ai-icon">🤖</span>' +
    '<span>AI MATCH PREDICTION — GPT-4o-mini</span>' +
    '<button onclick="document.getElementById(\'ai-insight-panel\').remove()" class="ai-close">✕</button>' +
    '</div>' +
    '<div class="ai-end-time">' + (json.endTime || '—') + '</div>' +
    '<div class="ai-conf-row">' +
    '<span class="ai-conf-label">CONFIDENCE</span>' +
    '<span class="ai-conf-val" style="color:' + confClr + ';">' + conf + '%</span>' +
    '</div>' +
    '<div class="ai-breakdown">' +
    '<div class="ai-bd-row"><span>Wides delay</span><span>+' + (bd.wides||0) + 's</span></div>' +
    '<div class="ai-bd-row"><span>Wickets delay</span><span>+' + (bd.wickets||0) + 's</span></div>' +
    '<div class="ai-bd-row"><span>Over changes</span><span>+' + (bd.overChanges||0) + 's</span></div>' +
    '<div class="ai-bd-row"><span>DRS delay</span><span>+' + (bd.drs||0) + 's</span></div>' +
    '</div>' +
    '<div class="ai-reasoning">' + (json.reasoning || '') + '</div>' +
    '<div class="ai-pace">⚡ Pace: ' + (json.pace || '—') + ' per ball</div>' +
    '</div>';

  document.getElementById('time-prediction-card').insertAdjacentHTML('afterend', html);
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

  // Add bowler to list
  updateBowlerList();

  // Record timestamp for bowler selection delay tracking
  STATE.overCompleteTimestamp = Date.now();

  // Show bowler selector modal after a short delay
  setTimeout(() => showBowlerModal(), 350);
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
  // Temporary placeholder shown while judge picks batter
  STATE.striker = { name: '— Incoming —', initials: '?', runs: 0, balls: 0, fours: 0, sixes: 0 };
  // Show batter picker modal
  setTimeout(() => showBatterModal(), 350);
}

// ============================================================
// TIME PREDICTION ENGINE  —  Physics-based multi-factor model
// ============================================================
function computePredictedTime() {
  var totalBallsInMatch = STATE.totalOvers * 6;          // 120 for T20
  var ballsPlayed       = STATE.legalBalls;              // legal deliveries so far
  var ballsRemaining    = totalBallsInMatch - ballsPlayed;

  // ── 1. ACTUAL SECONDS ELAPSED PER LEGAL BALL ─────────────────
  // Historical T20 average: ~25 seconds per legal delivery
  // We observe actual pace from accumulated time adjustments
  var baseSecsPerBall   = 25;    // industry benchmark
  var observedAdditions = STATE.totalAddedSeconds - STATE.totalReducedSeconds;
  // Adjust pace estimate if we have enough data
  var observedSecsPerBall = baseSecsPerBall;
  if (ballsPlayed > 12) {
    // Total time elapsed ≈ ballsPlayed * baseSecsPerBall + net adjustments
    var estimatedElapsed = (ballsPlayed * baseSecsPerBall) + observedAdditions;
    observedSecsPerBall  = estimatedElapsed / ballsPlayed;
    // Clamp to sane range [18, 40] seconds/ball
    observedSecsPerBall  = Math.max(18, Math.min(40, observedSecsPerBall));
  }

  // ── 2. PROJECTED REMAINING TIME FOR BALLS NOT YET BOWLED ───────
  var projectedRemainingSeconds = ballsRemaining * observedSecsPerBall;

  // ── 3. PROJECTED FUTURE EVENT DELAYS ────────────────────
  // Estimate how many wides / wickets / overs remain based on current rates
  var oversRemaining    = Math.ceil(ballsRemaining / 6);
  var totalBalls_done   = STATE.totalBalls || 1;
  var wideRate          = STATE.wides   / totalBalls_done;   // wides per delivery
  var wicketRate        = STATE.wickets / Math.max(1, ballsPlayed); // wickets per ball

  var projectedWides   = wideRate   * ballsRemaining;
  var projectedWickets = Math.min(10 - STATE.wickets, wicketRate * ballsRemaining);

  var futureWideDelay    = projectedWides   * TIME_COST.wide;
  var futureWicketDelay  = projectedWickets * TIME_COST.caught; // caught avg
  var futureOverDelay    = oversRemaining   * TIME_COST['over-complete'];
  var futureDRSDelay     = (STATE.drsCount > 0 ? 1 : 0) * TIME_COST.drs; // ~1 more DRS expected

  var projectedFutureDelay = futureWideDelay + futureWicketDelay + futureOverDelay + futureDRSDelay;

  // ── 4. COMBINE: already-happened net + projected future ───────
  var netPastSeconds   = STATE.totalAddedSeconds - STATE.totalReducedSeconds;
  var matchStartMin    = STATE.baseTimeMinutes;
  // Total time from start to end = balls already played + remaining + adjustments
  var totalMatchSeconds = (ballsPlayed * observedSecsPerBall)
                        + projectedRemainingSeconds
                        + projectedFutureDelay
                        + Math.max(0, netPastSeconds);

  var predictedMin     = matchStartMin + (totalMatchSeconds / 60);

  // ── 5. FORMAT TIMES ────────────────────────────────
  var hours   = Math.floor(predictedMin / 60) % 24;
  var mins    = Math.round(predictedMin % 60);
  if (mins >= 60) { hours = (hours + 1) % 24; mins -= 60; }
  var period  = hours >= 12 ? 'PM' : 'AM';
  var h12     = hours % 12 === 0 ? 12 : hours % 12;
  var timeStr = h12 + ':' + String(mins).padStart(2, '0') + ' ' + period;

  // Base end time (no delays, pure ball-rate)
  var baseEndSec = (totalBallsInMatch * baseSecsPerBall);
  var baseEndMin = matchStartMin + (baseEndSec / 60);
  var bH  = Math.floor(baseEndMin / 60) % 24;
  var bM  = Math.round(baseEndMin % 60);
  if (bM >= 60) { bH = (bH + 1) % 24; bM -= 60; }
  var bPer= bH >= 12 ? 'PM' : 'AM';
  var bH12= bH % 12 === 0 ? 12 : bH % 12;
  var baseStr = bH12 + ':' + String(bM).padStart(2, '0') + ' ' + bPer;

  return {
    timeStr, baseStr,
    netSeconds: Math.round(netPastSeconds + projectedFutureDelay),
    observedSecsPerBall: observedSecsPerBall.toFixed(1),
  };
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
// ============================================================
// ALL-OUT DETECTION
// ============================================================
function checkAllOut() {
  // 10 wickets = all out (or user-set max wickets)
  if (STATE.wickets >= 10) {
    // Small delay so the W chip renders first
    setTimeout(() => showAllOutModal(), 600);
  }
}

// ============================================================
// ALL-OUT MODAL  (Step 1 of 3)
// ============================================================
function showAllOutModal() {
  // Build scorecard rows
  var rows = STATE.dismissals.map(function(d) {
    return '<tr>' +
      '<td style="color:var(--text-primary);font-weight:600;">' + d.name + '</td>' +
      '<td style="color:var(--text-muted);font-size:0.7rem;">' + d.mode + ' b ' + d.bowler + '</td>' +
      '<td style="color:var(--accent-green);font-family:Orbitron,monospace;font-weight:700;">' + d.runs + '</td>' +
      '<td style="color:var(--text-secondary);">' + d.balls + '</td>' +
      '<td style="color:var(--text-secondary);">' + d.fours + '</td>' +
      '<td style="color:var(--accent-yellow);">' + d.sixes + '</td>' +
      '<td style="color:var(--text-muted);">' + d.sr + '</td>' +
    '</tr>';
  }).join('');

  var crr = STATE.legalBalls > 0 ? (STATE.runs / (STATE.legalBalls / 6)).toFixed(2) : '0.00';
  var teamName = STATE.innings === 1 ? STATE.teamA : STATE.teamB;
  var chasing  = STATE.innings === 1 ? STATE.teamB : STATE.teamA;

  var html = '<div class="aom-overlay" id="allout-modal">' +
    '<div class="aom-dialog">' +

    // Header
    '<div class="aom-header">' +
    '<div class="aom-wkt-ring">10</div>' +
    '<div>' +
    '<h2 class="aom-title">ALL OUT!</h2>' +
    '<p class="aom-subtitle">' + teamName + ' INNINGS COMPLETE</p>' +
    '</div>' +
    '</div>' +

    // Summary stats
    '<div class="aom-stats-bar">' +
    '<div class="aom-stat"><div class="aom-stat-label">TOTAL</div><div class="aom-stat-val neon-green">' + STATE.runs + '/10</div></div>' +
    '<div class="aom-stat"><div class="aom-stat-label">OVERS</div><div class="aom-stat-val">' + getOversDisplay() + '</div></div>' +
    '<div class="aom-stat"><div class="aom-stat-label">RUN RATE</div><div class="aom-stat-val">' + crr + '</div></div>' +
    '<div class="aom-stat"><div class="aom-stat-label">4s / 6s</div><div class="aom-stat-val">' + STATE.fours + ' / ' + STATE.sixes + '</div></div>' +
    '<div class="aom-stat"><div class="aom-stat-label">EXTRAS</div><div class="aom-stat-val">' + STATE.extras + '</div></div>' +
    '<div class="aom-stat"><div class="aom-stat-label">' + chasing + ' NEED</div><div class="aom-stat-val neon-yellow">' + (STATE.runs + 1) + '</div></div>' +
    '</div>' +

    // Scorecard table
    '<div class="aom-scorecard">' +
    '<table class="scorecard-table" style="font-size:0.72rem;">' +
    '<thead><tr><th>BATTER</th><th>HOW OUT</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '</div>' +

    // Break duration input
    '<div class="aom-break-row">' +
    '<div class="aom-break-label">⏱ SET INNINGS BREAK DURATION</div>' +
    '<div class="aom-break-inputs">' +
    '<button class="aom-preset" onclick="setBreakDuration(10)">10 min</button>' +
    '<button class="aom-preset" onclick="setBreakDuration(15)">15 min</button>' +
    '<button class="aom-preset" onclick="setBreakDuration(20)">20 min</button>' +
    '<button class="aom-preset" onclick="setBreakDuration(30)">30 min</button>' +
    '</div>' +
    '<div class="aom-custom-row">' +
    '<input type="number" id="break-min-input" value="20" min="1" max="60" class="aom-custom-input" /> minutes' +
    '</div>' +
    '</div>' +

    // CTA button
    '<button class="aom-start-btn" onclick="startInningsBreak()">' +
    '🔔 START INNINGS BREAK' +
    '</button>' +

    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function setBreakDuration(mins) {
  var inp = document.getElementById('break-min-input');
  if (inp) inp.value = mins;
  // Highlight selected preset
  document.querySelectorAll('.aom-preset').forEach(function(b) {
    b.classList.toggle('aom-preset-active', parseInt(b.textContent) === mins);
  });
}

// ============================================================
// INNINGS BREAK COUNTDOWN  (Step 2 of 3)
// ============================================================
var breakInterval = null;

function startInningsBreak() {
  var inp = document.getElementById('break-min-input');
  var minutes = parseInt((inp ? inp.value : 20)) || 20;
  var totalSeconds = minutes * 60;

  // Add time cost to prediction engine
  STATE.totalAddedSeconds += totalSeconds;
  STATE.addedRain += totalSeconds;   // reuse rain bucket for break

  // Remove all-out modal
  var aom = document.getElementById('allout-modal');
  if (aom) aom.remove();

  // Show countdown overlay
  var teamA = STATE.teamA, teamB = STATE.teamB;
  var score = STATE.runs + '/' + STATE.wickets;
  var oversDone = getOversDisplay();

  var html = '<div class="brk-overlay" id="break-overlay">' +
    '<div class="brk-content">' +

    // Team logos
    '<div class="brk-teams">' +
    '<div class="brk-team">' +
    '<div class="brk-logo csk-logo">' + teamA + '</div>' +
    '<div class="brk-team-label">BATTING: ' + teamB + '</div>' +
    '</div>' +
    '<div class="brk-vs">VS</div>' +
    '<div class="brk-team">' +
    '<div class="brk-logo rcb-logo">' + teamB + '</div>' +
    '<div class="brk-team-label">BOWLING: ' + teamA + '</div>' +
    '</div>' +
    '</div>' +

    // Score just completed
    '<div class="brk-score-summary">' +
    '<span class="brk-score-label">' + teamA + ' scored</span>' +
    '<span class="brk-score-val">' + score + '</span>' +
    '<span class="brk-score-label">in ' + oversDone + ' overs</span>' +
    '<span class="brk-needs">' + teamB + ' need <strong>' + (STATE.runs + 1) + '</strong> runs to win</span>' +
    '</div>' +

    // Countdown heading
    '<div class="brk-heading">INNINGS BREAK</div>' +
    '<div class="brk-sub">2ND INNINGS STARTS IN</div>' +

    // Big countdown
    '<div class="brk-timer" id="brk-timer">' + formatCountdown(totalSeconds) + '</div>' +

    // Progress bar
    '<div class="brk-progress-wrap"><div class="brk-progress-bar" id="brk-bar"></div></div>' +

    // Skip button
    '<button class="brk-skip-btn" onclick="skipBreak(' + totalSeconds + ')">' +
    '⏭ SKIP BREAK — START 2ND INNINGS NOW' +
    '</button>' +

    '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', html);

  var remaining = totalSeconds;
  var startTime = Date.now();

  breakInterval = setInterval(function() {
    var elapsed   = Math.floor((Date.now() - startTime) / 1000);
    remaining     = Math.max(0, totalSeconds - elapsed);
    var pct       = ((totalSeconds - remaining) / totalSeconds) * 100;

    var timerEl = document.getElementById('brk-timer');
    var barEl   = document.getElementById('brk-bar');
    if (timerEl) timerEl.textContent = formatCountdown(remaining);
    if (barEl)   barEl.style.width   = pct.toFixed(1) + '%';

    if (remaining <= 0) {
      clearInterval(breakInterval);
      startSecondInnings();
    }
  }, 1000);
}

function skipBreak(totalSeconds) {
  if (breakInterval) { clearInterval(breakInterval); breakInterval = null; }
  startSecondInnings();
}

function formatCountdown(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ============================================================
// START 2ND INNINGS  (Step 3 of 3)
// ============================================================
function startSecondInnings() {
  // Remove break overlay
  var brk = document.getElementById('break-overlay');
  if (brk) {
    brk.style.animation = 'selFadeIn 0.3s ease reverse';
    setTimeout(function() { if (brk) brk.remove(); }, 300);
  }

  STATE.innings = 2;
  STATE.target  = STATE.runs + 1;
  var tInp = document.getElementById('target-input');
  if (tInp) tInp.value = STATE.target;

  // Reset batting stats
  STATE.runs = 0; STATE.wickets = 0; STATE.legalBalls = 0; STATE.totalBalls = 0;
  STATE.extras = 0; STATE.wides = 0; STATE.noBalls = 0; STATE.byes = 0; STATE.legByes = 0;
  STATE.fours = 0; STATE.sixes = 0;
  STATE.thisOverBalls = []; STATE.prevOverBalls = [];
  STATE.partnershipRuns = 0; STATE.partnershipBalls = 0;
  STATE.oversCompleted = 0;
  STATE.dismissals = [];
  STATE.bowlerList = [];
  STATE.overRunRates = [];
  STATE.overRunsPerOver = [];
  cskBatterIndex = 0;   // reset batter index for RCB
  rcbBowlerIndex = 0;   // reset bowler index for CSK

  // Set RCB openers
  STATE.striker    = { name: RCB_BATTING_ORDER[0].name, initials: RCB_BATTING_ORDER[0].initials, runs: 0, balls: 0, fours: 0, sixes: 0 };
  STATE.nonStriker = { name: RCB_BATTING_ORDER[1].name, initials: RCB_BATTING_ORDER[1].initials, runs: 0, balls: 0, fours: 0, sixes: 0 };
  cskBatterIndex = 2;   // next incoming RCB batter is index 2

  // Set CSK opening bowler (Jamie Overton / Anshul Kamboj)
  var cskBowlers = CSK_BATTING_ORDER.filter(function(b) {
    return ['Jamie Overton','Anshul Kamboj','Mukesh Choudhary','Noor Ahmad'].indexOf(b.name) >= 0;
  });
  var opener = cskBowlers[0] || { name: 'CSK Bowler', initials: 'CB' };
  STATE.bowler = { name: opener.name, initials: opener.initials, overs: 0, legalBalls: 0, runs: 0, wickets: 0, wides: 0, nb: 0 };
  rcbBowlerIndex = 1;

  // Update target area in header
  var tLabel = document.querySelector('.target-label');
  if (tLabel) tLabel.textContent = 'TARGET';

  // Update team brand hero display
  var taName = document.getElementById('team-a-name');
  var tbName = document.getElementById('team-b-name');
  if (taName) taName.textContent = STATE.teamA + ' (BOWLING)';
  if (tbName) tbName.textContent = STATE.teamB + ' (BATTING)';

  // Sync settings inputs
  var strInp = document.getElementById('striker-name-input');
  var nsInp  = document.getElementById('nonstriker-name-input');
  var bwInp  = document.getElementById('bowler-name-input');
  if (strInp) strInp.value = STATE.striker.name;
  if (nsInp)  nsInp.value  = STATE.nonStriker.name;
  if (bwInp)  bwInp.value  = STATE.bowler.name;

  updateAllUI();
  updateCharts();
  updateScorecardUI();
}

// ── Kept for backward-compat (INNINGS BREAK button) ──────────
function showInningsBreak() {
  // Manual innings break just calls checkAllOut flow
  showAllOutModal();
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
    showCustomAlert('Match Saved', 'Match successfully pushed to local history.', '💾');
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
  showCustomConfirm('Reset Match', 'Are you sure you want to completely clear all match data?', 'RESET', function() {
    localStorage.removeItem('cricket_state');
    window.location.href = window.location.pathname + '?reset=true';
  });
}

// ============================================================
// UTILITY & THEME
// ============================================================
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  var isLight = document.body.classList.contains('light-theme');
  localStorage.setItem('cricket_theme_light', isLight);
  document.getElementById('theme-icon').textContent = isLight ? '☀️' : '🌙';
  document.getElementById('theme-label').textContent = isLight ? 'Light' : 'Dark';
}

function initTheme() {
  if (localStorage.getItem('cricket_theme_light') === 'true') {
    document.body.classList.add('light-theme');
    var ti = document.getElementById('theme-icon');
    var tl = document.getElementById('theme-label');
    if (ti) ti.textContent = '☀️';
    if (tl) tl.textContent = 'Light';
  }
}

function showCustomAlert(title, message, icon) {
  var overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  overlay.innerHTML =
    '<div class="custom-modal">' +
      '<div class="cm-icon">' + (icon || 'ℹ️') + '</div>' +
      '<h3 class="cm-title">' + title + '</h3>' +
      '<div class="cm-message">' + message + '</div>' +
      '<div class="cm-btn-group">' +
        '<button class="cm-btn cm-btn-ok" onclick="this.closest(\'.custom-modal-overlay\').remove()">OK</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function showCustomConfirm(title, message, confirmText, onConfirm) {
  var overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  overlay.innerHTML =
    '<div class="custom-modal">' +
      '<div class="cm-icon">⚠️</div>' +
      '<h3 class="cm-title">' + title + '</h3>' +
      '<div class="cm-message">' + message + '</div>' +
      '<div class="cm-btn-group">' +
        '<button class="cm-btn cm-btn-cancel" onclick="this.closest(\'.custom-modal-overlay\').remove()">CANCEL</button>' +
        '<button class="cm-btn cm-btn-confirm" id="cm-confirm-btn">' + confirmText + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('cm-confirm-btn').onclick = function() {
    overlay.remove();
    if (onConfirm) onConfirm();
  };
}

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

// Restore theme on load
setTimeout(initTheme, 50);
