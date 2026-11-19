/** Global cosmetic choices. Personality is presentation/style only, never evidence or policy. */
export interface CatalogEntry {
  id: string; name: string; assetId: string; description: string; personality: string;
}

export const playerCharacters: readonly CatalogEntry[] = [
  {
    "id": "jungle-lion",
    "name": "Leo",
    "assetId": "lion",
    "description": "Leo, a confident golden lion wearing a turquoise neckerchief",
    "personality": "Confident and warm, Leo meets a disagreement with a steady smile. He brings enthusiasm and a friendly sense of courage."
  },
  {
    "id": "jungle-zebra",
    "name": "Zuri",
    "assetId": "zebra",
    "description": "Zuri, an energetic zebra wearing a coral vest",
    "personality": "Lively and curious, Zuri welcomes another perspective. She is expressive, quick to ask a question and eager to join the conversation."
  },
  {
    "id": "superhero-scout",
    "name": "Nova",
    "assetId": "superhero-scout",
    "description": "Nova, an original rooftop scout in a turquoise suit and coral cape",
    "personality": "Nova is an energetic scout who approaches a challenge with courage and curiosity. Friendly confidence is her signature."
  },
  {
    "id": "superhero-inventor",
    "name": "Kit",
    "assetId": "superhero-inventor",
    "description": "Kit, an original violet-clad inventor with goggles",
    "personality": "Kit is inventive and observant, always interested in how things work. A playful problem-solver who enjoys considering a different angle."
  },
  {
    "id": "detective-reporter",
    "name": "Quinn",
    "assetId": "detective-reporter",
    "description": "Quinn, a monochrome newspaper reporter with a notebook",
    "personality": "Quinn is inquisitive and persistent, with a reporter's eye for a clear question. Calm delivery and careful observation suit this character."
  },
  {
    "id": "detective-witness",
    "name": "Ellis",
    "assetId": "detective-witness",
    "description": "Ellis, a monochrome witness in a waistcoat",
    "personality": "Ellis is thoughtful and quietly expressive. A measured listener who takes time to put a personal perspective into words."
  },
  {
    "id": "courtroom-advocate-a",
    "name": "Morgan",
    "assetId": "courtroom-advocate-a",
    "description": "Morgan, a courtroom advocate wearing a navy suit",
    "personality": "Morgan is composed and direct, with a courteous courtroom manner. Patient attention and clear expression define this character."
  },
  {
    "id": "courtroom-advocate-b",
    "name": "Casey",
    "assetId": "courtroom-advocate-b",
    "description": "Casey, a courtroom advocate wearing a burgundy suit",
    "personality": "Casey is assured and considerate. A deliberate communicator who approaches a disagreement with curiosity and respect."
  }
];

export const lawyers: readonly CatalogEntry[] = [
  {
    "id": "jungle-tavi",
    "name": "Tavi",
    "assetId": "jungle-lawyer-a",
    "description": "Tavi, an original toucan lawyer with a golden beak, green jacket and case notes",
    "personality": "Bright, curious and encouraging. A spirited advocate who helps their player express a clear point. Lively, concise phrasing and an occasional light jungle metaphor; preserve the player's actual meaning."
  },
  {
    "id": "jungle-fern",
    "name": "Fern",
    "assetId": "jungle-lawyer-b",
    "description": "Fern, an original capybara lawyer in a turquoise waistcoat carrying a coral casebook",
    "personality": "Calm, good-humored and resourceful. A patient advocate who organizes their player's reasoning. Warm, grounded sentences with gentle humor, without adding claims or evidence."
  },
  {
    "id": "superhero-aster",
    "name": "Aster",
    "assetId": "superhero-lawyer-a",
    "description": "Aster, an original city advocate with gold spectacles, a teal cape and a case tablet",
    "personality": "Witty, focused and resourceful. A confident sidekick who puts their player's reasoning in order. Crisp, heroic sentences with light investigation language; no invented deductions or facts."
  },
  {
    "id": "superhero-vesper",
    "name": "Vesper",
    "assetId": "superhero-lawyer-b",
    "description": "Vesper, an original rooftop advocate in violet with a cyan visor and a gold dossier",
    "personality": "Inventive, composed and sharp. An encouraging advocate who makes the player's existing point easy to follow. Concise comic-book cadence and occasional dry wit, preserving the substance and limits of the submitted argument."
  },
  {
    "id": "detective-marlow",
    "name": "Marlow",
    "assetId": "detective-lawyer-a",
    "description": "Marlow, an original monochrome attorney in a pinstriped suit holding a case folder",
    "personality": "Observant, economical and quietly reassuring. A precise advocate with dry humor. Short noir-style sentences that distinguish the player's stated reasons from speculation."
  },
  {
    "id": "detective-arden",
    "name": "Arden",
    "assetId": "detective-lawyer-b",
    "description": "Arden, an original monochrome attorney with round spectacles, a light coat and a dossier",
    "personality": "Patient, perceptive and methodical. A thoughtful advocate who finds a clear thread in their player's argument. Measured detective-office phrasing with restrained asides; never manufacture a clue or allegation."
  },
  {
    "id": "courtroom-emery",
    "name": "Emery",
    "assetId": "courtroom-lawyer-a",
    "description": "Emery, an original silver-haired lawyer in a navy suit carrying a gold-edged lawbook",
    "personality": "Composed, articulate and supportive. A respectful advocate who organizes their player's reasoning. Plain professional legal phrasing, with no invented precedent, claims or evidence."
  },
  {
    "id": "courtroom-sage",
    "name": "Sage",
    "assetId": "courtroom-lawyer-b",
    "description": "Sage, an original curly-haired lawyer in a plum blazer holding a cream document folder",
    "personality": "Thoughtful, assured and meticulous. A patient advocate who states the player's own position precisely. Clear, courteous sentences that preserve qualification and distinguish a claim from its support."
  }
];
