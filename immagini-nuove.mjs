// Le immagini di Dokkan che mancano sul nostro sito, scaricate da sole: banner, pannelli, icone, disegni e animazioni
// delle carte nuove. L'utente, 2026-11-19: "non può succedere questo ogni volta che mettono un evento nuovo", poi "fai
// anche per i pg dai, deve essere tutto automatico". Lo stesso file gira in ognuno dei 9 repository delle immagini
// (.github/workflows/immagini.yml, ogni ora, a minuti diversi), dalla sua cartella, e scarica solo i file che vanno in
// quel repository (la divisione di src/dati/immagini-dokkan.ts). Legge il pacchetto dei dati pubblicato (ramo
// "pacchetto" di gachadex-releases, lo stesso della web app): i percorsi che i dati citano sul nostro sito (banner,
// pannelli, icone) più disegni e animazioni di ogni carta, come scripts/immagini-dokkandb.mts. Chiede a DokkanDB solo
// quelli che il repository non ha, una richiesta ogni 4 secondi, al massimo 60 per giro. Senza dipendenze (Node 22).
// Copia in D:\App\Gachadex\strumenti\immagini-dokkan-nuove (docs/dokkan.md, "Le immagini nuove, da sole").
//   node immagini-nuove.mjs [--prova] [--repo <nome>]   (--prova: dice cosa chiederebbe, nessuna richiesta a DokkanDB)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const PACCHETTO = "https://raw.githubusercontent.com/Axel3614/gachadex-releases/pacchetto";
const SPECCHIO = "https://enaskhebnjtktdfszdcb.supabase.co/storage/v1/object/public/assets/mirror";
const API = "https://api.dokkandb.com/api";
const ASSET = "https://api.dokkandb.com/assets";
const AGENTE = "Gachara-updater (+https://axel3614.github.io/gachara/)";
const PAUSA_MS = 4000;
const MASSIMO = 60;
// Quelli che DokkanDB non ha ancora (un evento appena annunciato, una carta senza animazione): si riprovano una volta
// al giorno per una settimana, poi basta. [primo tentativo, ultimo tentativo]; un primo a 0 vuol dire "mai più".
const FILE_MANCANTI = ".immagini-mancanti.json";
const GIORNO = 24 * 3600 * 1000;
const prova = process.argv.includes("--prova");
const argomento = (nome) => (process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined);
const REPO = argomento("--repo") ?? process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "gachara-dokkan";

// Il repository di un percorso: uguale a repositoryImmagineDokkan (src/dati/immagini-dokkan.ts, DIVISI 4 e 4).
export const repositoryDi = (p) => {
  const m = /^character\/(card|card_bg)\/(\d+)\//.exec(p);
  return m ? `gachara-dokkan-${m[1] === "card" ? "artwork" : "animazioni"}-${(Number(m[2]) / 10) % 4}` : "gachara-dokkan";
};
// I percorsi del nostro sito citati in un testo (i dati scrivono l'indirizzo intero).
export const percorsiCitati = (testo) => [
  ...new Set([...testo.matchAll(/gachara-dokkan(?:-[a-z]+-\d)?\/((?:banners|images|character)\/[\w./-]+?\.(?:png|jpg|webp|lwf))/g)].map((m) => m[1])),
];
// Disegni e animazioni di una carta (componenti/artwork-dokkan.tsx): la radice è idInterno o il numero alle decine.
export const fileDellaCarta = ({ id, idInterno }) => {
  const r = idInterno || String(Math.floor(Number(id) / 10) * 10);
  return [...["bg", "character", "effect"].map((s) => `character/card/${r}/card_${r}_${s}.png`), `character/card_bg/${r}/card_${r}.lwf`];
};
// Dove sta su DokkanDB: banner e pannelli nella sua copia a parte con lo stesso percorso; i file delle carte nella
// cartella "<nome>_folder" (il posto 0 di candidatiDokkanDB, quello che percorsi.json ha per tutti e quattro i tipi).
export const indirizzoDokkanDB = (p, v) => {
  if (p.startsWith("banners/") || p.startsWith("images/")) return `${SPECCHIO}/${p}`;
  const pezzi = p.split("/");
  const file = pezzi.pop();
  return `${ASSET}/${[...pezzi.slice(0, -1), `${pezzi.at(-1)}_folder`, file].join("/")}?v=${v}`;
};
// I pezzi di un'animazione (come pezziLwf dello script dell'utente): i fogli "lwf_image<n>.png" se ci sono, se no i
// "card_<numero>_<n>.png"; gli altri nomi sono ritagli dentro quei file.
export const pezziLwf = (p, corpo) => {
  const nomi = [...new Set(corpo.toString("latin1").match(/[\w-]+\.png/g) ?? [])];
  const fogli = nomi.filter((n) => /^lwf_image\d+\.png$/.test(n));
  return (fogli.length ? fogli : nomi.filter((n) => /^card_\d+_\d+\.png$/.test(n))).map((n) => `${dirname(p)}/${n}`);
};

