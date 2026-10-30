# MTGA Stats

Aplicação desktop para analisar suas partidas do **MTG Arena**: vitórias e derrotas em gráficos,
desempenho por formato, decks mais usados, análise das cartas (suas e dos oponentes) e taxa de vitória
em Play × Draw.

Tudo roda localmente: o app lê o log que o próprio Arena grava no seu computador e guarda o histórico
num banco SQLite. Nenhum dado da sua conta é enviado para fora.

---

## 1. Requisitos

- **Windows 10 ou 11** (a janela usa o WebView2, que já vem no Windows).
- **MTG Arena** instalado (Steam, Epic ou instalador da Wizards).
- **Python 3.10 ou superior**, só para rodar a partir do código ou gerar o executável.
  Baixe em <https://www.python.org/downloads/> e marque *"Add Python to PATH"* na instalação.

## 2. Ative os registros detalhados no Arena (obrigatório)

Sem isso o Arena não grava as partidas no log e o app fica vazio.

1. Abra o MTG Arena.
2. Vá em **Opções (engrenagem) → Conta**.
3. Marque **"Registros detalhados (suporte a plug-ins)"**, em inglês *Detailed Logs (Plugin Support)*.
4. **Feche e abra o jogo de novo.**

Só as partidas jogadas **depois** de ativar a opção aparecem.

## 3. Instalação

```bash
git clone https://github.com/falcao00/mtganalizer.git
cd mtganalizer
```

Depois escolha uma das opções.

### Opção A: rodar direto (mais simples)

Dê dois cliques em **`run.bat`**. Na primeira vez ele cria um ambiente Python (`.venv`) e instala as
dependências; nas próximas abre direto.

Pelo terminal, o equivalente é:

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

### Opção B: gerar um executável

Dê dois cliques em **`build_exe.bat`**. Ao final aparece **`dist\MTGA Stats.exe`**, um arquivo único
que roda sem Python. Pode copiá-lo para qualquer lugar ou criar um atalho na área de trabalho.

### Opção C: pelo VS Code

Abra a pasta do projeto no VS Code:

- **Ctrl+Shift+B** gera o executável (`dist\MTGA Stats.exe`). Na primeira vez também cria o `.venv`
  e instala as dependências.
- **F5** abre o app com o depurador (precisa da extensão **Python** da Microsoft). Escolha
  "MTGA Stats (com DevTools)" para inspecionar a interface.
- Em **Terminal → Executar Tarefa…** também há a tarefa **Rodar app**.

> **Importante:** mantenha a pasta do projeto num local comum, como Documentos ou Downloads.
> Pastas internas de aplicativos empacotados (por exemplo, dentro de `AppData\Local\Packages`)
> impedem a janela de carregar o WebView2.

## 4. Como usar

1. Jogue normalmente no Arena.
2. Abra o MTGA Stats. Ele lê o log automaticamente ao abrir.
3. Se deixar o app aberto enquanto joga, ele confere o log a cada 15 segundos e adiciona as partidas
   novas sozinho. Também dá para clicar em **Atualizar dados** a qualquer momento.

### Não perca partidas

**O Arena apaga o log a cada vez que o jogo é aberto** e só mantém a sessão atual e a anterior
(`Player.log` e `Player-prev.log`). O MTGA Stats copia as partidas para o próprio banco, então:

- abra o app pelo menos uma vez a cada duas sessões de jogo, ou
- deixe o app aberto enquanto joga.

Partidas já importadas ficam guardadas para sempre, mesmo depois que o Arena apaga o log.

### Filtros

A barra no topo filtra **todas** as telas ao mesmo tempo:

| Filtro | O que faz |
|---|---|
| Formato | Padrão, Histórico, Brawl Histórico, Alquimia, Draft, Selado… |
| Fila | Ranqueada, Casual, Limitado, Evento, Desafio direto |
| Melhor de | Bo1 ou Bo3 |
| Período | Hoje, últimos 7/30/90 dias ou todo o histórico |
| Deck | Um deck específico |

### Telas

| Tela | O que mostra |
|---|---|
| **Visão geral** | Partidas, taxa de vitória, jogos (games), sequência atual, resultados por dia, evolução da taxa de vitória, Play × Draw, taxa por formato e decks mais usados (sem decks de draft/selado) |
| **Formatos** | Quanto você joga cada formato, vitórias e derrotas por formato, resumo por formato e por evento |
| **Decks** | Tabela com todos os seus decks. **Clique num deck** para ver a evolução, o desempenho contra cada combinação de cores, o **histórico de mudanças** (cartas que entraram e saíram entre as partidas, com o V–D de cada versão) e a **lista do deck** com as imagens das cartas por valor de mana |
| **Cartas** | Alterne entre **Minhas cartas** e **Cartas dos oponentes**: em quantos jogos apareceram, sua taxa de vitória e a curva de mana. Use a busca e o mínimo de jogos para filtrar |
| **Oponentes** | Sua taxa de vitória contra cada combinação de cores (Azorius, Golgari…), cores mais enfrentadas e oponentes repetidos |
| **Partidas** | Histórico completo. **Clique numa partida** para ver o resultado de cada jogo e as cartas vistas dos dois lados |
| **Limitado** | Seus drafts e selados: data, coleção (sigla, ex.: FRA), tipo (Quick, Premier, tradicional), cores do deck e placar de vitórias–derrotas. **Clique num draft** para ver as partidas dele |
| **Posso craftar esse deck?** | Cole uma lista de deck e veja quais cartas você já tem, quantas faltam por raridade e se suas wildcards bastam para craftar o deck (detalhes abaixo) |

