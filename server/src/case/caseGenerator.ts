import seedrandom from 'seedrandom';
import { faker } from '@faker-js/faker';
import { genId, pick, shuffle } from '../utils/helpers.js';
import type {
  CaseData, CaseType, Complexity, Suspect, Evidence, TimelineEvent,
  ClueChain, CinematicPanel, TimePhase, EvidenceReliability, EvidenceSourceType,
  InterviewCategory,
} from '../utils/types.js';

const LOCATIONS = [
  'The Grand Meridian Hotel', 'Riverside Warehouse District', 'Old Town Theater',
  'Harbor View Apartments', 'The Golden Lamp Pub', 'City Hall Archives',
  'Central Park Pavilion', 'The Velvet Lounge', 'Dockside Fishery',
  'Abandoned Rail Yard', 'St. Claire Cathedral', 'Chinatown Market',
];

const MOTIVES = [
  'jealousy', 'greed', 'revenge', 'fear of exposure', 'power', 'betrayal',
  'insurance fraud', 'inheritance dispute', 'political rivalry', 'cover-up',
];

const METHODS_MURDER = ['poisoning', 'blunt force trauma', 'staged accident', 'strangulation', 'pushed from height'];
const METHODS_THEFT = ['lockpicking', 'inside access', 'distraction scheme', 'tunneling', 'digital bypass'];
const METHODS_BLACKMAIL = ['anonymous letters', 'intercepted communications', 'hidden camera', 'forged documents'];
const METHODS_KIDNAPPING = ['ambush in parking lot', 'lured to remote location', 'disguised as delivery', 'drugged drink'];
const METHODS_ARSON = ['accelerant', 'electrical tampering', 'timed incendiary device', 'gas leak manipulation'];

const OCCUPATIONS = [
  'business owner', 'accountant', 'bartender', 'journalist', 'retired detective',
  'nurse', 'artist', 'lawyer', 'dock worker', 'professor', 'waiter', 'mechanic',
  'politician', 'landlord', 'chef', 'taxi driver', 'florist', 'librarian',
];

const RELATIONSHIPS = [
  'business partner', 'ex-spouse', 'neighbor', 'employee', 'old friend',
  'rival', 'tenant', 'sibling', 'lover', 'creditor', 'client', 'colleague',
];

const PERSONALITIES = [
  'nervous and evasive', 'calm and collected', 'aggressive and defensive',
  'charming but deceptive', 'quiet and observant', 'paranoid and suspicious',
  'forthcoming but unreliable', 'aloof and uncooperative',
];

function getMethodsByType(caseType: CaseType): string[] {
  switch (caseType) {
    case 'murder': return METHODS_MURDER;
    case 'theft': return METHODS_THEFT;
    case 'blackmail': return METHODS_BLACKMAIL;
    case 'kidnapping': return METHODS_KIDNAPPING;
    case 'arson': return METHODS_ARSON;
    default: return [...METHODS_MURDER, ...METHODS_THEFT, ...METHODS_BLACKMAIL];
  }
}

function getSuspectCount(complexity: Complexity): number {
  switch (complexity) {
    case 'simple': return 3;
    case 'standard': return 4;
    case 'complex': return 6;
  }
}

function getClueChainLength(complexity: Complexity): [number, number] {
  switch (complexity) {
    case 'simple': return [3, 4];
    case 'standard': return [4, 5];
    case 'complex': return [5, 6];
  }
}

