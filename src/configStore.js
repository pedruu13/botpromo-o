import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "data", "settings.json");

const defaultSettings = {
  minCommission: 0.05,
  minSales: 50,
  minRating: 4.5,
  minDiscount: 10,
  globalCoupon: "",
  isPaused: false,
  fetchInterval: 30,
  blockedKeywords: [
    "biquíni", "biquini", "lingerie", "calcinha", "sutiã", "sutia",
    "moda praia", "fio dental", "body sensual", "réplica", "replica",
    "1 linha", "primeira linha", "fake", "falso", "tênis", "tenis",
    "camisa de time", "perfume contratipo"
  ],
  activeCategories: [],
  categories: {
    "eletronicos": ["celular", "smartphone", "notebook", "pc", "fone", "smartwatch", "tv", "monitor", "teclado", "mouse", "gamer"],
    "casa": ["travesseiro", "sofá", "sofa", "panela", "cama", "mesa", "toalha", "liquidificador", "airfryer", "fritadeira", "aspirador"],
    "moda": ["camisa", "calça", "calca", "vestido", "sapato", "tênis", "tenis", "jaqueta", "moletom", "bolsa", "relógio"],
    "beleza": ["perfume", "maquiagem", "creme", "shampoo", "condicionador", "sabonete", "protetor", "batom", "secador", "chapinha"]
  }
};

export function loadSettings() {
  if (!fs.existsSync(configPath)) {
    saveSettings(defaultSettings);
    return defaultSettings;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
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
