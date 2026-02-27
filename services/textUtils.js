/**
 * Text Processing Utilities
 * Normalización, stemming, distancia Levenshtein y sinónimos médicos en español
 */

// Mapa de sinónimos médicos en español agrupados por concepto
const SYNONYM_GROUPS = [
  ['cirugía', 'operación', 'intervención', 'procedimiento', 'cirugia', 'cirujía'],
  ['anestesia', 'sedación', 'sedacion', 'anestésico', 'anestesico'],
  ['fractura', 'rotura', 'quiebre', 'ruptura'],
  ['trauma', 'traumatismo', 'lesión', 'lesion', 'traumático', 'traumatico'],
  ['hernia', 'protrusión', 'protrusion', 'eventración', 'eventracion'],
  ['tumor', 'neoplasia', 'masa', 'cáncer', 'cancer', 'carcinoma', 'oncología', 'oncologia'],
  ['hueso', 'óseo', 'oseo', 'esqueleto', 'esquelético', 'esqueletico'],
  ['articulación', 'articulacion', 'articular', 'coyuntura'],
  ['riñón', 'rinon', 'renal', 'nefro', 'nefrología', 'nefrologia'],
  ['hígado', 'higado', 'hepático', 'hepatico', 'hepato'],
  ['estómago', 'estomago', 'gástrico', 'gastrico', 'gastro'],
  ['intestino', 'intestinal', 'colon', 'colónico', 'colonico', 'entérico', 'enterico'],
  ['próstata', 'prostata', 'prostático', 'prostatico'],
  ['útero', 'utero', 'uterino', 'histerectomía', 'histerectomia'],
  ['vejiga', 'vesical', 'vesícula', 'vesicula'],
  ['cerebro', 'cerebral', 'neuro', 'neurología', 'neurologia', 'neurocirugía', 'neurocirugia', 'craneal'],
  ['columna', 'vertebral', 'espinal', 'raquídeo', 'raquideo', 'lumbar', 'cervical'],
  ['pulmón', 'pulmon', 'pulmonar', 'torácico', 'toracico', 'tórax', 'torax'],
  ['vascular', 'vaso', 'vena', 'venoso', 'arteria', 'arterial'],
  ['tiroides', 'tiroideo', 'tiroidectomía', 'tiroidectomia', 'bocio'],
  ['apéndice', 'apendice', 'apendicectomía', 'apendicectomia', 'apendicular'],
  ['laparoscopia', 'laparoscópico', 'laparoscopico', 'laparo', 'laparotomía', 'laparotomia'],
  ['catéter', 'cateter', 'cateterismo', 'canalización', 'canalizacion', 'vía', 'via'],
  ['sutura', 'suturar', 'costura', 'cierre', 'punto'],
  ['bisturí', 'bisturi', 'escalpelo', 'corte', 'incisión', 'incision'],
  ['paciente', 'enfermo', 'cliente'],
  ['sangre', 'hemático', 'hematico', 'sanguíneo', 'sanguineo', 'hemoglobina', 'hematoma'],
  ['infección', 'infeccion', 'infeccioso', 'séptico', 'septico', 'sepsis', 'absceso'],
  ['dolor', 'dolor', 'algesia', 'analgesia', 'analgésico', 'analgesico'],
  ['mama', 'mamario', 'mastectomía', 'mastectomia', 'pecho', 'seno'],
  ['tobillo', 'maleolo', 'pie', 'podal'],
  ['rodilla', 'rotula', 'rótula', 'patelar', 'menisco'],
  ['hombro', 'glenohumeral', 'escapular', 'manguito', 'rotador'],
  ['cadera', 'coxal', 'femoral', 'fémur', 'femur'],
  ['clavícula', 'clavicula', 'clavicular'],
  ['amígdala', 'amigdala', 'amigdalectomía', 'amigdalectomia', 'tonsilar'],
  ['esófago', 'esofago', 'esofágico', 'esofagico'],
  ['páncreas', 'pancreas', 'pancreático', 'pancreatico', 'pancreatectomía', 'pancreatectomia'],
  ['bazo', 'esplénico', 'esplenico', 'esplenectomía', 'esplenectomia'],
  ['fístula', 'fistula', 'fistuloso'],
  ['enfermería', 'enfermeria', 'enfermero', 'enfermera', 'nursing'],
  ['goteo', 'infusión', 'infusion', 'goteos', 'suero', 'fluidoterapia'],
  ['várices', 'varices', 'varicoso', 'variz'],
];