Outras dicas:

- **Passe o mouse sobre o nome de uma carta** para ver a imagem dela (vem do Scryfall e precisa de internet).
- **Clique no cabeçalho de uma coluna** para ordenar a tabela.
- O botão **◐**, no canto inferior esquerdo, alterna entre tema claro e escuro.
- **Importar log…** carrega logs antigos que você tenha guardado (`Player.log` de outra data ou de outro PC).

### Lista do deck

Na tela de um deck, a **Lista do deck** mostra as imagens das cartas da versão atual, em colunas por
valor de mana, do menor para o maior: o comandante (em Brawl) vem primeiro e os terrenos no fim.
Cópias repetidas aparecem empilhadas com a quantidade (ex.: x4). As imagens vêm do Scryfall e precisam
de internet. O endereço de cada imagem é consultado só uma vez por carta e fica guardado no
banco local; depois disso o deck abre na hora, mesmo após fechar e abrir o app.

### Posso craftar esse deck?

1. Deixe o **MTG Arena aberto** (na tela inicial, já logado).
2. Exporte ou copie uma lista de deck (no Arena: **Decks → Exportar**; também funciona com listas de sites
   como MTGGoldfish, Moxfield e 17lands) e cole na caixa **Lista do deck**.
3. Clique em **Verificar** (ou `Ctrl+Enter`).

O app mostra:

- um resumo dizendo se **dá para craftar**, se você **já tem tudo** ou quantas wildcards faltam;
- a **legenda por raridade** (comuns, incomuns, raras e míticas): quantas cartas faltam e quantas
  wildcards você tem de cada tipo;
- a **lista de cartas**, com quantas o deck pede, quantas você tem e quantas faltam. Marque
  **só as que faltam** para ver apenas o que precisa craftar.

Como funciona:

- O log do Arena não informa mais quais cartas você possui. Por isso o app lê a coleção **direto da
  memória do Arena aberto** (somente leitura, como faz o Untapped.gg). A última leitura fica guardada,
  então com o Arena fechado o app usa a coleção da última vez e avisa a data.
- As wildcards vêm do Arena aberto ou, com ele fechado, do log.
- Cópias de qualquer edição contam: se você tem a carta numa coleção e a lista pede outra edição, ela
  não aparece como faltando. Terrenos básicos e cartas que você já tem 4 cópias nunca faltam.
- Quando a lista não indica a edição, a raridade usada é a da edição mais barata de craftar.
- Se o Arena receber uma atualização grande, a leitura da coleção pode parar de funcionar até o
  MTGA Stats ser ajustado. O resto do app continua normal.

## 5. Onde ficam os dados

| O quê | Caminho |
|---|---|
| Log do Arena (lido pelo app) | `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log` |
| Histórico do MTGA Stats | `%APPDATA%\MTGAStats\stats.db` |
| Nomes e dados das cartas | banco local do Arena: `MTGA_Data\Downloads\Raw\Raw_CardDatabase_*.mtga` |

Para fazer backup do seu histórico, copie o arquivo `stats.db`. Para começar do zero, apague-o.

## 6. Problemas comuns

| Sintoma | Solução |
|---|---|
| "Nenhuma partida encontrada" | Ative os registros detalhados (seção 2), reinicie o Arena e jogue uma partida |
| Aviso "Registros detalhados parecem desativados" | Mesma coisa: ative a opção e reinicie o jogo |
| Cartas aparecem como `#12345` | O banco de cartas do Arena não foi encontrado. Abra o Arena uma vez para ele baixar os dados e clique em **Atualizar dados** |
| A janela não abre / erro de WebView2 | Mova a pasta do projeto para Documentos ou Downloads (veja a seção 3) |
| Faltam partidas antigas | O Arena já tinha apagado o log antes da importação (veja "Não perca partidas") |
| "O MTG Arena não está aberto" em Posso craftar | Abra o Arena, entre na tela inicial e clique em **Reler coleção do Arena** |
| "Sem permissão para ler o MTG Arena" | O Arena foi aberto como administrador: abra o MTGA Stats como administrador também |
| Carta listada em "não encontradas" | O nome não existe no Arena (ou está escrito diferente). Confira a grafia, em inglês ou português |

## 7. Estrutura do código

```
app.py               janela desktop (pywebview) e API chamada pela interface
mtgastats/parser.py  leitura do Player.log: partidas, jogos, decks, cartas vistas, rank
mtgastats/store.py   banco SQLite com o histórico e importação incremental
mtgastats/carddb.py  leitura do banco de cartas do Arena (nomes em português)
mtgastats/collection.py leitura da coleção e das wildcards na memória do Arena (Windows)
mtgastats/craft.py   interpreta a lista de deck colada e compara com a coleção
web/                 interface: index.html, style.css, app.js
web/lib/             Chart.js 4.4.1 (gráficos, embutido para funcionar offline)
run.bat              abre o app (cria o ambiente na primeira vez)
build_exe.bat        gera dist\MTGA Stats.exe com PyInstaller
```

Para desenvolver com as ferramentas do navegador, rode `python app.py --debug`.