// Prova veloce (sempre).
{
  const t = percorsiCitati('"https://axel3614.github.io/gachara-dokkan/banners/en/event/a.png","https://axel3614.github.io/gachara-dokkan-artwork-1/character/card/10/card_10_bg.png"');
  if (t.join() !== "banners/en/event/a.png,character/card/10/card_10_bg.png") throw new Error("percorsiCitati");
  if (repositoryDi("character/card_bg/1025730/card_1025730.lwf") !== "gachara-dokkan-animazioni-1" || repositoryDi("character/thumb/x/y.png") !== "gachara-dokkan") throw new Error("repositoryDi");
  if (fileDellaCarta({ id: "1034591", idInterno: "1034590" })[3] !== "character/card_bg/1034590/card_1034590.lwf" || fileDellaCarta({ id: "1018491" })[0] !== "character/card/1018490/card_1018490_bg.png") throw new Error("fileDellaCarta");
  if (indirizzoDokkanDB("character/thumb/card_1018490_thumb/card_1018490_thumb.png", "1.2") !== `${ASSET}/character/thumb/card_1018490_thumb_folder/card_1018490_thumb.png?v=1.2`) throw new Error("indirizzo icone");
  if (indirizzoDokkanDB("character/card_bg/1025730/card_1025730_0.png", "1.2") !== `${ASSET}/character/card_bg/1025730_folder/card_1025730_0.png?v=1.2`) throw new Error("indirizzo animazioni");
  if (pezziLwf("character/card_bg/10/card_10.lwf", Buffer.from("LWF..card_10_0.png..Images_img_bg.png..card_10_1.png")).join() !== "character/card_bg/10/card_10_0.png,character/card_bg/10/card_10_1.png") throw new Error("pezziLwf");
}

const chiedi = async (indirizzo) => {
  const r = await fetch(indirizzo, { headers: { "User-Agent": AGENTE } });
  return { r, corpo: Buffer.from(await r.arrayBuffer()) };
};

// 1. Cosa serve a questo repository.
const manifesto = JSON.parse((await chiedi(`${PACCHETTO}/manifesto.json`)).corpo.toString("utf8"));
const servono = new Set();
for (const [nome, { asset }] of Object.entries(manifesto.giochi?.dokkan?.file ?? {})) {
  const { r, corpo } = await chiedi(`${PACCHETTO}/${asset}`);
  if (!r.ok) throw new Error(`${r.status} ${asset}`);
  const testo = gunzipSync(corpo).toString("utf8");
  for (const p of percorsiCitati(testo)) servono.add(p);
  if (nome === "personaggi.json") for (const carta of JSON.parse(testo).personaggi) for (const p of fileDellaCarta(carta)) servono.add(p);
}
const miei = [...servono].filter((p) => repositoryDi(p) === REPO);

// 2. Cosa c'è già. Il repository è scaricato senza i file (--filter=blob:none): quelli che ha si leggono dall'albero.
const presenti = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n"));
const mancanti = existsSync(FILE_MANCANTI) ? JSON.parse(readFileSync(FILE_MANCANTI, "utf8")) : {};
const adesso = Date.now();
const daRiprovare = (p) => {
  const [primo, ultimo] = mancanti[p] ?? [];
  return primo === undefined || (primo > 0 && adesso - primo < 7 * GIORNO && adesso - ultimo >= GIORNO);
};
const coda = miei.filter((p) => !presenti.has(p) && daRiprovare(p)).sort();
console.log(`${REPO}: ${miei.length} file citati dai dati, ${coda.length} da chiedere (al massimo ${MASSIMO} in questo giro)`);
if (prova) {
  for (const p of coda.slice(0, MASSIMO)) console.log(`  ${p}`);
  process.exit(0);
}

// 3. Le richieste.
const versioni = JSON.parse((await chiedi(`${API}/cache-versions`)).corpo.toString("utf8"));
const v = `${versioni.site}.${versioni.database}`;
let richieste = 0;
let scaricati = 0;
// I pezzi di un'animazione appena scaricata si chiedono anche oltre il massimo (sono pochi): il giro dopo non li
// ritroverebbe, perché non stanno nei dati e il .lwf non è nella copia senza file.
const pezzi = new Set();
while (coda.length && (richieste < MASSIMO || pezzi.has(coda[0]))) {
  const p = coda.shift();
  if (richieste++) await new Promise((r) => setTimeout(r, PAUSA_MS));
  const { r, corpo } = await chiedi(indirizzoDokkanDB(p, v));
  if (r.status === 429) {
    console.log("429: DokkanDB chiede di rallentare, mi fermo");
    break;
  }
  // Un'immagine vera (PNG, JPEG o WebP: qualche .png è un JPEG col nome .png) o un'animazione ("LWF"): la risposta
  // dice text/plain anche quando è un'immagine.
  const buono = p.endsWith(".lwf") ? corpo.subarray(0, 3).toString("latin1") === "LWF" : /^(?:89504e47|ffd8ff|52494646)/.test(corpo.subarray(0, 4).toString("hex"));
  if (r.ok && buono) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, corpo);
    delete mancanti[p];
    scaricati++;
    console.log(`  ok ${p}`);
    if (p.endsWith(".lwf"))
      for (const x of pezziLwf(p, corpo))
        if (!presenti.has(x) && !coda.includes(x)) {
          pezzi.add(x);
          coda.unshift(x);
        }
  } else {
    mancanti[p] = [mancanti[p]?.[0] ?? adesso, adesso];
    console.log(`  manca ${p} (${r.status})`);
  }
}
writeFileSync(FILE_MANCANTI, JSON.stringify(mancanti, null, 1) + "\n");
console.log(`fatto: ${scaricati} scaricati`);
