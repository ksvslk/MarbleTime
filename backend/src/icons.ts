/**
 * Job icons: the same names and hints as JOB_ICONS in tv/packages/shared/src/marble/data.ts (keep them in step),
 * plus a few words per language so the server can pick an icon when a parent adds a job without one.
 * Words are lower case; accents don't matter (they are stripped before matching).
 */
export const JOB_ICONS = [
  {name: 'toys', hint: 'tidy up toys, put things away', words: {
    en: ['toy', 'lego', 'tidy', 'put away'], et: ['mänguasj', 'klotsid', 'korista'], de: ['spielzeug', 'spielsachen', 'aufräumen'], es: ['juguete', 'recoger', 'ordenar']}},
  {name: 'cat', hint: 'cat, feed or brush the cat, pets', words: {
    en: ['cat', 'kitten', 'litter'], et: ['kass', 'kiisu'], de: ['katze', 'kätzchen', 'katzenklo'], es: ['gato', 'gata', 'gatito']}},
  {name: 'tooth', hint: 'brush teeth', words: {
    en: ['teeth', 'tooth', 'floss'], et: ['hammas', 'hambad', 'hambaid'], de: ['zähne', 'zahn', 'zähne putzen'], es: ['dientes', 'diente']}},
  {name: 'moon', hint: 'bedtime, pajamas, go to sleep', words: {
    en: ['bedtime', 'pajamas', 'pyjamas', 'sleep'], et: ['pidžaama', 'magama', 'öörõivad'], de: ['schlafanzug', 'pyjama', 'schlafen'], es: ['pijama', 'dormir']}},
  {name: 'broom', hint: 'sweep, clean the floor, tidy a room', words: {
    en: ['sweep', 'vacuum', 'hoover', 'floor', 'mop', 'your room', 'bedroom', 'clean the room'], et: ['pühi', 'põrand', 'tolmuimeja', 'tuba', 'korista tuba'], de: ['fegen', 'kehren', 'staubsaugen', 'boden', 'zimmer', 'zimmer aufräumen'], es: ['barrer', 'aspirar', 'suelo', 'habitación', 'cuarto']}},
  {name: 'bed', hint: 'make the bed', words: {
    en: ['make the bed', 'bed'], et: ['voodi'], de: ['bett'], es: ['hacer la cama', 'cama']}},
  {name: 'shirt', hint: 'get dressed, put clothes away, fold clothes', words: {
    en: ['dress', 'clothes', 'shirt', 'fold'], et: ['riided', 'riietu', 'särk'], de: ['anziehen', 'kleidung', 'kleider', 'falten'], es: ['vestirse', 'ropa', 'camisa', 'doblar']}},
  {name: 'laundry', hint: 'laundry, washing machine, sort socks', words: {
    en: ['laundry', 'washing machine', 'socks'], et: ['pesumasin', 'pesu', 'sokid'], de: ['wäsche', 'waschmaschine', 'socken'], es: ['colada', 'lavadora', 'calcetines', 'ropa sucia']}},
  {name: 'trash', hint: 'take out the trash, empty the bin', words: {
    en: ['trash', 'garbage', 'rubbish', 'bin'], et: ['prügi', 'prügikast'], de: ['müll', 'mülleimer', 'abfall'], es: ['basura']}},
  {name: 'recycle', hint: 'recycling, sort bottles and paper', words: {
    en: ['recycl', 'bottles', 'paper'], et: ['taaskasut', 'pudelid', 'sorteeri'], de: ['recycling', 'flaschen', 'pfand', 'altpapier'], es: ['recicla', 'botellas', 'papel']}},
  {name: 'table', hint: 'set or clear the table, dishes, dishwasher, eat dinner', words: {
    en: ['table', 'dishes', 'dishwasher', 'dinner', 'plates'], et: ['laud', 'nõud', 'nõudepesumasin', 'kata', 'õhtusöök'], de: ['tisch', 'geschirr', 'spülmaschine', 'abwasch', 'teller'], es: ['mesa', 'platos', 'lavavajillas', 'cena']}},
  {name: 'cook', hint: 'help cook, bake, make breakfast', words: {
    en: ['cook', 'bake', 'breakfast'], et: ['kokka', 'küpseta', 'hommikusöök', 'süüa teha'], de: ['kochen', 'backen', 'frühstück'], es: ['cocinar', 'hornear', 'desayuno']}},
  {name: 'wash', hint: 'wash hands, wash something', words: {
    en: ['wash', 'hands'], et: ['pese', 'käed', 'käsi'], de: ['waschen', 'hände'], es: ['lavar', 'manos']}},
  {name: 'shower', hint: 'take a shower, wash hair', words: {
    en: ['shower', 'wash hair'], et: ['dušš', 'duši', 'juuksed'], de: ['dusche', 'duschen', 'haare waschen'], es: ['ducha', 'pelo']}},
  {name: 'bath', hint: 'take a bath', words: {
    en: ['bath'], et: ['vann', 'vanni'], de: ['baden', 'badewanne'], es: ['bañarse', 'bañera']}},
  {name: 'dog', hint: 'dog, walk or feed the dog', words: {
    en: ['dog', 'puppy', 'walk the dog'], et: ['koer', 'koeraga', 'koer jaluta', 'kutsu'], de: ['hund', 'gassi'], es: ['perro', 'pasear al perro']}},
  {name: 'fish', hint: 'feed the fish, aquarium', words: {
    en: ['fish', 'aquarium'], et: ['kala', 'kalad', 'akvaarium'], de: ['fisch', 'aquarium'], es: ['pez', 'peces', 'acuario']}},
  {name: 'bird', hint: 'bird, feed the birds', words: {
    en: ['bird'], et: ['lind', 'linnud', 'linnu'], de: ['vogel', 'vögel'], es: ['pájaro', 'aves']}},
  {name: 'rabbit', hint: 'rabbit, hamster, guinea pig, small pets', words: {
    en: ['rabbit', 'bunny', 'hamster', 'guinea pig'], et: ['jänes', 'küülik', 'merisiga'], de: ['hase', 'kaninchen', 'meerschweinchen'], es: ['conejo', 'hámster', 'cobaya']}},
  {name: 'plant', hint: 'water the plants, garden', words: {
    en: ['plant', 'water the plants', 'garden', 'flowers'], et: ['taim', 'lilled', 'kasta', 'aed'], de: ['pflanze', 'blumen', 'gießen', 'garten'], es: ['plantas', 'regar', 'flores', 'jardín']}},
  {name: 'leaf', hint: 'rake leaves, outdoor work, nature', words: {
    en: ['leaves', 'rake', 'yard'], et: ['lehed', 'lehti', 'riisu'], de: ['laub', 'blätter', 'rechen', 'harken'], es: ['hojas', 'rastrillo']}},
  {name: 'snow', hint: 'shovel snow, winter clothes', words: {
    en: ['snow', 'shovel'], et: ['lumi', 'lund', 'lume'], de: ['schnee', 'schippen'], es: ['nieve', 'palear']}},
  {name: 'book', hint: 'read a book, reading', words: {
    en: ['read', 'book'], et: ['loe', 'lugema', 'raamat'], de: ['lesen', 'buch'], es: ['leer', 'libro', 'lectura']}},
  {name: 'pencil', hint: 'homework, writing, practise letters', words: {
    en: ['homework', 'write', 'writing', 'letters'], et: ['kodutöö', 'kirjuta', 'tähed'], de: ['hausaufgaben', 'schreiben', 'buchstaben'], es: ['deberes', 'tarea', 'escribir', 'letras']}},
  {name: 'backpack', hint: 'pack the school bag, get ready for school', words: {
    en: ['school bag', 'schoolbag', 'backpack', 'school', 'ready'], et: ['koolikott', 'kool', 'kott'], de: ['schulranzen', 'schultasche', 'rucksack', 'schule'], es: ['mochila', 'escuela', 'colegio']}},
  {name: 'music', hint: 'practise an instrument, sing, music lesson', words: {
    en: ['piano', 'guitar', 'violin', 'instrument', 'sing', 'music'], et: ['klaver', 'kitarr', 'viiul', 'laul', 'muusika'], de: ['klavier', 'gitarre', 'geige', 'singen', 'musik'], es: ['guitarra', 'violín', 'cantar', 'música']}},
  {name: 'paint', hint: 'draw, paint, art', words: {
    en: ['draw', 'paint', 'colour', 'color'], et: ['joonista', 'maali', 'värvi'], de: ['malen', 'zeichnen', 'basteln'], es: ['dibujar', 'pintar', 'colorear']}},
  {name: 'puzzle', hint: 'puzzle, board game, play quietly', words: {
    en: ['puzzle', 'board game'], et: ['pusle', 'lauamäng'], de: ['puzzle', 'brettspiel'], es: ['rompecabezas', 'puzle', 'juego de mesa']}},
  {name: 'bike', hint: 'ride a bike, sport, exercise', words: {
    en: ['bike', 'bicycle', 'sport', 'exercise'], et: ['ratas', 'rattaga', 'jalgratas', 'trenn'], de: ['fahrrad', 'rad fahren', 'turnen'], es: ['bici', 'deporte', 'ejercicio']}},
  {name: 'shoes', hint: 'put shoes away, go for a walk', words: {
    en: ['shoes', 'boots', 'walk'], et: ['kingad', 'saapad', 'jalanõud', 'jaluta'], de: ['schuhe', 'stiefel', 'spazieren'], es: ['zapatos', 'botas', 'pasear']}},
  {name: 'car', hint: 'wash the car, get in the car', words: {
    en: ['car', 'wash the car'], et: ['auto', 'pese auto'], de: ['auto', 'auto waschen'], es: ['coche', 'carro', 'lavar el coche']}},
  {name: 'shopping', hint: 'help with shopping, unpack the shopping', words: {
    en: ['shopping', 'groceries', 'shop'], et: ['pood', 'poes', 'ostud', 'sisseost'], de: ['einkaufen', 'einkauf'], es: ['compras', 'compra', 'supermercado']}},
  {name: 'spray', hint: 'clean windows or the bathroom, wipe', words: {
    en: ['window', 'wipe', 'bathroom', 'clean', 'dust'], et: ['aknad', 'aken', 'vannituba', 'tolmu'], de: ['fenster', 'wischen', 'putzen', 'badezimmer', 'staub'], es: ['ventanas', 'limpiar', 'baño', 'polvo']}},
  {name: 'sofa', hint: 'tidy the living room, cushions', words: {
    en: ['sofa', 'couch', 'cushions', 'living room'], et: ['diivan', 'padjad', 'elutuba'], de: ['sofa', 'kissen', 'wohnzimmer'], es: ['sofá', 'cojines', 'salón']}},
  {name: 'lamp', hint: 'turn off the lights, save energy', words: {
    en: ['lights', 'light', 'lamp', 'energy'], et: ['tuled', 'tuli', 'lamp'], de: ['licht', 'lampe', 'strom'], es: ['luces', 'luz', 'lámpara']}},
  {name: 'baby', hint: 'help with a baby or a younger sibling', words: {
    en: ['baby', 'sibling', 'little brother', 'little sister'], et: ['beebi', 'väikevend', 'väikeõde', 'õde', 'vend'], de: ['baby', 'geschwister', 'bruder', 'schwester'], es: ['bebé', 'hermano', 'hermana']}},
  {name: 'heart', hint: 'be kind, help someone, say thank you', words: {
    en: ['kind', 'help', 'thank', 'hug', 'share'], et: ['aita', 'aitäh', 'kalli', 'ole hea'], de: ['helfen', 'danke', 'nett', 'teilen'], es: ['ayudar', 'gracias', 'amable', 'compartir']}},
  {name: 'water', hint: 'drink water', words: {
    en: ['water', 'drink'], et: ['vesi', 'vett', 'joo'], de: ['wasser', 'trinken'], es: ['agua', 'beber']}},
  {name: 'fruit', hint: 'eat fruit, healthy snack', words: {
    en: ['fruit', 'apple', 'banana', 'snack'], et: ['puuvili', 'puuvilja', 'õun'], de: ['obst', 'apfel', 'banane'], es: ['fruta', 'manzana', 'plátano']}},
  {name: 'veggie', hint: 'eat vegetables', words: {
    en: ['vegetable', 'veggie', 'carrot', 'salad'], et: ['köögivili', 'köögivilja', 'porgand', 'salat'], de: ['gemüse', 'karotte', 'salat'], es: ['verdura', 'zanahoria', 'ensalada']}},
  {name: 'sun', hint: 'play outside, fresh air, sunscreen', words: {
    en: ['outside', 'outdoors', 'fresh air', 'sunscreen'], et: ['õues', 'õue', 'värske õhk', 'päike'], de: ['draußen', 'frische luft', 'sonne'], es: ['afuera', 'aire libre', 'sol']}},
  {name: 'mail', hint: 'get the mail, write a card or letter', words: {
    en: ['mail', 'post', 'letter', 'card'], et: ['post', 'kiri', 'kaart'], de: ['post', 'brief', 'karte'], es: ['correo', 'carta', 'postal']}},
  {name: 'star', hint: 'anything else', words: {en: [], et: [], de: [], es: []}},
] as const;

