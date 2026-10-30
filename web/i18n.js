/* MTGA Stats — idiomas. O texto da interface é escrito em português; EN traz a tradução para o inglês. */
"use strict";

const LANGS = ["pt", "en"];
const LANG = (() => {
  try { const s = localStorage.getItem("lang"); if (LANGS.includes(s)) return s; } catch (e) { /* sem storage */ }
  return "pt";
})();
const LOCALE = () => LANG === "en" ? "en-US" : "pt-BR";

/* t("{n} partidas", { n: 3 }) -> "3 matches" em inglês */
function t(s, vars) {
  let out = LANG === "en" ? (EN[s] ?? s) : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
  return out;
}
const tn = (n, one, many, vars) => t(n === 1 ? one : many, { n, ...vars });

function setLang(lang) {
  if (lang === LANG) return;
  try { localStorage.setItem("lang", lang); } catch (e) { /* sem storage */ }
  location.reload();   // recalcula formatos, filas e nomes das cartas já no novo idioma
}

/* Texto fixo do index.html: elementos com data-i18n usam o próprio texto em português como chave. */
function applyI18n(root = document) {
  document.documentElement.lang = LANG === "en" ? "en" : "pt-BR";
  root.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = t(el.innerHTML.trim()); });
  for (const attr of ["placeholder", "title", "aria-label"]) {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => el.setAttribute(attr, t(el.getAttribute(attr))));
  }
}

/* Cartas: em inglês mostra o nome e o tipo originais. */
const TYPES_EN = [["Mágica Instantânea", "Instant"], ["Instantânea", "Instant"], ["Criatura", "Creature"], ["Terreno", "Land"],
  ["Artefato", "Artifact"], ["Encantamento", "Enchantment"], ["Feitiço", "Sorcery"], ["Batalha", "Battle"], ["Tribal", "Kindred"]];
function localizeCard(c) {
  if (LANG !== "en" || !c) return c;
  if (c.name_en) c.name = c.name_en;
  if (c.types) c.types = TYPES_EN.reduce((s, [pt, en]) => s.replace(pt, en), c.types);
  return c;
}