// Build fast lookup: word -> set of synonym words
const SYNONYM_MAP = new Map();
for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = group.map(w => normalize(w));
  for (const word of normalizedGroup) {
    if (!SYNONYM_MAP.has(word)) {
      SYNONYM_MAP.set(word, new Set());
    }
    for (const synonym of normalizedGroup) {
      if (synonym !== word) {
        SYNONYM_MAP.get(word).add(synonym);
      }
    }
  }
}

/**
 * Normaliza texto: minúsculas, sin acentos, sin puntuación extra
 */
function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\sñ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Spanish stemmer básico por remoción de sufijos
 */
function stem(word) {
  if (!word || word.length < 4) return word;

  let w = normalize(word);

  // Remove common Spanish suffixes (longest first)
  const suffixes = [
    'amiento', 'imiento', 'aciones', 'uciones',
    'amente', 'mente', 'acion', 'icion', 'encia', 'ancia',
    'ador', 'edor', 'idor', 'ados', 'idos', 'ando', 'iendo',
    'idad', 'ismo', 'ista', 'ible', 'able',
    'ado', 'ido', 'ada', 'ida', 'oso', 'osa',
    'ión', 'ion', 'ias', 'ios', 'ica', 'ico',
    'ar', 'er', 'ir', 'es', 'as', 'os',
  ];

  for (const suffix of suffixes) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length);
    }
  }

  return w;
}

/**
 * Distancia de Levenshtein entre dos cadenas
 */
function levenshtein(a, b) {
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Extrae un snippet de contexto alrededor de la posición de match
 */
function extractSnippet(text, query, contextChars = 120) {
  if (!text || !query) return '';

  const normalizedText = normalize(text);
  const normalizedQuery = normalize(query);
  const pos = normalizedText.indexOf(normalizedQuery);

  if (pos === -1) {
    // Try finding individual words
    const words = normalizedQuery.split(/\s+/);
    let bestPos = -1;
    for (const word of words) {
      const wordPos = normalizedText.indexOf(word);
      if (wordPos !== -1 && (bestPos === -1 || wordPos < bestPos)) {
        bestPos = wordPos;
      }
    }
    if (bestPos === -1) {
      return text.substring(0, contextChars * 2) + (text.length > contextChars * 2 ? '...' : '');
    }
    const start = Math.max(0, bestPos - contextChars);
    const end = Math.min(text.length, bestPos + contextChars);
    return (start > 0 ? '...' : '') + text.substring(start, end).trim() + (end < text.length ? '...' : '');
  }

  const start = Math.max(0, pos - contextChars);
  const end = Math.min(text.length, pos + normalizedQuery.length + contextChars);
  return (start > 0 ? '...' : '') + text.substring(start, end).trim() + (end < text.length ? '...' : '');
}

/**
 * Obtiene sinónimos de una palabra
 */
function getSynonyms(word) {
  const normalized = normalize(word);
  return SYNONYM_MAP.get(normalized) || new Set();
}

/**
 * Verifica si dos palabras son sinónimos
 */
function areSynonyms(word1, word2) {
  const n1 = normalize(word1);
  const n2 = normalize(word2);
  const synonyms = SYNONYM_MAP.get(n1);
  return synonyms ? synonyms.has(n2) : false;
}

/**
 * Calcula similitud entre dos palabras usando stems
 */
function stemSimilarity(word1, word2) {
  return stem(word1) === stem(word2);
}

module.exports = {
  normalize,
  stem,
  levenshtein,
  extractSnippet,
  getSynonyms,
  areSynonyms,
  stemSimilarity,
  SYNONYM_GROUPS,
  SYNONYM_MAP,
};
