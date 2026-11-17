const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const COULEURS = ["jaune", "rose", "bleu", "vert"];

const pool = new Pool();

let baseConnectee = false;

pool.on("error", () => {
  baseConnectee = false;
});

// Crée la table si elle n'existe pas.
// Si la base n'est pas prête, on réessaie dans 2 secondes.
async function connecterLaBase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS postits (
        id SERIAL PRIMARY KEY,
        texte TEXT NOT NULL,
        auteur TEXT NOT NULL,
        couleur TEXT NOT NULL,
        coeurs INTEGER NOT NULL DEFAULT 0
      )`);

    baseConnectee = true;
    console.log("Base connectée");
  } catch (err) {
    baseConnectee = false;
    console.log("Base non connectée, nouvel essai dans 2 s");
    setTimeout(connecterLaBase, 2000);
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Dit si l'appli tourne, si la base répond, et dans quel conteneur on est.
app.get("/api/sante", (req, res) => {
  res.json({
    base: baseConnectee ? "connectée" : "non connectée",
    conteneur: os.hostname(),
  });
});

app.get("/api/postits", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM postits ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(503).json({ erreur: "Base non connectée" });
  }
});

app.post("/api/postits", async (req, res) => {
  const texte = String(req.body.texte || "").trim();
  const auteur = String(req.body.auteur || "").trim() || "Anonyme";
  const couleur = req.body.couleur;

  if (texte === "" || texte.length > 100) {
    return res.status(400).json({ erreur: "Écris une idée de 100 lettres maximum." });
  }
  if (auteur.length > 20 || !COULEURS.includes(couleur)) {
    return res.status(400).json({ erreur: "Prénom trop long ou couleur inconnue." });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO postits (texte, auteur, couleur) VALUES ($1, $2, $3) RETURNING *",
      [texte, auteur, couleur]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(503).json({ erreur: "Base non connectée" });
  }
});

app.post("/api/postits/:id/coeur", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE postits SET coeurs = coeurs + 1 WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erreur: "Post-it introuvable" });
    res.json(rows[0]);
  } catch (err) {
    res.status(503).json({ erreur: "Base non connectée" });
  }
});

app.delete("/api/postits/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM postits WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ erreur: "Base non connectée" });
  }
});

app.listen(PORT, () => {
  console.log("Appli démarrée sur le port " + PORT);
  connecterLaBase();
});