const EN = {
  // menu e barra lateral
  "Visão geral": "Overview", "Formatos": "Formats", "Decks": "Decks", "Cartas": "Cards", "Oponentes": "Opponents",
  "Partidas": "Matches", "Limitado": "Limited", "Posso craftar esse deck?": "Can I craft this deck?",
  "Atualizar dados": "Refresh data", "Importar log…": "Import log…", "Alternar tema": "Toggle theme", "Idioma": "Language",
  "Lendo log…": "Reading log…", "Atualizado": "Up to date", "modo navegador": "browser mode", "Jogador": "Player",
  "{n} nova partida": "{n} new match", "{n} novas partidas": "{n} new matches",
  "{n} nova partida importada": "{n} new match imported", "{n} novas partidas importadas": "{n} new matches imported",
  "Erro ao ler log: {e}": "Error reading log: {e}", "Erro ao exibir: {e}": "Display error: {e}", "Erro ao verificar: {e}": "Error checking: {e}",
  "Construído": "Constructed",
  "Bronze": "Bronze", "Prata": "Silver", "Ouro": "Gold", "Platina": "Platinum", "Diamante": "Diamond", "Mítico": "Mythic",

  // filtros
  "Formato": "Format", "Fila": "Queue", "Melhor de": "Best of", "Período": "Period", "Deck": "Deck",
  "Todos": "All", "Todas": "All", "Todo o histórico": "All time", "Hoje": "Today",
  "Últimos 7 dias": "Last 7 days", "Últimos 30 dias": "Last 30 days", "Últimos 90 dias": "Last 90 days",
  "{a} de {b} partidas": "{a} of {b} matches",

  // formatos, filas, cores, raridades
  "Padrão": "Standard", "Histórico": "Historic", "Atemporal": "Timeless", "Alquimia": "Alchemy",
  "Brawl Histórico": "Historic Brawl", "Selado": "Sealed", "Outro": "Other",
  "Ranqueada": "Ranked", "Desafio direto": "Direct challenge", "Casual": "Play", "Evento": "Event",
  "Draft tradicional": "Traditional Draft", "Selado tradicional": "Traditional Sealed",
  "Incolor": "Colorless", "Branco": "White", "Azul": "Blue", "Preto": "Black", "Vermelho": "Red", "Verde": "Green",
  "{n} cor": "{n} color", "{n} cores": "{n} colors",
  "Comum": "Common", "Incomum": "Uncommon", "Rara": "Rare", "Mítica": "Mythic", "Básica": "Basic", "Ficha": "Token",
  "Vitória": "Win", "Derrota": "Loss", "Empate": "Draw",

  // textos comuns de gráficos e tabelas
  "Vitórias": "Wins", "Derrotas": "Losses", "Empates": "Draws", "Taxa de vitória": "Win rate",
  "Taxa de vitória: {p}": "Win rate: {p}", "taxa de vitória": "win rate", "partidas": "matches",
  "{n} partida": "{n} match", "{n} partidas": "{n} matches", "{w}V / {l}D": "{w}W / {l}L", "{w}V – {l}D": "{w}W – {l}L", " – {d}E": " – {d}D",
  "{w}V / {l}D em {n} jogos": "{w}W / {l}L in {n} games",
  "Sem partidas no filtro atual": "No matches in the current filter", "Sem dados no filtro atual": "No data in the current filter",
  "Sem partidas": "No matches", "Nada para mostrar no filtro atual": "Nothing to show in the current filter",
  "São necessárias ao menos 2 partidas": "At least 2 matches are needed",
  "Acumulada": "Cumulative", "Média móvel (10)": "Moving average (10)", "Semana de {d}": "Week of {d}",
  "V": "W", "D": "L", "% Vitória": "Win %", "Jogos V–D": "Games W–L", "Turnos/jogo": "Turns/game",
  "Deck mais usado": "Most played deck", "Tipo": "Type", "Outros": "Others", "{n} partidas ({p})": "{n} matches ({p})",
  "Data": "Date", "Resultado": "Result", "Jogos": "Games", "Início": "Start", "Turnos": "Turns", "Cores": "Colors",

  // visão geral
  "Resultados por dia": "Results per day", "Vitórias × derrotas": "Wins × losses",
  "Taxa de vitória ao longo do tempo": "Win rate over time", "acumulada e média móvel das últimas 10": "cumulative and moving average of the last 10",
  "Play × Draw": "Play × Draw", "por jogo": "per game", "Taxa de vitória por formato": "Win rate by format", "Decks mais usados": "Most played decks",
  "{n} deck usado": "{n} deck played", "{n} decks usados": "{n} decks played", "Jogos (games)": "Games",
  "taxa por jogo {p}": "per-game rate {p}", "Sequência atual": "Current streak",
  "{n} vitória": "{n} win", "{n} vitórias": "{n} wins", "{n} derrota": "{n} loss", "{n} derrotas": "{n} losses",
  "{n} empate": "{n} draw", "{n} empates": "{n} draws",
  "melhor: {n} vitória seguida": "best: {n} win in a row", "melhor: {n} vitórias seguidas": "best: {n} wins in a row",

  // formatos
  "Partidas por formato": "Matches by format", "Vitórias e derrotas por formato": "Wins and losses by format",
  "Resumo por formato": "Summary by format", "Resumo por evento": "Summary by event", "nome interno da fila no Arena": "Arena's internal queue name",

  // decks
  "Seus decks": "Your decks", "clique em um deck para ver os detalhes": "click a deck to see its details",
  "% Play": "Play %", "% Draw": "Draw %", "Última partida": "Last match", "← Todos os decks": "← All decks",
  "última: {d}": "last: {d}", "{n} jogos": "{n} games", "Turnos por jogo": "Turns per game", "média": "average",
  "Contra cada combinação de cores": "Against each color combination", "Histórico de mudanças": "Change history",
  "cartas que entraram e saíram entre uma partida e outra, com o desempenho de cada versão": "cards added and removed between matches, with each version's record",
  "Lista do deck": "Decklist", "Nenhuma lista registrada para este deck": "No decklist recorded for this deck",
  "Primeira lista registrada · {n} cartas": "First recorded list · {n} cards", "Entraram": "In", "Saíram": "Out",
  "Versão {n}": "Version {n}", "atual": "current", "Comandante": "Commander", "Terrenos": "Lands",
  "{n} cartas · versão {v} (atual) · por valor de mana, do menor para o maior": "{n} cards · version {v} (current) · by mana value, lowest to highest",

  // cartas
  "Minhas cartas": "My cards", "Cartas dos oponentes": "Opponents' cards", "Buscar carta…": "Search card…",
  "Mín. de jogos": "Min. games", "incluir terrenos": "include lands", "Cartas mais vistas": "Most seen cards",
  "Curva de mana": "Mana curve", "cartas distintas vistas, sem terrenos": "distinct cards seen, excluding lands",
  "Desempenho por carta": "Performance by card", "Suas cartas mais vistas": "Your most seen cards",
  "Cartas que você mais enfrentou": "Cards you faced most", "Desempenho das suas cartas": "Your cards' performance",
  "taxa de vitória nos jogos em que a carta foi comprada ou jogada": "win rate in games where the card was drawn or played",
  "sua taxa de vitória nos jogos em que o oponente mostrou a carta": "your win rate in games where the opponent showed the card",
  "{g} · {p} V": "{g} · {p} W", "Vista em {g} jogos — sua taxa de vitória: {p}": "Seen in {g} games — your win rate: {p}",
  "Nenhuma carta registrada no filtro atual": "No cards recorded in the current filter",
  "Valor de mana": "Mana value", "Custo {c}": "Cost {c}", "{n} cartas distintas": "{n} distinct cards", "Sem cartas": "No cards",
  "Carta": "Card", "Raridade": "Rarity", "Custo": "Cost", "Partidas no deck": "Matches in deck", "Partidas vista": "Matches seen",
  "Jogos vista": "Games seen", "% V quando vista": "Win % when seen", "Sua % V contra": "Your win % against",

  // oponentes
  "Sua taxa de vitória contra cada combinação de cores": "Your win rate against each color combination",
  "Cores mais enfrentadas": "Most faced colors", "presença de cada cor nos decks adversários": "share of opponent decks with each color",
  "Por combinação de cores": "By color combination", "Oponentes repetidos": "Repeat opponents", "Presença": "Presence",
  "Em {p} das partidas ({n})": "In {p} of matches ({n})", "Sua taxa de vitória: {p}": "Your win rate: {p}",
  "Sem cartas de oponentes registradas": "No opponent cards recorded", "Combinação": "Combination", "Oponente": "Opponent",
  "Último confronto": "Last faced", "Nenhum oponente enfrentado mais de uma vez": "No opponent faced more than once",

  // partidas
  "Histórico de partidas": "Match history", "clique em uma partida para ver as cartas": "click a match to see the cards",
  "Seu deck": "Your deck", "Cores do oponente": "Opponent colors", "nenhuma": "none",
  "Jogo {n}:": "Game {n}:", "vitória": "win", "derrota": "loss", "empate": "draw",
  "{n} turnos": "{n} turns", "{n} mulligan(s)": "{n} mulligan(s)", "evento: {e}": "event: {e}",
  "Suas cartas": "Your cards", "Cartas do oponente": "Opponent's cards",

  // limitado
  "Drafts realizados": "Drafts played", "clique em um draft para ver as partidas": "click a draft to see its matches",
  "Drafts": "Drafts", "drafts com {n} vitórias": "drafts with {n} wins", "Vitórias–Derrotas": "Wins–Losses",
  "Média de vitórias": "Average wins", "por draft": "per draft", "Melhor campanha": "Best run", "Coleção": "Set",
  "Cores do deck": "Deck colors", "Estrela": "Star", "Draft completo: {n} vitórias": "Complete draft: {n} wins",
  "Nenhuma partida de draft ou selado no filtro atual.<br>Jogue um evento limitado no Arena e clique em Atualizar dados.":
    "No draft or sealed matches in the current filter.<br>Play a limited event in Arena and click Refresh data.",

  // posso craftar esse deck?
  "cole no formato de exportação do Arena": "paste in Arena's export format", "Verificar": "Check", "Limpar": "Clear",
  "Verificando…": "Checking…", "Reler coleção do Arena": "Reread Arena collection", "Lendo…": "Reading…",
  "Cartas faltando e wildcards": "Missing cards and wildcards", "por raridade": "by rarity", "Cartas do deck": "Deck cards",
  "só as que faltam": "missing only", "Cole uma lista à esquerda e clique em Verificar.": "Paste a list on the left and click Check.",
  "comuns": "commons", "incomuns": "uncommons", "raras": "rares", "míticas": "mythics",
  "Comuns": "Commons", "Incomuns": "Uncommons", "Raras": "Rares", "Míticas": "Mythics",
  "comandante": "commander", "companheiro": "companion", "sideboard": "sideboard",
  "agora": "just now", "há {n} min": "{n} min ago", "há {n} h": "{n} h ago", "em {d}": "on {d}",
  "Coleção: <b>{n}</b> cartas ({c} cópias), lida do Arena {ago}.": "Collection: <b>{n}</b> cards ({c} copies), read from Arena {ago}.",
  "A coleção ainda não foi lida. Abra o MTG Arena e clique em Reler coleção.": "The collection hasn't been read yet. Open MTG Arena and click Reread collection.",
  " Usando a última leitura.": " Using the last reading.",
  "✓ dá para craftar · sobram {n}": "✓ craftable · {n} left over", "faltam {n} wildcards": "{n} wildcards short",
  "✓ nenhuma faltando": "✓ none missing", "carta falta": "card missing", "cartas faltam": "cards missing",
  "você tem <b>{n}</b> wildcards": "you have <b>{n}</b> wildcards",
  "Nenhuma carta reconhecida.": "No cards recognized.", "Confira se a lista está no formato “4 Nome da carta”.": "Check that the list uses the “4 Card name” format.",
  "Você já tem todas as cartas deste deck.": "You already own every card in this deck.", "{n} cartas na lista.": "{n} cards in the list.",
  "Dá para craftar!": "You can craft it!", "Faltam {n} cartas e você tem wildcards suficientes.": "{n} cards missing and you have enough wildcards.",
  "Ainda não dá para craftar.": "Not craftable yet.", "Faltam wildcards: {l}.": "Wildcards short: {l}.",
  "não encontradas: {l}": "not found: {l}", "{n} cartas · {m} faltando": "{n} cards · {m} missing",
  "No deck": "In deck", "Na coleção": "Owned", "Faltam": "Missing", "Nenhuma carta faltando.": "No cards missing.",
  "Não foi possível verificar.": "Couldn't check.",

  // avisos
  "<b>Nenhuma partida encontrada ainda.</b> No MTG Arena, abra <b>Opções → Conta</b> e marque <b>Registros detalhados (suporte a plug-ins)</b>; reinicie o jogo e jogue algumas partidas. Depois clique em <b>Atualizar dados</b>. O histórico é guardado pelo MTGA Stats, então as partidas continuam aqui mesmo depois que o Arena apaga o log.":
    "<b>No matches found yet.</b> In MTG Arena, open <b>Options → Account</b> and check <b>Detailed Logs (Plugin Support)</b>; restart the game and play a few matches. Then click <b>Refresh data</b>. MTGA Stats keeps the history, so matches stay here even after Arena clears its log.",
  "<b>Registros detalhados parecem desativados.</b> Sem eles o Arena não grava as partidas no log. Ative em <b>Opções → Conta → Registros detalhados (suporte a plug-ins)</b> e reinicie o jogo.":
    "<b>Detailed logs seem to be off.</b> Without them Arena doesn't write matches to the log. Turn them on in <b>Options → Account → Detailed Logs (Plugin Support)</b> and restart the game.",

  // mensagens vindas do Python
  "Player.log não encontrado. O MTG Arena já foi aberto neste computador?": "Player.log not found. Has MTG Arena been opened on this computer?",
  "Banco de cartas do Arena não encontrado": "Arena card database not found",
  "Banco de cartas do Arena não encontrado.": "Arena card database not found.",
  "Coleção ainda não lida.": "Collection not read yet.",
  "Sem permissão para ler o MTG Arena. Tente abrir o MTGA Stats como administrador.": "No permission to read MTG Arena. Try running MTGA Stats as administrator.",
  "Versão do Mono do Arena não reconhecida.": "Arena's Mono version not recognized.",
  "O Arena ainda está carregando. Tente de novo em alguns segundos.": "Arena is still loading. Try again in a few seconds.",
  "A leitura da coleção só funciona no Windows.": "Reading the collection only works on Windows.",
  "O MTG Arena não está aberto. Abra o jogo e tente de novo.": "MTG Arena isn't open. Open the game and try again.",
  "Entre no Arena (tela inicial) para que a coleção seja carregada.": "Log in to Arena (home screen) so the collection is loaded.",
  "Não foi possível ler a coleção agora (o Arena pode estar carregando). Tente de novo; se persistir, o Arena pode ter mudado de versão.":
    "Couldn't read the collection right now (Arena may be loading). Try again; if it keeps happening, Arena may have changed versions.",
  "A coleção ainda não foi carregada pelo Arena. Abra a tela inicial do jogo.": "Arena hasn't loaded the collection yet. Open the game's home screen.",
};
