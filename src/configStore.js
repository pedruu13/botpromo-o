import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "data", "settings.json");

const defaultSettings = {
  minCommission: 0.05,
  blockedKeywords: [
    "biquíni", "biquini", "lingerie", "calcinha", "sutiã", "sutia",
    "moda praia", "fio dental", "body sensual", "réplica", "replica",
    "1 linha", "primeira linha", "fake", "falso", "tênis", "tenis",
    "camisa de time", "perfume contratipo"
  ]
};

export function loadSettings() {
  if (!fs.existsSync(configPath)) {
    saveSettings(defaultSettings);
    return defaultSettings;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erro ao ler settings.json", err);
    return defaultSettings;
  }
}

export function saveSettings(settings) {
  try {
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Erro ao salvar settings.json", err);
  }
}