export function generateCase(opts: {
  seed: string;
  caseType: CaseType;
  complexity: Complexity;
  customCaseName?: string;
  customVictimName?: string;
  customSuspectNames?: string;
}): CaseData {
  const rng = seedrandom(opts.seed);
  const seededFaker = faker;
  seededFaker.seed(Math.floor(rng() * 2147483647));

  const actualType: CaseType = opts.caseType === 'random'
    ? pick(['murder', 'theft', 'blackmail', 'kidnapping', 'arson'] as CaseType[], rng)
    : opts.caseType;

  const location = pick(LOCATIONS, rng);
  const victimName = opts.customVictimName || seededFaker.person.fullName();
  const victimAge = 25 + Math.floor(rng() * 45);
  const victimOccupation = pick(OCCUPATIONS, rng);

  const caseName = opts.customCaseName || `The ${location.split(' ').slice(-1)[0]} ${actualType === 'murder' ? 'Murder' : actualType === 'theft' ? 'Heist' : actualType === 'blackmail' ? 'Blackmail' : actualType === 'kidnapping' ? 'Disappearance' : 'Fire'}`;

  // Parse custom suspect names
  const customNames = opts.customSuspectNames
    ? opts.customSuspectNames.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : [];

  const suspectCount = getSuspectCount(opts.complexity);
  const culpritIndex = Math.floor(rng() * suspectCount);

  const solutionMotive = pick(MOTIVES, rng);
  const solutionMethod = pick(getMethodsByType(actualType), rng);

  // Generate suspects
  const suspects: Suspect[] = [];
  const phases: TimePhase[] = ['evening', 'late_night', 'early_morning'];
  for (let i = 0; i < suspectCount; i++) {
    const name = customNames[i] || seededFaker.person.fullName();
    const isGuilty = i === culpritIndex;
    const occupation = pick(OCCUPATIONS, rng);
    const relationship = pick(RELATIONSHIPS, rng);
    const personality = pick(PERSONALITIES, rng);
    const alibiPhase = pick(phases, rng);
    const alibi = isGuilty
      ? `Claims to have been at home alone during the ${alibiPhase}, but this cannot be verified.`
      : `Was seen at the ${pick(['bar', 'office', 'restaurant', 'gym', 'library'], rng)} by multiple people during the ${alibiPhase}.`;

    suspects.push({
      id: genId('sus'),
      name,
      age: 22 + Math.floor(rng() * 50),
      occupation,
      relationship,
      personality,
      isGuilty,
      alibi,
      alibiPhase,
      motive: isGuilty ? solutionMotive : (rng() > 0.5 ? pick(MOTIVES, rng) : 'none apparent'),
      avatarUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name)}`,
    });
  }

  const culprit = suspects[culpritIndex];

  // Generate solution
  const solution = {
    culpritId: culprit.id,
    motive: solutionMotive,
    method: solutionMethod,
    opportunity: `Had unverified access to ${location} during the late_night phase.`,
  };

  // Generate clue chains
  const [minLen, maxLen] = getClueChainLength(opts.complexity);
  const chainCategories: ('motive' | 'means' | 'opportunity')[] = ['motive', 'means', 'opportunity'];
  const clueChains: ClueChain[] = [];
  const allEvidence: Evidence[] = [];

  for (const category of chainCategories) {
    const chainLen = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    const steps: Evidence[] = [];
    for (let s = 0; s < chainLen; s++) {
      const phase = phases[Math.min(s % 3, 2)];
      const reliability: EvidenceReliability = s === 0 ? 'low' : (s === chainLen - 1 ? 'high' : 'medium');
      const sourceType: EvidenceSourceType = pick(['forensic', 'witness', 'digital', 'rumor'], rng);

      let title = '';
      let description = '';
      switch (category) {
        case 'motive':
          if (s === 0) {
            title = 'Overheard argument';
            description = `A neighbor heard raised voices between ${culprit.name} and ${victimName} about ${solutionMotive} on the evening before the incident.`;
          } else if (s === chainLen - 1) {
            title = 'Damning correspondence';
            description = `A letter found in ${culprit.name}'s desk explicitly references ${solutionMotive} as motivation to act against ${victimName}.`;
          } else {
            title = `${category} clue ${s + 1}`;
            description = `${sourceType === 'witness' ? 'A witness reports' : sourceType === 'forensic' ? 'Forensic analysis shows' : sourceType === 'digital' ? 'Digital records indicate' : 'Rumors suggest'} that ${culprit.name} had growing ${solutionMotive} toward ${victimName} in recent weeks.`;
          }
          break;
        case 'means':
          if (s === 0) {
            title = 'Suspicious purchase';
            description = `Store records show someone matching ${culprit.name}'s description bought items consistent with ${solutionMethod}.`;
          } else if (s === chainLen - 1) {
            title = 'Physical evidence';
            description = `Forensic analysis of the scene confirms ${solutionMethod} as the method used; traces link directly to ${culprit.name}.`;
          } else {
            title = `${category} clue ${s + 1}`;
            description = `${sourceType === 'forensic' ? 'Lab results show' : sourceType === 'digital' ? 'Security footage reveals' : 'A source indicates'} evidence consistent with ${solutionMethod}. ${culprit.name}'s involvement cannot be ruled out.`;
          }
          break;
        case 'opportunity':
          if (s === 0) {
            title = 'Alibi inconsistency';
            description = `${culprit.name} claims to have been elsewhere, but no one can confirm their whereabouts during the critical window.`;
          } else if (s === chainLen - 1) {
            title = 'Definitive placement';
            description = `Security camera footage places ${culprit.name} at ${location} during the precise time frame of the crime.`;
          } else {
            title = `${category} clue ${s + 1}`;
            description = `${sourceType === 'witness' ? 'An eyewitness' : 'Evidence'} suggests ${culprit.name} was near ${location} that night, contradicting their stated alibi.`;
          }
          break;
      }

      const ev: Evidence = {
        id: genId('ev'),
        title,
        description,
        reliability,
        sourceType,
        confidenceScore: reliability === 'high' ? 80 + Math.floor(rng() * 20) : reliability === 'medium' ? 50 + Math.floor(rng() * 30) : 20 + Math.floor(rng() * 30),
        tag: category === 'motive' ? 'motive' : category === 'means' ? 'means' : 'opportunity',
        timePhase: phase,
        linkedSuspectId: culprit.id,
        isRedHerring: false,
      };
      steps.push(ev);
      allEvidence.push(ev);
    }

    clueChains.push({ id: genId('chain'), steps, category });
  }

  // Add red herrings
  const herringCount = opts.complexity === 'simple' ? 2 : opts.complexity === 'standard' ? 3 : 5;
  for (let i = 0; i < herringCount; i++) {
    const innocentSuspect = suspects.filter(s => !s.isGuilty)[Math.floor(rng() * (suspects.length - 1))];
    if (!innocentSuspect) continue;
    const ev: Evidence = {
      id: genId('ev'),
      title: pick(['Mysterious note', 'Unidentified fingerprint', 'Strange phone call', 'Hidden receipt', 'Anonymous tip'], rng),
      description: `${pick(['Evidence suggests', 'A rumor indicates', 'An anonymous source claims', 'Records show'], rng)} ${innocentSuspect.name} may have had involvement, but further investigation reveals this to be ${pick(['a coincidence', 'misleading', 'unrelated', 'fabricated'], rng)}.`,
      reliability: 'low',
      sourceType: pick(['witness', 'rumor', 'digital'], rng) as EvidenceSourceType,
      confidenceScore: 10 + Math.floor(rng() * 30),
      tag: 'red_herring',
      timePhase: pick(phases, rng),
      linkedSuspectId: innocentSuspect.id,
      isRedHerring: true,
    };
    allEvidence.push(ev);
  }

  // Generate timeline
  const timeline: TimelineEvent[] = [];
  const timeSlots = [
    { time: '6:00 PM', phase: 'evening' as TimePhase, order: 0 },
    { time: '7:30 PM', phase: 'evening' as TimePhase, order: 1 },
    { time: '9:00 PM', phase: 'evening' as TimePhase, order: 2 },
    { time: '11:00 PM', phase: 'late_night' as TimePhase, order: 3 },
    { time: '12:30 AM', phase: 'late_night' as TimePhase, order: 4 },
    { time: '2:00 AM', phase: 'late_night' as TimePhase, order: 5 },
    { time: '4:00 AM', phase: 'early_morning' as TimePhase, order: 6 },
    { time: '5:30 AM', phase: 'early_morning' as TimePhase, order: 7 },
    { time: '6:30 AM', phase: 'early_morning' as TimePhase, order: 8 },
  ];

  // Key events
  const crimeTimeSlot = timeSlots[4]; // 12:30 AM
  timeline.push({
    id: genId('tl'),
    time: crimeTimeSlot.time,
    phase: crimeTimeSlot.phase,
    description: `The ${actualType} occurs at ${location}. ${victimName} is the victim of ${solutionMethod}.`,
    relatedSuspectIds: [culprit.id],
    relatedEvidenceIds: [],
    discovered: false,
    order: crimeTimeSlot.order,
  });

  // Build coherent timeline events
  const eventTemplates = [
    { order: 0, desc: (s: Suspect) => `${s.name} arrives at ${location} for a scheduled meeting.` },
    { order: 1, desc: (s: Suspect) => `${s.name} is seen having a heated discussion near the entrance.` },
    { order: 2, desc: (_s: Suspect) => `${victimName} makes a phone call that lasts approximately 12 minutes.` },
    { order: 3, desc: (s: Suspect) => `${s.name} leaves the main area and heads toward the back of the building.` },
    { order: 5, desc: (_s: Suspect) => `A loud noise is reported by nearby residents.` },
    { order: 6, desc: (_s: Suspect) => `The scene is discovered by a passerby who calls authorities.` },
    { order: 7, desc: (s: Suspect) => `${s.name} is spotted leaving the area in a hurry.` },
    { order: 8, desc: (_s: Suspect) => `Police arrive and secure the scene. Initial witness statements are taken.` },
  ];

  for (const tmpl of eventTemplates) {
    const slot = timeSlots[tmpl.order];
    const suspect = pick(suspects, rng);
    timeline.push({
      id: genId('tl'),
      time: slot.time,
      phase: slot.phase,
      description: tmpl.desc(suspect),
      relatedSuspectIds: [suspect.id],
      relatedEvidenceIds: [],
      discovered: tmpl.order <= 2, // First few events are known from the start
      order: tmpl.order,
    });
  }

  // Sort timeline
  timeline.sort((a, b) => a.order - b.order);

  // Cinematic panels (images are assigned later by the server image provider)
  const cinematicPanels: CinematicPanel[] = [
    {
      id: genId('cin'),
      imageDesc: 'exterior_night',
      caption: `${location}. A cold night settles over the city...`,
      duration: 4000,
    },
    {
      id: genId('cin'),
      imageDesc: 'dim_hallway',
      caption: `${victimName}, ${victimAge}, ${victimOccupation}. No one expected what would happen next.`,
      duration: 4000,
    },
    {
      id: genId('cin'),
      imageDesc: 'crime_scene',
      caption: `A case of ${actualType}. The evidence is scattered, the truth buried deep.`,
      duration: 4000,
    },
    {
      id: genId('cin'),
      imageDesc: 'detective_desk',
      caption: `You've been called in. ${suspectCount} suspects. One truth. Don't let it slip away.`,
      duration: 5000,
    },
  ];

  const synopsis = `${victimName}, a ${victimAge}-year-old ${victimOccupation}, has become the victim of ${actualType === 'murder' ? 'a heinous murder' : actualType === 'theft' ? 'a brazen theft' : actualType === 'blackmail' ? 'a vicious blackmail scheme' : actualType === 'kidnapping' ? 'a mysterious kidnapping' : 'a deliberate arson attack'} at ${location}. With ${suspectCount} suspects and a web of lies to untangle, you must piece together the evidence, interview witnesses, and build your case before the trail goes cold.`;

  return {
    caseId: genId('case'),
    seed: opts.seed,
    caseName,
    caseType: actualType,
    complexity: opts.complexity,
    victimName,
    victimAge,
    victimOccupation,
    location,
    locationImageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(location)}`,
    synopsis,
    suspects,
    evidence: shuffle(allEvidence, rng),
    timeline,
    clueChains,
    solution,
    cinematicPanels,
  };
}

export function generateInterviewResponse(
  suspect: Suspect,
  category: InterviewCategory,
  caseData: CaseData,
  evidenceId?: string,
  rng?: () => number
): string {
  const rand = rng || Math.random;
  const isGuilty = suspect.isGuilty;
  const isDeceptive = isGuilty && rand() > 0.3;
  const personality = suspect.personality;

  let response = '';

  switch (category) {
    case 'alibi':
      if (isGuilty && isDeceptive) {
        response = `*${personality}* "${suspect.alibi}" ${rand() > 0.5 ? 'They fidget slightly while speaking.' : 'Their eyes dart away briefly.'}`;
      } else {
        response = `"${suspect.alibi}" ${!isGuilty ? 'They seem confident and relaxed.' : 'Something about their tone seems rehearsed.'}`;
      }
      break;

    case 'relationship':
      if (isGuilty) {
        response = `"${caseData.victimName}? We were... ${suspect.relationship}s. It was complicated. But I would never..." ${isDeceptive ? 'They trail off unconvincingly.' : 'They seem genuinely upset.'}`;
      } else {
        response = `"I knew ${caseData.victimName} as a ${suspect.relationship}. We got along for the most part. ${rand() > 0.5 ? 'I can\'t believe what happened.' : 'It\'s a real tragedy.'}"`;
      }
      break;

    case 'conflicts':
      if (isGuilty) {
        const admission = isDeceptive ? 'denies any serious disagreements' : 'admits to some tension';
        response = `${suspect.name} ${admission} with ${caseData.victimName}. "${rand() > 0.5 ? 'Everyone has disagreements. It was nothing serious.' : 'We had our differences, but it was strictly professional.'}" ${isDeceptive ? 'A bead of sweat forms on their brow.' : ''}`;
      } else {
        response = `"Honestly, I didn't have any real problems with ${caseData.victimName}. ${rand() > 0.5 ? 'They could be difficult sometimes, but who isn\'t?' : 'We kept things civil.'}"`;
      }
      break;

    case 'financial':
      if (isGuilty && caseData.solution.motive.includes('greed') || caseData.solution.motive.includes('insurance') || caseData.solution.motive.includes('inheritance')) {
        response = `"My finances are my own business." ${isDeceptive ? 'They become visibly agitated.' : 'They shift uncomfortably.'} ${rand() > 0.5 ? '"Fine. Things have been tight lately, but that has nothing to do with this."' : '"I don\'t see how that\'s relevant to your investigation."'}`;
      } else {
        response = `"${rand() > 0.5 ? 'I\'m doing fine financially. No complaints.' : 'Money isn\'t something I worry about much.'}" They seem ${isGuilty ? 'slightly defensive' : 'unbothered'} by the question.`;
      }
      break;

    case 'whereabouts':
      if (isGuilty) {
        response = `"During the ${suspect.alibiPhase}? ${suspect.alibi}" ${isDeceptive ? 'The account has suspicious gaps.' : 'They provide a detailed but unverifiable account.'} ${rand() > 0.5 ? '"You can check if you want."' : '"I don\'t have anyone who can confirm, unfortunately."'}`;
      } else {
        response = `"I was ${rand() > 0.5 ? 'at home' : 'out'} during that time. ${suspect.alibi}" They provide ${rand() > 0.5 ? 'a clear and consistent' : 'a straightforward'} account.`;
      }
      break;

    case 'explain_evidence':
      if (evidenceId) {
        const ev = caseData.evidence.find(e => e.id === evidenceId);
        if (ev) {
          if (ev.linkedSuspectId === suspect.id) {
            if (isGuilty && isDeceptive) {
              response = `"${ev.title}? I... I don't know anything about that." ${rand() > 0.5 ? 'Their voice wavers.' : 'They won\'t make eye contact.'} "You must have the wrong person."`;
            } else if (isGuilty) {
              response = `"I can see how that looks bad for me, but it's not what you think." They pause. "I was in the wrong place at the wrong time."`;
            } else {
              response = `"${ev.title}? That's news to me. ${rand() > 0.5 ? 'I genuinely don\'t know how that connects to me.' : 'There must be some mistake.'}" They seem ${ev.isRedHerring ? 'confused but honest' : 'surprised'}.`;
            }
          } else {
            response = `"I'm not sure what that has to do with me specifically. ${rand() > 0.5 ? 'You might want to ask someone else about that.' : 'That doesn\'t ring any bells.'}"`;
          }
        } else {
          response = `"I'm not familiar with what you're referring to." They look genuinely puzzled.`;
        }
      } else {
        response = `"What evidence are you referring to? You'll need to be more specific."`;
      }
      break;
  }

  return response;
}
