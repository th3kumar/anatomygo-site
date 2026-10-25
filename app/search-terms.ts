import type {Atlas} from './anatomy';

/** What people search for, without sending what they type. A query is split into words; words from a fixed anatomy
 * vocabulary are kept and any other word becomes "?" ("left biceps johnny" → "left biceps ?"). The vocabulary is every
 * word in the atlas's names plus the everyday words below, which the atlas doesn't use. Searches that find nothing also
 * send their cleaned text (searchText), so missing names can be added; the About sheet says so. */
const EVERYDAY=`abs abdominals acl achilles adams apple ankle anus appendix arch arm armpit arse artery arteries back backbone belly
bicep biceps blood bladder bone bones bottom bowel bowels brain breast breastbone breasts bum butt buttock buttocks calf calves
cheek cheekbone chest chin clit clitoris coccyx collarbone collar colon core cranium delt delts disc discs ear eardrum ears elbow
eye eyeball eyes face fallopian femur finger fingers foot feet forearm forehead funny gallbladder gland glands glute glutes groin
gullet gum gums gut guts hamstring hamstrings hand hands head heart heel hip hips intestine intestines jaw jawbone joint joints
kidney kidneys knee kneecap knees lat lats leg legs ligament ligaments lip lips liver lung lungs lymph meniscus mouth muscle
muscles nail nails navel neck nerve nerves nipple nipples nose oesophagus esophagus ovaries ovary palm pancreas pec pecs pelvis
penis pinky prostate pubic pupil quad quads rib ribs rotator cuff sacrum scalp scrotum shin shinbone shoulder shoulders sinus
sinuses six pack skeleton skin skull sole spine spinal spleen sternum stomach tailbone teeth tendon tendons testes testicle
testicles thigh thighs throat thumb thyroid toe toes tongue tonsil tonsils tooth trap traps tricep triceps tummy uterus vagina
vein veins vertebra vertebrae voice box waist windpipe womb wrist`.split(/\s+/);

const words=(text:string)=>text.toLowerCase().normalize('NFKC').split(/[^\p{L}]+/u).filter(Boolean);
let vocabulary:{atlas:Atlas;words:Set<string>}|null=null;
function known(atlas:Atlas){
 if(vocabulary?.atlas!==atlas){const set=new Set(EVERYDAY);for(const c of atlas.concepts)for(const w of words(c.name))set.add(w);for(const p of atlas.parts)for(const w of words(p.name))set.add(w);vocabulary={atlas,words:set};}
 return vocabulary.words;
}

/** The query's words that are anatomy vocabulary, in order, with "?" for every other word. At most 100 characters. */
export function searchTerms(query:string,atlas:Atlas){const set=known(atlas);return words(query).map(w=>set.has(w)?w:'?').join(' ').slice(0,100);}

/** A search that found nothing, cleaned: lowercase letters only (no digits or symbols, so no numbers, addresses or
 * handles), words under 25 letters, at most 40 characters. */
export function searchText(query:string){return words(query).filter(w=>w.length<25).join(' ').slice(0,40).trim();}