export type JobIconName = (typeof JOB_ICONS)[number]['name'];
export const JOB_ICON_NAMES: readonly JobIconName[] = JOB_ICONS.map(icon => icon.name);
export const FALLBACK_ICON: JobIconName = 'star';

/** Picks a job's icon from its title; async so an AI pick can replace the keyword match without other changes. */
export type IconPicker = (title: string) => Promise<JobIconName>;

/** Lower case, accents stripped ("Nõud" → "noud", "Zähne" → "zahne"), so parents' spelling and keyboards don't matter. */
const fold = (text: string) =>
  text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');

const KEYWORDS = JOB_ICONS.flatMap(icon => Object.values(icon.words).flat().map(word => ({icon: icon.name, word: fold(word)})));

/**
 * Keyword match: the longest matching word wins, so "Nõudepesumasin" is the dishwasher (table), not the washing
 * machine, and "wash the car" beats "wash". Words of 5+ letters match inside compounds and inflected forms
 * ("Geschirrspülmaschine", "kassile"); shorter ones must start a word, so "cat" doesn't match "education".
 */
export function matchIcon(title: string): JobIconName {
  const text = fold(title);
  const wordStarts = new Set([0, ...[...text.matchAll(/[^\p{L}\p{N}]+/gu)].map(m => m.index + m[0].length)]);
  let best: {icon: JobIconName; length: number} | undefined;
  for (const {icon, word} of KEYWORDS) {
    if (best && word.length <= best.length) continue;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
      if (word.length >= 5 || wordStarts.has(at)) {
        best = {icon, length: word.length};
        break;
      }
    }
  }
  return best?.icon ?? FALLBACK_ICON;
}

/**
 * The icon picker the API uses.
 *
 * AI HOOK (M4, not wired yet): ask Bedrock to choose one `name` from JOB_ICONS for the title (any language),
 * giving it each icon's `hint`. Accept the answer only if it is in JOB_ICON_NAMES, and fall back to
 * `matchIcon` on a bad answer, an error or a timeout of about a second. The parent can always change the icon.
 */
export const pickIcon: IconPicker = async title => matchIcon(title);
